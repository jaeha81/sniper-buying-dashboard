import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { clientIpFrom, recordAudit } from '@/lib/audit'
import { loadSafetyPolicy, saveSafetyPolicy } from '@/lib/safety-store'
import {
  CHANNEL_LABELS,
  SIDE_EFFECT_CHANNELS,
  currentEnvironment,
  PREVIEW_ALLOWED_CHANNELS,
  type SideEffectChannel,
} from '@/lib/safety-gate'
import { notifyAdmin } from '@/lib/notify'

// GET  /api/safety — 안전 정책 조회
// PUT  /api/safety — 전역 비상정지 / 채널별 차단 / 일일 비용 한도 변경
//
// 지시서 §16: 전역 Emergency Stop, 채널별 Kill Switch, 일일 한도.

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { policy, loaded, reason } = await loadSafetyPolicy()
  const environment = currentEnvironment()

  return NextResponse.json({
    policy,
    environment,
    // 프로덕션이 아니면 정책과 무관하게 대부분의 채널이 막혀 있다.
    // 화면이 "왜 실행이 안 되지?"를 설명할 수 있어야 한다.
    environmentBlocksSideEffects: environment !== 'production',
    previewAllowedChannels: PREVIEW_ALLOWED_CHANNELS,
    channels: SIDE_EFFECT_CHANNELS.map((code) => ({
      code,
      label: CHANNEL_LABELS[code],
      disabled: policy.disabledChannels.includes(code),
    })),
    migrationApplied: loaded,
    ...(loaded ? {} : { warning: reason }),
  })
}

interface UpdateBody {
  emergencyStop?: unknown
  disabledChannels?: unknown
  dailyBudgetUsd?: unknown
}

export async function PUT(request: Request) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  // 비상정지는 운영 전체를 멈추거나 재개하는 스위치다. owner만 만진다.
  if (session.role !== 'owner') {
    return NextResponse.json({ error: '안전 정책 변경 권한이 없습니다.' }, { status: 403 })
  }

  let body: UpdateBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const before = (await loadSafetyPolicy()).policy

  const update: Parameters<typeof saveSafetyPolicy>[0] = {}

  if (body.emergencyStop !== undefined) {
    if (typeof body.emergencyStop !== 'boolean') {
      return NextResponse.json({ error: 'emergencyStop은 boolean이어야 합니다.' }, { status: 400 })
    }
    update.emergencyStop = body.emergencyStop
  }

  if (body.disabledChannels !== undefined) {
    if (!Array.isArray(body.disabledChannels)) {
      return NextResponse.json({ error: 'disabledChannels는 배열이어야 합니다.' }, { status: 400 })
    }
    update.disabledChannels = body.disabledChannels as SideEffectChannel[]
  }

  if (body.dailyBudgetUsd !== undefined) {
    const n = Number(body.dailyBudgetUsd)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: 'dailyBudgetUsd는 0 이상의 숫자여야 합니다.' },
        { status: 400 }
      )
    }
    update.dailyBudgetUsd = n
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 })
  }

  const saved = await saveSafetyPolicy(update)
  if (!saved.ok) {
    return NextResponse.json({ error: saved.message }, { status: 400 })
  }

  const after = (await loadSafetyPolicy()).policy

  await recordAudit({
    actorType: 'owner',
    actorId: session.userId,
    action: 'safety.update',
    entityType: 'autonomy_settings',
    entityId: '1',
    before: {
      emergencyStop: before.emergencyStop,
      disabledChannels: before.disabledChannels,
      dailyBudgetUsd: before.dailyBudgetUsd,
    },
    after: {
      emergencyStop: after.emergencyStop,
      disabledChannels: after.disabledChannels,
      dailyBudgetUsd: after.dailyBudgetUsd,
    },
    reason: '안전 정책 변경',
    ip: clientIpFrom(request),
    userAgent: request.headers.get('user-agent'),
  })

  // 비상정지 전환은 즉시 통보한다. 조용히 켜지거나 꺼지면 안 된다.
  if (before.emergencyStop !== after.emergencyStop) {
    await notifyAdmin(
      after.emergencyStop
        ? '🛑 전역 비상정지가 켜졌습니다. 모든 외부 부작용 작업이 차단됩니다.'
        : '✅ 전역 비상정지가 해제되었습니다.',
      after.emergencyStop ? 'critical' : 'info',
      { 실행자: session.userId }
    )
  }

  return NextResponse.json({ ok: true, policy: after })
}
