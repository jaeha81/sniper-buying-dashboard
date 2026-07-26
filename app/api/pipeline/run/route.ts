import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { clientIpFrom, recordAudit } from '@/lib/audit'
import { loadSafetyPolicy } from '@/lib/safety-store'
import { runDiscoveryPipeline } from '@/lib/orchestrator'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/pipeline/run
//
// 지시서 §18 완료 기준: "URL 하나로 후보 → Bucky 판정 → 승인 대기까지
// 실행·기록된다."
//
// 이 라우트는 승인 요청 생성까지만 한다. 외부 채널 등록은 승인을 통과한
// 뒤 별도 경로에서 일어난다.

const ALLOWED_SITES = ['iherb', 'amazon', 'vitacost', 'costco', 'other'] as const
type AllowedSite = (typeof ALLOWED_SITES)[number]

interface RunBody {
  url?: unknown
  site?: unknown
}

/** 환율을 fx_snapshots에서 읽는다. 없으면 상수로 폴백하고 그 사실을 표시한다. */
async function resolveExchangeRate(): Promise<{
  rate: number
  quality: 'REAL' | 'ESTIMATE' | 'MANUAL'
  snapshotId: string | null
}> {
  const supabase = createServiceClient()
  if (!supabase) return { rate: 1350, quality: 'ESTIMATE', snapshotId: null }

  const { data } = await supabase
    .from('fx_snapshots')
    .select('id, rate, data_quality')
    .eq('base_currency', 'USD')
    .eq('quote_currency', 'KRW')
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return { rate: 1350, quality: 'ESTIMATE', snapshotId: null }

  return {
    rate: Number(data.rate),
    quality: (data.data_quality as 'REAL' | 'ESTIMATE' | 'MANUAL') ?? 'ESTIMATE',
    snapshotId: data.id,
  }
}

export async function POST(request: Request) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  let body: RunBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const { url, site } = body

  if (typeof url !== 'string' || !url.trim()) {
    return NextResponse.json({ error: 'url이 필요합니다.' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'url 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  if (parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'https URL만 허용합니다.' }, { status: 400 })
  }

  const sourceSite: AllowedSite =
    typeof site === 'string' && (ALLOWED_SITES as readonly string[]).includes(site)
      ? (site as AllowedSite)
      : 'other'

  // 정책을 못 읽으면 fail-closed 정책이 돌아와 게이트에서 막힌다.
  const { policy, loaded, reason: policyReason } = await loadSafetyPolicy()
  const fx = await resolveExchangeRate()

  const result = await runDiscoveryPipeline({
    url: parsed.toString(),
    sourceSite,
    exchangeRate: fx.rate,
    exchangeRateQuality: fx.quality,
    fxSnapshotId: fx.snapshotId,
    policy,
    actorId: session.userId,
  })

  if (!result.ok) {
    await recordAudit({
      actorType: session.role,
      actorId: session.userId,
      action: 'pipeline.discover_url_failed',
      entityType: 'url',
      entityId: parsed.toString(),
      reason: `${result.stage}: ${result.reason}`,
      ip: clientIpFrom(request),
      userAgent: request.headers.get('user-agent'),
    })

    // 게이트·중복은 클라이언트가 고칠 수 있는 상태라 4xx로 구분한다.
    const status =
      result.stage === 'gate' ? 423 : result.stage === 'duplicate_check' ? 409 : 502

    return NextResponse.json(
      {
        error: result.reason,
        stage: result.stage,
        ...(loaded ? {} : { policyWarning: policyReason }),
      },
      { status }
    )
  }

  return NextResponse.json(
    {
      productId: result.productId,
      decision: result.decision,
      approvalId: result.approvalId,
      taskIds: result.taskIds,
      references: {
        scoreId: result.scoreId,
        marginCalculationId: result.marginCalculationId,
        decisionId: result.decisionId,
      },
      exchangeRate: { rate: fx.rate, dataQuality: fx.quality },
      ...(loaded ? {} : { policyWarning: policyReason }),
    },
    { status: 201 }
  )
}
