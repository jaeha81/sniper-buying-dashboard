// Task 저장 계층 — lib/task-engine.ts의 순수 전이 규칙을 DB에 반영한다.
//
// 엔진과 저장을 분리한 이유: 전이 규칙은 테스트 가능해야 하고(순수 함수),
// 저장 방식이 바뀌어도 규칙은 그대로여야 한다. 이 파일은 그 사이를 잇는다.
//
// 모든 상태 변경은 task_events에 append된다 — 지시서 §7 "이전 상태, 새 상태,
// 실행자, 근거, Task ID, 시각을 이벤트 로그에 기록한다."

import { createServiceClient } from './supabase/server'
import {
  buildIdempotencyKey,
  completeRun,
  failRun,
  isDuplicate,
  requireApproval,
  startRun,
  type TaskFailure,
  type TaskRecord,
  type TaskStatus,
  type TransitionResult,
} from './task-engine'
import { toLegacyAgentType, type EmployeeCode } from './employees'

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>

export type TaskActorType = 'owner' | 'operator' | 'autonomy' | 'automation' | 'system'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTask(row: Record<string, any>): TaskRecord {
  return {
    id: row.id,
    type: row.type,
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    assignedEmployeeId: row.assigned_employee_id ?? null,
    status: row.status,
    priority: Number(row.priority),
    input: row.input ?? {},
    output: row.output ?? null,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    requiresApproval: Boolean(row.requires_approval),
    idempotencyKey: row.idempotency_key,
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    scheduledAt: row.scheduled_at ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
  }
}

export interface CreateTaskInput {
  type: string
  entityType?: string | null
  entityId?: string | null
  /** 직원 코드. UUID는 이 함수가 조회해 채운다. */
  employeeCode?: EmployeeCode | null
  priority?: number
  input?: Record<string, unknown>
  requiresApproval?: boolean
  /** 멱등 키 scope. 같은 대상·같은 작업의 중복 생성을 막는다. */
  idempotencyScope?: Record<string, string | number | boolean | null | undefined>
  maxAttempts?: number
  actorType?: TaskActorType
  actorId?: string | null
  reason?: string
}

export type CreateTaskResult =
  | { created: true; task: TaskRecord }
  | { created: false; reason: 'duplicate'; existing: TaskRecord }
  | { created: false; reason: 'error'; message: string }

/**
 * Task를 만든다. 진행 중인 동일 작업이 있으면 만들지 않는다.
 *
 * DB에도 부분 unique index가 있지만(009), 경합이 아닌 일반적인 중복은
 * 여기서 먼저 걸러 의미 있는 결과를 돌려준다.
 */
export async function createTask(
  supabase: ServiceClient,
  spec: CreateTaskInput
): Promise<CreateTaskResult> {
  const idempotencyKey = buildIdempotencyKey(
    spec.type,
    spec.entityType ?? null,
    spec.entityId ?? null,
    spec.idempotencyScope ?? {}
  )

  const { data: existingRow } = await supabase
    .from('tasks')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingRow) {
    const existing = rowToTask(existingRow)
    if (isDuplicate(existing)) {
      return { created: false, reason: 'duplicate', existing }
    }
  }

  let employeeId: string | null = null
  if (spec.employeeCode) {
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('code', spec.employeeCode)
      .maybeSingle()

    employeeId = employee?.id ?? null
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      type: spec.type,
      entity_type: spec.entityType ?? null,
      entity_id: spec.entityId ?? null,
      assigned_employee_id: employeeId,
      status: 'queued',
      priority: spec.priority ?? 5,
      input: spec.input ?? {},
      requires_approval: spec.requiresApproval ?? false,
      idempotency_key: idempotencyKey,
      attempt: 0,
      max_attempts: spec.maxAttempts ?? 3,
    })
    .select()
    .single()

  if (error || !data) {
    // 부분 unique index 위반이면 경합으로 인한 중복이다.
    if (error?.code === '23505') {
      const { data: raced } = await supabase
        .from('tasks')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .limit(1)
        .maybeSingle()

      if (raced) return { created: false, reason: 'duplicate', existing: rowToTask(raced) }
    }

    return { created: false, reason: 'error', message: error?.message ?? 'Task 생성 실패' }
  }

  const task = rowToTask(data)

  await recordTaskEvent(supabase, {
    taskId: task.id,
    fromStatus: null,
    toStatus: 'queued',
    actorType: spec.actorType ?? 'system',
    actorId: spec.actorId ?? null,
    reason: spec.reason ?? `${spec.type} 작업 생성`,
  })

  return { created: true, task }
}

export interface TaskEventInput {
  taskId: string
  runId?: string | null
  fromStatus: TaskStatus | null
  toStatus: TaskStatus
  actorType: TaskActorType
  actorId?: string | null
  reason?: string | null
  detail?: Record<string, unknown> | null
}

/** 상태 전이를 append-only로 남긴다. 실패해도 본 작업을 막지 않는다. */
export async function recordTaskEvent(
  supabase: ServiceClient,
  event: TaskEventInput
): Promise<void> {
  const { error } = await supabase.from('task_events').insert({
    task_id: event.taskId,
    run_id: event.runId ?? null,
    from_status: event.fromStatus,
    to_status: event.toStatus,
    actor_type: event.actorType,
    actor_id: event.actorId ?? null,
    reason: event.reason ?? null,
    detail: event.detail ?? null,
  })

  if (error) console.error('[task-store] 이벤트 기록 실패:', error.message)
}

/** 전이 결과를 tasks에 반영하고 이벤트를 남긴다. */
async function applyTransition(
  supabase: ServiceClient,
  task: TaskRecord,
  result: TransitionResult,
  actor: { type: TaskActorType; id?: string | null },
  runId?: string | null
): Promise<TaskRecord | null> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: result.status,
      attempt: result.attempt,
      scheduled_at: result.scheduledAt,
      started_at: result.startedAt,
      completed_at: result.completedAt,
      error_code: result.errorCode,
      error_message: result.errorMessage,
    })
    .eq('id', task.id)
    // 낙관적 잠금: 다른 워커가 이미 상태를 바꿨으면 갱신되지 않는다.
    .eq('status', task.status)
    .select()
    .single()

  if (error || !data) {
    console.error('[task-store] 전이 반영 실패:', error?.message ?? '상태가 이미 변경됨')
    return null
  }

  await recordTaskEvent(supabase, {
    taskId: task.id,
    runId: runId ?? null,
    fromStatus: task.status,
    toStatus: result.status,
    actorType: actor.type,
    actorId: actor.id ?? null,
    reason: result.reason,
  })

  return rowToTask(data)
}

export interface RunContext {
  runId: string
  task: TaskRecord
}

/**
 * 실행을 시작한다. task_runs에 시도 1건을 남기고 상태를 running으로 옮긴다.
 * 낙관적 잠금에 걸리면(다른 워커가 이미 집어감) null.
 */
export async function beginRun(
  supabase: ServiceClient,
  task: TaskRecord,
  actor: { type: TaskActorType; id?: string | null } = { type: 'system' }
): Promise<RunContext | null> {
  const now = new Date()
  const transition = startRun(task, now)

  const updated = await applyTransition(supabase, task, transition, actor)
  if (!updated) return null

  const { data, error } = await supabase
    .from('task_runs')
    .insert({
      task_id: task.id,
      attempt: transition.attempt,
      status: 'running',
      input: task.input,
      started_at: now.toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[task-store] Run 생성 실패:', error?.message)
    return null
  }

  return { runId: data.id, task: updated }
}

export interface RunCost {
  model?: string | null
  promptVersion?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  costUsd?: number | null
  toolCalls?: unknown[] | null
}

/** 실행 성공. 지시서 §11: Run마다 비용·모델·프롬프트 버전을 남긴다. */
export async function finishRun(
  supabase: ServiceClient,
  ctx: RunContext,
  output: Record<string, unknown>,
  cost: RunCost = {},
  actor: { type: TaskActorType; id?: string | null } = { type: 'system' }
): Promise<void> {
  const now = new Date()

  await supabase
    .from('task_runs')
    .update({
      status: 'succeeded',
      output,
      completed_at: now.toISOString(),
      model: cost.model ?? null,
      prompt_version: cost.promptVersion ?? null,
      input_tokens: cost.inputTokens ?? null,
      output_tokens: cost.outputTokens ?? null,
      cost_usd: cost.costUsd ?? null,
      tool_calls: cost.toolCalls ?? null,
    })
    .eq('id', ctx.runId)

  const transition = completeRun(ctx.task, now)
  await applyTransition(supabase, ctx.task, transition, actor, ctx.runId)

  await supabase.from('tasks').update({ output }).eq('id', ctx.task.id)
}

/** 실행 실패. 재시도 여력에 따라 scheduled 또는 dead_letter로 간다. */
export async function abortRun(
  supabase: ServiceClient,
  ctx: RunContext,
  failure: TaskFailure,
  cost: RunCost = {},
  actor: { type: TaskActorType; id?: string | null } = { type: 'system' }
): Promise<TaskStatus | null> {
  const now = new Date()

  await supabase
    .from('task_runs')
    .update({
      status: 'failed',
      error_code: failure.code,
      error_message: failure.message,
      completed_at: now.toISOString(),
      model: cost.model ?? null,
      cost_usd: cost.costUsd ?? null,
    })
    .eq('id', ctx.runId)

  // 지터에 쓸 난수. 동시 실패한 태스크가 한꺼번에 재시도되지 않게 한다.
  const transition = failRun(ctx.task, failure, now, undefined, Math.random())
  const updated = await applyTransition(supabase, ctx.task, transition, actor, ctx.runId)

  return updated?.status ?? null
}

/** 승인 대기로 보낸다. */
export async function holdForApproval(
  supabase: ServiceClient,
  task: TaskRecord,
  reason: string,
  actor: { type: TaskActorType; id?: string | null } = { type: 'system' }
): Promise<TaskRecord | null> {
  return applyTransition(supabase, task, requireApproval(task, reason), actor)
}

// ─── 승인 ─────────────────────────────────────────────────────

export type ApprovalKind = 'listing' | 'price_change' | 'payment' | 'refund' | 'risk_release' | 'other'

export interface CreateApprovalInput {
  taskId?: string | null
  entityType?: string | null
  entityId?: string | null
  kind: ApprovalKind
  title: string
  summary?: string | null
  payload?: Record<string, unknown> | null
  irreversible?: boolean
  requestedBy?: string
  expiresAt?: string | null
}

export async function createApproval(
  supabase: ServiceClient,
  spec: CreateApprovalInput
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('approvals')
    .insert({
      task_id: spec.taskId ?? null,
      entity_type: spec.entityType ?? null,
      entity_id: spec.entityId ?? null,
      kind: spec.kind,
      status: 'pending',
      title: spec.title,
      summary: spec.summary ?? null,
      payload: spec.payload ?? null,
      irreversible: spec.irreversible ?? true,
      requested_by: spec.requestedBy ?? 'system',
      expires_at: spec.expiresAt ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[task-store] 승인 요청 생성 실패:', error?.message)
    return null
  }

  return { id: data.id }
}

/**
 * 승인·반려를 기록한다.
 *
 * 이미 처리된 승인은 다시 처리하지 않는다 — 반려된 등록이 나중에
 * 승인으로 뒤집히면 감사 기록과 실제 상태가 어긋난다.
 */
export async function resolveApproval(
  supabase: ServiceClient,
  approvalId: string,
  action: 'approve' | 'reject' | 'cancel',
  actor: { type: 'owner' | 'operator' | 'autonomy' | 'system'; id?: string | null },
  note?: string | null
): Promise<{ ok: boolean; message?: string }> {
  const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'

  const { data, error } = await supabase
    .from('approvals')
    .update({ status: nextStatus, resolved_at: new Date().toISOString() })
    .eq('id', approvalId)
    // pending만 처리한다.
    .eq('status', 'pending')
    .select('id, task_id')
    .single()

  if (error || !data) {
    return { ok: false, message: '이미 처리되었거나 존재하지 않는 승인 요청입니다.' }
  }

  await supabase.from('approval_actions').insert({
    approval_id: approvalId,
    action,
    actor_type: actor.type,
    actor_id: actor.id ?? null,
    note: note ?? null,
  })

  return { ok: true }
}

// ─── 조회 ─────────────────────────────────────────────────────

/** 지금 실행 가능한 태스크를 우선순위 순으로 가져온다. */
export async function claimableTasks(
  supabase: ServiceClient,
  limit = 20
): Promise<TaskRecord[]> {
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .or(`status.eq.queued,and(status.eq.scheduled,scheduled_at.lte.${nowIso})`)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[task-store] 대기열 조회 실패:', error.message)
    return []
  }

  return (data ?? []).map(rowToTask)
}

export interface EmployeeBoardRow {
  code: EmployeeCode
  name: string
  responsibility: string
  paused: boolean
  offline: boolean
  pausedReason: string | null
  totalRuns: number
  successRuns: number
  manualInterventions: number
  costUsd: number
  contributedProfitKrw: number
  lastActiveAt: string | null
  legacyAgentType: string
}

/** 직원 현황판 기초 데이터. 부하는 tasks에서 따로 집계한다. */
export async function employeeRows(supabase: ServiceClient): Promise<EmployeeBoardRow[]> {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('code', { ascending: true })

  if (error) {
    console.error('[task-store] 직원 조회 실패:', error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    code: row.code as EmployeeCode,
    name: row.name,
    responsibility: row.responsibility,
    paused: Boolean(row.paused),
    offline: Boolean(row.offline),
    pausedReason: row.paused_reason ?? null,
    totalRuns: Number(row.total_runs),
    successRuns: Number(row.success_runs),
    manualInterventions: Number(row.manual_interventions),
    costUsd: Number(row.cost_usd),
    contributedProfitKrw: Number(row.contributed_profit_krw),
    lastActiveAt: row.last_active_at ?? null,
    legacyAgentType: toLegacyAgentType(row.code as EmployeeCode),
  }))
}
