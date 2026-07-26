// Task·Run 엔진 — 지시서 §11.
//
// 기존 agent_tasks는 단일 테이블에 상태 하나만 들고 있었다. 재시도 횟수,
// 예약 시각, 오류 코드, 중복 방지 키가 없었고 실행 이력이 누적되지 않아
// "몇 번째 시도에서 왜 실패했는지"를 알 수 없었다.
//
// 이 파일은 상태 전이·백오프·중복 방지를 순수 함수로 구현한다. DB 접근은
// 하지 않는다 — 전이 규칙이 테스트 가능해야 하고(지시서 §19), 저장 계층이
// 바뀌어도 규칙은 그대로여야 하기 때문이다.

// ─── 상태 ─────────────────────────────────────────────────────

export const TASK_STATUSES = [
  'queued',
  'scheduled',
  'running',
  'needs_approval',
  'succeeded',
  'failed',
  'dead_letter',
  'cancelled',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/** 더 이상 전이하지 않는 상태. */
export const TERMINAL_STATUSES: readonly TaskStatus[] = [
  'succeeded',
  'dead_letter',
  'cancelled',
]

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/**
 * 허용된 상태 전이.
 *
 * 지시서 §7 "상태 전이는 서버에서만 수행한다"를 코드로 강제하는 지점이다.
 * 여기 없는 전이는 거부된다 — 예를 들어 succeeded에서 running으로 되돌릴 수
 * 없고(재실행은 새 Task/Run을 만든다), dead_letter는 되살아나지 않는다.
 */
const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ['running', 'scheduled', 'cancelled'],
  scheduled: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'needs_approval', 'cancelled'],
  needs_approval: ['running', 'cancelled', 'failed'],
  // 실패는 재시도 여력이 있으면 scheduled로, 없으면 dead_letter로 간다.
  failed: ['scheduled', 'dead_letter', 'cancelled'],
  succeeded: [],
  dead_letter: [],
  cancelled: [],
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: TaskStatus,
    readonly to: TaskStatus
  ) {
    super(`허용되지 않은 상태 전이입니다: ${from} → ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to)
}

// ─── 재시도 ───────────────────────────────────────────────────

export interface RetryPolicy {
  maxAttempts: number
  /** 첫 재시도 대기 (ms) */
  baseDelayMs: number
  /** 대기 상한 (ms) */
  maxDelayMs: number
  /** 지터 비율 0-1. 동시 실패한 태스크가 한꺼번에 몰리는 걸 막는다. */
  jitterRatio: number
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 30_000, // 30초
  maxDelayMs: 15 * 60_000, // 15분
  jitterRatio: 0.2,
}

/**
 * 지수 백오프 대기 시간.
 *
 * attempt는 방금 끝난 시도 횟수(1부터). 지터는 호출부가 넘긴 난수를 쓴다 —
 * 함수 안에서 Math.random()을 부르면 테스트할 수 없기 때문이다.
 *
 * @param random 0 이상 1 미만
 */
export function backoffDelayMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random = 0.5
): number {
  if (attempt < 1) return policy.baseDelayMs

  const exponential = policy.baseDelayMs * 2 ** (attempt - 1)
  const capped = Math.min(exponential, policy.maxDelayMs)

  // 지터는 ±jitterRatio 범위에서 대칭으로 흔든다.
  const jitterSpan = capped * policy.jitterRatio
  const offset = (random * 2 - 1) * jitterSpan

  return Math.max(0, Math.round(capped + offset))
}

export function hasRetriesLeft(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): boolean {
  return attempt < policy.maxAttempts
}

// ─── 태스크 ───────────────────────────────────────────────────

export interface TaskRecord {
  id: string
  type: string
  entityType: string | null
  entityId: string | null
  assignedEmployeeId: string | null
  status: TaskStatus
  priority: number
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  confidence: number | null
  requiresApproval: boolean
  idempotencyKey: string
  attempt: number
  maxAttempts: number
  scheduledAt: string | null
  startedAt: string | null
  completedAt: string | null
  errorCode: string | null
  errorMessage: string | null
}

export interface TaskFailure {
  code: string
  message: string
  /** false면 재시도하지 않고 바로 dead_letter로 보낸다. */
  retryable?: boolean
}

export interface TransitionResult {
  status: TaskStatus
  attempt: number
  scheduledAt: string | null
  startedAt: string | null
  completedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  /** 감사·이벤트 로그에 남길 사유 */
  reason: string
}

/** 실행 시작. attempt를 1 올린다. */
export function startRun(task: TaskRecord, now: Date): TransitionResult {
  assertTransition(task.status, 'running')

  return {
    status: 'running',
    attempt: task.attempt + 1,
    scheduledAt: null,
    startedAt: now.toISOString(),
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    reason: `${task.attempt + 1}회차 실행 시작`,
  }
}

/** 성공 종료. */
export function completeRun(task: TaskRecord, now: Date): TransitionResult {
  assertTransition(task.status, 'succeeded')

  return {
    status: 'succeeded',
    attempt: task.attempt,
    scheduledAt: null,
    startedAt: task.startedAt,
    completedAt: now.toISOString(),
    errorCode: null,
    errorMessage: null,
    reason: `${task.attempt}회차에 성공`,
  }
}

/**
 * 실패 처리.
 *
 * 재시도 여력이 있고 재시도 가능한 오류면 scheduled(백오프 후 재실행)로,
 * 아니면 dead_letter로 보낸다. 지시서 §11 "최대 재시도 후 dead-letter".
 */
export function failRun(
  task: TaskRecord,
  failure: TaskFailure,
  now: Date,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random = 0.5
): TransitionResult {
  const retryable = failure.retryable !== false
  const policyForTask: RetryPolicy = { ...policy, maxAttempts: task.maxAttempts }
  const canRetry = retryable && hasRetriesLeft(task.attempt, policyForTask)

  if (!canRetry) {
    return {
      status: 'dead_letter',
      attempt: task.attempt,
      scheduledAt: null,
      startedAt: task.startedAt,
      completedAt: now.toISOString(),
      errorCode: failure.code,
      errorMessage: failure.message,
      reason: retryable
        ? `최대 재시도 ${task.maxAttempts}회 소진 — dead letter로 이동`
        : `재시도 불가 오류(${failure.code}) — dead letter로 이동`,
    }
  }

  const delay = backoffDelayMs(task.attempt, policyForTask, random)

  return {
    status: 'scheduled',
    attempt: task.attempt,
    scheduledAt: new Date(now.getTime() + delay).toISOString(),
    startedAt: task.startedAt,
    completedAt: null,
    errorCode: failure.code,
    errorMessage: failure.message,
    reason: `${task.attempt}회차 실패(${failure.code}) — ${Math.round(delay / 1000)}초 후 재시도`,
  }
}

/** 승인 대기로 보낸다. 지시서 §7: 비가역 작업은 승인 게이트를 통과해야 한다. */
export function requireApproval(task: TaskRecord, reason: string): TransitionResult {
  assertTransition(task.status, 'needs_approval')

  return {
    status: 'needs_approval',
    attempt: task.attempt,
    scheduledAt: null,
    startedAt: task.startedAt,
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    reason,
  }
}

export function cancelTask(task: TaskRecord, reason: string, now: Date): TransitionResult {
  assertTransition(task.status, 'cancelled')

  return {
    status: 'cancelled',
    attempt: task.attempt,
    scheduledAt: null,
    startedAt: task.startedAt,
    completedAt: now.toISOString(),
    errorCode: null,
    errorMessage: null,
    reason,
  }
}

// ─── 중복 방지 ────────────────────────────────────────────────

/**
 * 멱등 키를 만든다.
 *
 * 같은 대상에 같은 종류의 작업이 중복 생성되는 걸 막는다. 예를 들어 가격
 * 감시가 5분마다 돌면서 같은 상품에 대해 같은 날 같은 인하 제안을 반복
 * 생성하는 상황을 차단한다.
 *
 * scope에는 중복 판단의 기준이 되는 값만 넣는다. 타임스탬프처럼 매번
 * 달라지는 값을 넣으면 멱등성이 사라진다.
 */
export function buildIdempotencyKey(
  type: string,
  entityType: string | null,
  entityId: string | null,
  scope: Record<string, string | number | boolean | null | undefined> = {}
): string {
  const scopeParts = Object.keys(scope)
    .sort()
    .map((k) => `${k}=${scope[k] ?? ''}`)
    .join('&')

  return [type, entityType ?? '-', entityId ?? '-', scopeParts].filter(Boolean).join(':')
}

/**
 * 이미 존재하는 태스크가 중복인지 판단한다.
 *
 * 종료된 태스크는 중복으로 보지 않는다 — 어제 성공한 작업을 오늘 다시
 * 못 하게 막으면 안 되기 때문이다. 아직 진행 중인 것만 중복으로 친다.
 */
export function isDuplicate(existing: Pick<TaskRecord, 'status'> | null | undefined): boolean {
  if (!existing) return false
  return !isTerminal(existing.status)
}

// ─── 타임아웃 ─────────────────────────────────────────────────

export const DEFAULT_TASK_TIMEOUT_MS = 5 * 60_000 // 5분

/**
 * running 상태로 너무 오래 방치된 태스크를 골라낸다.
 * 실행 중 프로세스가 죽으면 상태가 running에 멈춰 영원히 안 돌아온다.
 */
export function isTimedOut(
  task: Pick<TaskRecord, 'status' | 'startedAt'>,
  now: Date,
  timeoutMs: number = DEFAULT_TASK_TIMEOUT_MS
): boolean {
  if (task.status !== 'running' || !task.startedAt) return false

  const started = new Date(task.startedAt).getTime()
  if (!Number.isFinite(started)) return false

  return now.getTime() - started > timeoutMs
}

// ─── 실행 대기열 ──────────────────────────────────────────────

/**
 * 지금 실행 가능한 태스크인지.
 * scheduled는 예약 시각이 지나야 한다.
 */
export function isReadyToRun(
  task: Pick<TaskRecord, 'status' | 'scheduledAt'>,
  now: Date
): boolean {
  if (task.status === 'queued') return true
  if (task.status !== 'scheduled') return false
  if (!task.scheduledAt) return true

  return new Date(task.scheduledAt).getTime() <= now.getTime()
}

/** 우선순위(작을수록 먼저) → 예약 시각 순으로 정렬한다. */
export function compareTaskPriority(
  a: Pick<TaskRecord, 'priority' | 'scheduledAt'>,
  b: Pick<TaskRecord, 'priority' | 'scheduledAt'>
): number {
  if (a.priority !== b.priority) return a.priority - b.priority

  const at = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0
  const bt = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0
  return at - bt
}
