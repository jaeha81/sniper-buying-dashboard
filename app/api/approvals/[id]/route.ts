import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { clientIpFrom, recordAudit } from '@/lib/audit'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveApproval } from '@/lib/task-store'
import { checkGate } from '@/lib/safety-gate'
import { loadSafetyPolicy } from '@/lib/safety-store'

// POST /api/approvals/[id]  { action: 'approve' | 'reject' | 'cancel', note?: string }
//
// 지시서 §7·§18: 승인 전 외부 등록이 실행되지 않는다. 승인이 나면
// 연결된 Task를 큐로 되돌려 실행 경로로 보낸다 — 이 라우트가 직접
// 외부 채널을 호출하지는 않는다.

const ACTIONS = ['approve', 'reject', 'cancel'] as const
type Action = (typeof ACTIONS)[number]

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  // 승인은 owner만 할 수 있다. viewer/operator는 목록만 본다.
  if (session.role !== 'owner') {
    return NextResponse.json({ error: '승인 권한이 없습니다.' }, { status: 403 })
  }

  const { id } = await params

  let action: unknown
  let note: unknown
  try {
    ;({ action, note } = await request.json())
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json(
      { error: `action은 ${ACTIONS.join(' | ')} 중 하나여야 합니다.` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase가 구성되지 않았습니다.' }, { status: 503 })
  }

  const { data: approval } = await supabase
    .from('approvals')
    .select('id, task_id, kind, status, entity_type, entity_id, title, irreversible')
    .eq('id', id)
    .maybeSingle()

  if (!approval) {
    return NextResponse.json({ error: '승인 요청을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 승인이 비가역 작업으로 이어지면 안전 게이트를 먼저 확인한다.
  // 비상정지 중에 등록 승인을 통과시키면 정지가 무력화된다.
  if (action === 'approve' && approval.irreversible) {
    const { policy } = await loadSafetyPolicy()
    const channel = approval.kind === 'listing' ? 'channel_publish' : 'price_change'
    const gate = checkGate(channel, policy)

    if (!gate.allowed) {
      return NextResponse.json(
        { error: `승인을 처리할 수 없습니다 — ${gate.message}`, reason: gate.reason },
        { status: 423 }
      )
    }
  }

  const resolved = await resolveApproval(
    supabase,
    id,
    action as Action,
    { type: 'owner', id: session.userId },
    typeof note === 'string' ? note : null
  )

  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.message }, { status: 409 })
  }

  // 승인이면 연결된 Task를 실행 대기로 되돌린다.
  // needs_approval → running 전이는 task-engine이 허용한다.
  let taskRequeued = false
  if (action === 'approve' && approval.task_id) {
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'queued', requires_approval: false })
      .eq('id', approval.task_id)
      .in('status', ['needs_approval', 'queued'])

    taskRequeued = !error

    if (taskRequeued) {
      await supabase.from('task_events').insert({
        task_id: approval.task_id,
        from_status: 'needs_approval',
        to_status: 'queued',
        actor_type: 'owner',
        actor_id: session.userId,
        reason: `승인 완료 — ${approval.title}`,
      })
    }
  }

  // 반려면 연결된 Task를 취소한다. 승인 없이 실행되지 않게 한다.
  if (action === 'reject' && approval.task_id) {
    await supabase
      .from('tasks')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', approval.task_id)
      .in('status', ['needs_approval', 'queued', 'scheduled'])

    await supabase.from('task_events').insert({
      task_id: approval.task_id,
      to_status: 'cancelled',
      actor_type: 'owner',
      actor_id: session.userId,
      reason: `승인 반려 — ${approval.title}`,
    })
  }

  await recordAudit({
    actorType: 'owner',
    actorId: session.userId,
    action: `approval.${action}`,
    entityType: approval.entity_type ?? 'approval',
    entityId: approval.entity_id ?? id,
    before: { status: approval.status },
    after: { status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled', taskRequeued },
    reason: typeof note === 'string' && note ? note : approval.title,
    ip: clientIpFrom(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json({ ok: true, action, taskRequeued })
}
