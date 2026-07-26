import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  verifyWebhook,
  TIMESTAMP_TOLERANCE_SECONDS,
  type NonceStore,
} from '@/lib/webhook-auth'
import { recordAudit } from '@/lib/audit'
import { createTask } from '@/lib/task-store'
import { checkGate } from '@/lib/safety-gate'
import { loadSafetyPolicy } from '@/lib/safety-store'

// POST /api/webhooks/make/[scenario] — 지시서 §12·§14
//
// 앱이 작업 상태를 소유하고 Make.com은 외부 worker로 동작한다.
// 이 라우트는 Make가 결과를 돌려주는 콜백 지점이다.
//
// 보안: HMAC 서명 + timestamp 허용창 + nonce replay 방지.
// 기존 방식(정적 시크릿 헤더 비교)은 시크릿 노출 시 무제한 재사용 가능했다.

export const dynamic = 'force-dynamic'

/** 앱이 인정하는 시나리오. 임의 문자열을 받으면 감사 로그가 오염된다. */
const SCENARIOS = [
  'candidate_collect',
  'source_refresh',
  'market_data',
  'listing_publish',
  'price_stock_monitor',
  'order_sync',
  'notify',
  'daily_report',
] as const

type Scenario = (typeof SCENARIOS)[number]

/** Make 콜백이 만들 수 있는 Task 종류만 허용한다. */
const SCENARIO_TASK_TYPE: Partial<Record<Scenario, string>> = {
  candidate_collect: 'collect_candidate',
  source_refresh: 'watch_price',
  market_data: 'market_analysis',
  price_stock_monitor: 'watch_stock',
  order_sync: 'process_order',
}

/** DB 기반 nonce 저장소. 서버 인스턴스가 여러 개여도 replay를 막는다. */
class DbNonceStore implements NonceStore {
  constructor(
    private readonly supabase: NonNullable<ReturnType<typeof createServiceClient>>,
    private readonly scenario: string
  ) {}

  async seen(nonce: string, expiresAtEpochSeconds: number): Promise<boolean> {
    const { error } = await this.supabase.from('webhook_nonces').insert({
      nonce,
      scenario: this.scenario,
      expires_at: new Date(expiresAtEpochSeconds * 1000).toISOString(),
    })

    // 23505 = unique 위반 = 이미 처리한 요청.
    if (error?.code === '23505') return true

    if (error) {
      // 저장소가 고장 났으면 통과시키지 않는다. replay를 막을 수 없는
      // 상태에서 요청을 받으면 idempotency 보장이 깨진다.
      console.error('[make-webhook] nonce 저장 실패:', error.message)
      throw new Error('nonce 저장소를 사용할 수 없습니다.')
    }

    return false
  }
}

interface CallbackBody {
  /** Make 실행 ID. 양방향 추적용 (지시서 §12). */
  makeExecutionId?: string
  /** 앱이 만든 Task ID (있으면) */
  taskId?: string
  entityType?: string
  entityId?: string
  status?: 'success' | 'failed'
  payload?: Record<string, unknown>
  errorMessage?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ scenario: string }> }
) {
  const { scenario } = await params

  if (!(SCENARIOS as readonly string[]).includes(scenario)) {
    return NextResponse.json({ error: '알 수 없는 시나리오입니다.' }, { status: 404 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase가 구성되지 않았습니다.' }, { status: 503 })
  }

  // 서명 검증에 원문이 필요하다. 한 번만 읽고 이후엔 이 문자열을 쓴다.
  const rawBody = await request.text()

  let verification
  try {
    verification = await verifyWebhook(
      request.headers,
      rawBody,
      new DbNonceStore(supabase, scenario)
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'nonce 검증 실패' },
      { status: 503 }
    )
  }

  if (!verification.ok) {
    await recordAudit({
      actorType: 'automation',
      actorId: `make:${scenario}`,
      action: 'webhook.rejected',
      entityType: 'webhook',
      entityId: scenario,
      reason: `${verification.reason}: ${verification.message}`,
    })

    // 중복 콜백은 오류가 아니다. Make가 재시도한 것뿐이므로 200으로
    // 받아 넘긴다 — 401을 주면 Make가 계속 재시도한다(지시서 §12
    // "중복 callback은 idempotency로 무시").
    if (verification.reason === 'nonce_replayed') {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    return NextResponse.json({ error: verification.message }, { status: 401 })
  }

  let body: CallbackBody
  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 올바르지 않습니다.' }, { status: 400 })
  }

  // ── 기존 Task에 대한 결과 보고 ──────────────────────────────
  if (body.taskId) {
    const { data: task } = await supabase
      .from('tasks')
      .select('id, status, attempt')
      .eq('id', body.taskId)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ error: 'Task를 찾을 수 없습니다.' }, { status: 404 })
    }

    const succeeded = body.status !== 'failed'

    await supabase
      .from('tasks')
      .update({
        status: succeeded ? 'succeeded' : 'failed',
        output: body.payload ?? null,
        completed_at: succeeded ? new Date().toISOString() : null,
        error_message: succeeded ? null : (body.errorMessage ?? 'Make 시나리오 실패'),
        error_code: succeeded ? null : 'MAKE_SCENARIO_FAILED',
      })
      .eq('id', body.taskId)
      .in('status', ['running', 'queued', 'scheduled'])

    await supabase.from('task_events').insert({
      task_id: body.taskId,
      from_status: task.status,
      to_status: succeeded ? 'succeeded' : 'failed',
      actor_type: 'automation',
      actor_id: `make:${scenario}`,
      reason: succeeded ? 'Make 시나리오 성공' : (body.errorMessage ?? 'Make 시나리오 실패'),
      // Make 실행 ID를 남겨 양방향 추적이 가능하게 한다.
      detail: { makeExecutionId: body.makeExecutionId ?? null, scenario },
    })

    await recordAudit({
      actorType: 'automation',
      actorId: `make:${scenario}`,
      action: 'webhook.task_result',
      entityType: 'task',
      entityId: body.taskId,
      after: { status: succeeded ? 'succeeded' : 'failed', makeExecutionId: body.makeExecutionId },
      reason: `Make 콜백 (${scenario})`,
    })

    return NextResponse.json({ ok: true, taskId: body.taskId })
  }

  // ── 새 작업 생성 요청 ───────────────────────────────────────
  const taskType = SCENARIO_TASK_TYPE[scenario as Scenario]

  if (!taskType) {
    // notify / daily_report / listing_publish는 Make가 앱에 Task를 만들
      // 권한이 없다. 특히 listing_publish는 승인 게이트를 거쳐야 한다.
    return NextResponse.json(
      { error: `${scenario} 시나리오는 Task를 생성할 수 없습니다.` },
      { status: 403 }
    )
  }

  // 외부에서 들어온 요청도 안전 게이트를 통과해야 한다.
  const { policy } = await loadSafetyPolicy()
  const gate = checkGate('make_trigger', policy)
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.message, reason: gate.reason }, { status: 423 })
  }

  const created = await createTask(supabase, {
    type: taskType,
    entityType: body.entityType ?? null,
    entityId: body.entityId ?? null,
    priority: 5,
    input: { ...(body.payload ?? {}), makeExecutionId: body.makeExecutionId ?? null, scenario },
    // nonce가 유효창 안에서 유일하므로 멱등 키로 쓸 수 있다.
    idempotencyScope: { nonce: verification.nonce },
    actorType: 'automation',
    actorId: `make:${scenario}`,
    reason: `Make 시나리오 ${scenario} 요청`,
  })

  if (!created.created) {
    if (created.reason === 'duplicate') {
      return NextResponse.json({ ok: true, duplicate: true, taskId: created.existing.id })
    }
    return NextResponse.json({ error: created.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, taskId: created.task.id }, { status: 201 })
}

/** GET은 Make 시나리오 설정 시 연결 확인용이다. 서명을 요구하지 않는다. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scenario: string }> }
) {
  const { scenario } = await params
  const known = (SCENARIOS as readonly string[]).includes(scenario)

  return NextResponse.json(
    {
      scenario,
      known,
      requiredHeaders: ['x-sniper-signature', 'x-sniper-timestamp', 'x-sniper-nonce'],
      signaturePayload: '`${timestamp}.${nonce}.${rawBody}`를 HMAC-SHA256으로 서명 후 sha256= 접두사',
      timestampToleranceSeconds: TIMESTAMP_TOLERANCE_SECONDS,
      canCreateTask: known ? Boolean(SCENARIO_TASK_TYPE[scenario as Scenario]) : false,
    },
    { status: known ? 200 : 404 }
  )
}
