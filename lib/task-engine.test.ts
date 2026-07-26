import { describe, it, expect } from 'vitest'
import {
  canTransition,
  assertTransition,
  InvalidTransitionError,
  isTerminal,
  backoffDelayMs,
  hasRetriesLeft,
  startRun,
  completeRun,
  failRun,
  requireApproval,
  cancelTask,
  buildIdempotencyKey,
  isDuplicate,
  isTimedOut,
  isReadyToRun,
  compareTaskPriority,
  DEFAULT_RETRY_POLICY,
  type TaskRecord,
  type TaskStatus,
} from './task-engine'

const NOW = new Date('2026-07-26T00:00:00Z')

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    type: 'market_analysis',
    entityType: 'product',
    entityId: 'prod-001',
    assignedEmployeeId: null,
    status: 'queued',
    priority: 5,
    input: {},
    output: null,
    confidence: null,
    requiresApproval: false,
    idempotencyKey: 'market_analysis:product:prod-001',
    attempt: 0,
    maxAttempts: 3,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  }
}

describe('상태 전이', () => {
  it('종료 상태를 올바로 식별한다', () => {
    expect(isTerminal('succeeded')).toBe(true)
    expect(isTerminal('dead_letter')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('queued')).toBe(false)
    expect(isTerminal('failed')).toBe(false) // 재시도 여지가 있다
  })

  it('종료 상태에서는 어디로도 못 간다', () => {
    const all: TaskStatus[] = [
      'queued', 'scheduled', 'running', 'needs_approval',
      'succeeded', 'failed', 'dead_letter', 'cancelled',
    ]
    for (const to of all) {
      expect(canTransition('succeeded', to)).toBe(false)
      expect(canTransition('dead_letter', to)).toBe(false)
      expect(canTransition('cancelled', to)).toBe(false)
    }
  })

  it('성공한 태스크를 되돌려 실행할 수 없다', () => {
    // 재실행은 새 Task/Run을 만들어야 한다 (지시서 §11).
    expect(canTransition('succeeded', 'running')).toBe(false)
    expect(() => assertTransition('succeeded', 'running')).toThrow(InvalidTransitionError)
  })

  it('dead letter는 되살아나지 않는다', () => {
    expect(canTransition('dead_letter', 'queued')).toBe(false)
    expect(canTransition('dead_letter', 'running')).toBe(false)
  })

  it('정상 경로를 허용한다', () => {
    expect(canTransition('queued', 'running')).toBe(true)
    expect(canTransition('running', 'succeeded')).toBe(true)
    expect(canTransition('running', 'failed')).toBe(true)
    expect(canTransition('running', 'needs_approval')).toBe(true)
    expect(canTransition('failed', 'scheduled')).toBe(true)
    expect(canTransition('failed', 'dead_letter')).toBe(true)
    expect(canTransition('scheduled', 'running')).toBe(true)
    expect(canTransition('needs_approval', 'running')).toBe(true)
  })

  it('queued에서 곧바로 성공할 수 없다', () => {
    expect(canTransition('queued', 'succeeded')).toBe(false)
  })
})

describe('지수 백오프', () => {
  it('시도가 늘수록 대기가 길어진다', () => {
    const d1 = backoffDelayMs(1, DEFAULT_RETRY_POLICY, 0.5)
    const d2 = backoffDelayMs(2, DEFAULT_RETRY_POLICY, 0.5)
    const d3 = backoffDelayMs(3, DEFAULT_RETRY_POLICY, 0.5)

    expect(d2).toBeGreaterThan(d1)
    expect(d3).toBeGreaterThan(d2)
  })

  it('지터 0.5는 중앙값이라 흔들리지 않는다', () => {
    expect(backoffDelayMs(1, DEFAULT_RETRY_POLICY, 0.5)).toBe(DEFAULT_RETRY_POLICY.baseDelayMs)
    expect(backoffDelayMs(2, DEFAULT_RETRY_POLICY, 0.5)).toBe(DEFAULT_RETRY_POLICY.baseDelayMs * 2)
  })

  it('지터가 양방향으로 작동한다', () => {
    const low = backoffDelayMs(1, DEFAULT_RETRY_POLICY, 0)
    const mid = backoffDelayMs(1, DEFAULT_RETRY_POLICY, 0.5)
    const high = backoffDelayMs(1, DEFAULT_RETRY_POLICY, 1)

    expect(low).toBeLessThan(mid)
    expect(high).toBeGreaterThan(mid)
  })

  it('상한을 넘지 않는다', () => {
    const policy = { ...DEFAULT_RETRY_POLICY, maxDelayMs: 60_000, jitterRatio: 0 }
    expect(backoffDelayMs(20, policy, 0.5)).toBe(60_000)
  })

  it('음수 대기를 만들지 않는다', () => {
    const policy = { ...DEFAULT_RETRY_POLICY, jitterRatio: 5 }
    expect(backoffDelayMs(1, policy, 0)).toBeGreaterThanOrEqual(0)
  })

  it('재시도 여력을 정확히 센다', () => {
    expect(hasRetriesLeft(0, DEFAULT_RETRY_POLICY)).toBe(true)
    expect(hasRetriesLeft(2, DEFAULT_RETRY_POLICY)).toBe(true)
    expect(hasRetriesLeft(3, DEFAULT_RETRY_POLICY)).toBe(false)
    expect(hasRetriesLeft(4, DEFAULT_RETRY_POLICY)).toBe(false)
  })
})

describe('실행 전이', () => {
  it('실행 시작 시 attempt가 1 오른다', () => {
    const r = startRun(makeTask({ attempt: 0 }), NOW)
    expect(r.status).toBe('running')
    expect(r.attempt).toBe(1)
    expect(r.startedAt).toBe(NOW.toISOString())
  })

  it('성공하면 완료 시각이 찍힌다', () => {
    const r = completeRun(makeTask({ status: 'running', attempt: 1 }), NOW)
    expect(r.status).toBe('succeeded')
    expect(r.completedAt).toBe(NOW.toISOString())
    expect(r.errorCode).toBeNull()
  })

  it('재시도 여력이 있으면 scheduled로 가고 예약 시각이 잡힌다', () => {
    const task = makeTask({ status: 'running', attempt: 1 })
    const r = failRun(task, { code: 'TIMEOUT', message: '응답 없음' }, NOW, DEFAULT_RETRY_POLICY, 0.5)

    expect(r.status).toBe('scheduled')
    expect(r.errorCode).toBe('TIMEOUT')
    expect(r.scheduledAt).not.toBeNull()
    expect(new Date(r.scheduledAt!).getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('재시도를 소진하면 dead letter로 간다', () => {
    const task = makeTask({ status: 'running', attempt: 3, maxAttempts: 3 })
    const r = failRun(task, { code: 'TIMEOUT', message: '응답 없음' }, NOW)

    expect(r.status).toBe('dead_letter')
    expect(r.completedAt).toBe(NOW.toISOString())
    expect(r.reason).toContain('최대 재시도')
  })

  it('재시도 불가 오류는 여력이 남아도 곧장 dead letter로 간다', () => {
    const task = makeTask({ status: 'running', attempt: 1, maxAttempts: 5 })
    const r = failRun(task, { code: 'INVALID_INPUT', message: '스키마 불일치', retryable: false }, NOW)

    expect(r.status).toBe('dead_letter')
    expect(r.reason).toContain('재시도 불가')
  })

  it('태스크별 maxAttempts가 전역 정책보다 우선한다', () => {
    const task = makeTask({ status: 'running', attempt: 1, maxAttempts: 1 })
    const r = failRun(task, { code: 'E', message: 'e' }, NOW, DEFAULT_RETRY_POLICY)

    expect(r.status).toBe('dead_letter')
  })

  it('승인 대기로 보낼 수 있다', () => {
    const r = requireApproval(makeTask({ status: 'running' }), '가격 변동폭 초과')
    expect(r.status).toBe('needs_approval')
    expect(r.reason).toBe('가격 변동폭 초과')
  })

  it('취소는 사유와 완료 시각을 남긴다', () => {
    const r = cancelTask(makeTask({ status: 'queued' }), '중복 태스크', NOW)
    expect(r.status).toBe('cancelled')
    expect(r.reason).toBe('중복 태스크')
    expect(r.completedAt).toBe(NOW.toISOString())
  })

  it('허용되지 않은 전이는 예외를 던진다', () => {
    expect(() => startRun(makeTask({ status: 'succeeded' }), NOW)).toThrow(InvalidTransitionError)
    expect(() => completeRun(makeTask({ status: 'queued' }), NOW)).toThrow(InvalidTransitionError)
  })
})

describe('중복 방지', () => {
  it('같은 입력이면 같은 키가 나온다', () => {
    const a = buildIdempotencyKey('price_update', 'product', 'p1', { date: '2026-07-26' })
    const b = buildIdempotencyKey('price_update', 'product', 'p1', { date: '2026-07-26' })
    expect(a).toBe(b)
  })

  it('scope 키 순서가 달라도 같은 키가 나온다', () => {
    const a = buildIdempotencyKey('t', 'product', 'p1', { b: 2, a: 1 })
    const b = buildIdempotencyKey('t', 'product', 'p1', { a: 1, b: 2 })
    expect(a).toBe(b)
  })

  it('대상이 다르면 키가 다르다', () => {
    const a = buildIdempotencyKey('price_update', 'product', 'p1')
    const b = buildIdempotencyKey('price_update', 'product', 'p2')
    expect(a).not.toBe(b)
  })

  it('진행 중인 태스크만 중복으로 본다', () => {
    expect(isDuplicate({ status: 'queued' })).toBe(true)
    expect(isDuplicate({ status: 'running' })).toBe(true)
    expect(isDuplicate({ status: 'needs_approval' })).toBe(true)
    expect(isDuplicate({ status: 'failed' })).toBe(true)
  })

  it('종료된 태스크는 중복이 아니다 — 어제 한 일을 오늘 다시 할 수 있다', () => {
    expect(isDuplicate({ status: 'succeeded' })).toBe(false)
    expect(isDuplicate({ status: 'dead_letter' })).toBe(false)
    expect(isDuplicate({ status: 'cancelled' })).toBe(false)
    expect(isDuplicate(null)).toBe(false)
    expect(isDuplicate(undefined)).toBe(false)
  })
})

describe('타임아웃', () => {
  it('running으로 오래 방치되면 타임아웃이다', () => {
    const started = new Date(NOW.getTime() - 10 * 60_000).toISOString()
    expect(isTimedOut({ status: 'running', startedAt: started }, NOW)).toBe(true)
  })

  it('아직 시간 내면 타임아웃이 아니다', () => {
    const started = new Date(NOW.getTime() - 60_000).toISOString()
    expect(isTimedOut({ status: 'running', startedAt: started }, NOW)).toBe(false)
  })

  it('running이 아니면 타임아웃을 보지 않는다', () => {
    const started = new Date(NOW.getTime() - 10 * 60_000).toISOString()
    expect(isTimedOut({ status: 'queued', startedAt: started }, NOW)).toBe(false)
    expect(isTimedOut({ status: 'succeeded', startedAt: started }, NOW)).toBe(false)
  })

  it('시작 시각이 없으면 판단하지 않는다', () => {
    expect(isTimedOut({ status: 'running', startedAt: null }, NOW)).toBe(false)
  })
})

describe('실행 대기열', () => {
  it('queued는 바로 실행 가능하다', () => {
    expect(isReadyToRun({ status: 'queued', scheduledAt: null }, NOW)).toBe(true)
  })

  it('scheduled는 예약 시각이 지나야 실행한다', () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString()
    const past = new Date(NOW.getTime() - 60_000).toISOString()

    expect(isReadyToRun({ status: 'scheduled', scheduledAt: future }, NOW)).toBe(false)
    expect(isReadyToRun({ status: 'scheduled', scheduledAt: past }, NOW)).toBe(true)
  })

  it('실행 중이거나 종료된 태스크는 대기열에 오르지 않는다', () => {
    expect(isReadyToRun({ status: 'running', scheduledAt: null }, NOW)).toBe(false)
    expect(isReadyToRun({ status: 'succeeded', scheduledAt: null }, NOW)).toBe(false)
    expect(isReadyToRun({ status: 'dead_letter', scheduledAt: null }, NOW)).toBe(false)
  })

  it('우선순위가 높은(숫자가 작은) 것을 먼저 정렬한다', () => {
    const tasks = [
      { priority: 5, scheduledAt: null },
      { priority: 1, scheduledAt: null },
      { priority: 3, scheduledAt: null },
    ]
    const sorted = [...tasks].sort(compareTaskPriority)
    expect(sorted.map((t) => t.priority)).toEqual([1, 3, 5])
  })

  it('우선순위가 같으면 먼저 예약된 것을 앞세운다', () => {
    const early = new Date(NOW.getTime() - 60_000).toISOString()
    const late = new Date(NOW.getTime() + 60_000).toISOString()

    const sorted = [
      { priority: 5, scheduledAt: late },
      { priority: 5, scheduledAt: early },
    ].sort(compareTaskPriority)

    expect(sorted[0].scheduledAt).toBe(early)
  })
})

describe('전체 수명주기', () => {
  it('실패 → 재시도 → 성공 경로가 성립한다', () => {
    let task = makeTask()

    const r1 = startRun(task, NOW)
    task = { ...task, ...r1 }
    expect(task.status).toBe('running')
    expect(task.attempt).toBe(1)

    const r2 = failRun(task, { code: 'NET', message: '연결 실패' }, NOW)
    task = { ...task, ...r2 }
    expect(task.status).toBe('scheduled')

    const later = new Date(new Date(task.scheduledAt!).getTime() + 1000)
    const r3 = startRun(task, later)
    task = { ...task, ...r3 }
    expect(task.attempt).toBe(2)

    const r4 = completeRun(task, later)
    task = { ...task, ...r4 }
    expect(task.status).toBe('succeeded')
    expect(isTerminal(task.status)).toBe(true)
  })

  it('3회 모두 실패하면 dead letter에서 멈춘다', () => {
    let task = makeTask({ maxAttempts: 3 })

    for (let i = 0; i < 3; i++) {
      task = { ...task, ...startRun(task, NOW) }
      task = { ...task, ...failRun(task, { code: 'NET', message: '연결 실패' }, NOW) }
    }

    expect(task.attempt).toBe(3)
    expect(task.status).toBe('dead_letter')
    expect(isTerminal(task.status)).toBe(true)
    // 더 이상 실행 시도조차 할 수 없다.
    expect(() => startRun(task, NOW)).toThrow(InvalidTransitionError)
  })
})
