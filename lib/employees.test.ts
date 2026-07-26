import { describe, it, expect } from 'vitest'
import {
  EMPLOYEE_CODES,
  EMPLOYEES,
  EMPLOYEE_LIST,
  employeeCanUseTool,
  employeeForTaskType,
  toLegacyAgentType,
  deriveEmployeeState,
  successRate,
  manualInterventionRate,
  type EmployeeWorkload,
} from './employees'
import { AGENT_TYPES } from './agents'

function workload(overrides: Partial<EmployeeWorkload> = {}): EmployeeWorkload {
  return {
    running: 0, queued: 0, waitingApproval: 0, retrying: 0,
    deadLetter: 0, paused: false, offline: false, ...overrides,
  }
}

describe('직원 레지스트리 — 지시서 §5', () => {
  it('직원이 11명이다', () => {
    expect(EMPLOYEE_CODES).toHaveLength(11)
    expect(EMPLOYEE_LIST).toHaveLength(11)
  })

  it('코드와 정의가 일치한다', () => {
    for (const code of EMPLOYEE_CODES) {
      expect(EMPLOYEES[code].code).toBe(code)
    }
  })

  it('모든 직원에게 이름·업무·도구가 있다', () => {
    for (const def of EMPLOYEE_LIST) {
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.responsibility.length).toBeGreaterThan(0)
      expect(def.tools.length).toBeGreaterThan(0)
      expect(def.taskTypes.length).toBeGreaterThan(0)
    }
  })

  it('Task 종류가 직원 간에 중복되지 않는다', () => {
    // 중복되면 employeeForTaskType이 어느 쪽을 고를지 불확정해진다.
    const seen = new Map<string, string>()
    for (const def of EMPLOYEE_LIST) {
      for (const type of def.taskTypes) {
        expect(seen.has(type)).toBe(false)
        seen.set(type, def.code)
      }
    }
  })

  it('기존 5종 에이전트로 접힌다', () => {
    for (const code of EMPLOYEE_CODES) {
      expect(AGENT_TYPES).toContain(toLegacyAgentType(code))
    }
  })
})

describe('권한 — 도구 접근', () => {
  it('소싱 담당은 스크랩을 쓸 수 있다', () => {
    expect(employeeCanUseTool('sourcing', 'firecrawl.scrape')).toBe(true)
  })

  it('콘텐츠 담당은 채널 등록을 못 한다', () => {
    // 등록은 상품등록 담당만 한다.
    expect(employeeCanUseTool('content', 'channel.publish')).toBe(false)
    expect(employeeCanUseTool('listing', 'channel.publish')).toBe(true)
  })

  it('CS 담당은 주문을 수정할 수 없다', () => {
    expect(employeeCanUseTool('customer_service', 'db.order.read')).toBe(true)
    expect(employeeCanUseTool('customer_service', 'db.order.write')).toBe(false)
  })

  it('수익 담당은 읽기만 한다', () => {
    const def = EMPLOYEES.revenue_analytics
    const writeTools = def.tools.filter((t) => t.includes('.write') || t === 'channel.publish')
    expect(writeTools).toEqual([])
  })

  it('고객 알림 권한은 CS 담당만 갖는다', () => {
    const withNotice = EMPLOYEE_LIST.filter((d) => d.tools.includes('notify.customer'))
    expect(withNotice.map((d) => d.code)).toEqual(['customer_service'])
  })
})

describe('Task 종류 → 담당자', () => {
  it('정의된 Task는 담당자를 찾는다', () => {
    expect(employeeForTaskType('market_analysis')?.code).toBe('market_research')
    expect(employeeForTaskType('publish_listing')?.code).toBe('listing')
    expect(employeeForTaskType('calculate_profit')?.code).toBe('revenue_analytics')
  })

  it('정의되지 않은 Task는 null이다', () => {
    expect(employeeForTaskType('nonexistent_task')).toBeNull()
  })
})

describe('상태 산출', () => {
  it('아무 일도 없으면 idle', () => {
    expect(deriveEmployeeState(workload())).toBe('idle')
  })

  it('큐만 있으면 queued', () => {
    expect(deriveEmployeeState(workload({ queued: 3 }))).toBe('queued')
  })

  it('실행 중이면 working', () => {
    expect(deriveEmployeeState(workload({ running: 1, queued: 5 }))).toBe('working')
  })

  it('오프라인이 다른 모든 상태를 덮는다', () => {
    // 일하는 것처럼 보이는데 실제로 멈춰 있으면 안 된다.
    expect(deriveEmployeeState(workload({ offline: true, running: 5, deadLetter: 3 }))).toBe('offline')
  })

  it('일시중지가 작업 중보다 우선한다', () => {
    expect(deriveEmployeeState(workload({ paused: true, running: 2 }))).toBe('paused')
  })

  it('dead letter는 error로 올린다 — 사람이 봐야 하는 상태', () => {
    expect(deriveEmployeeState(workload({ deadLetter: 1, running: 3 }))).toBe('error')
  })

  it('재시도가 승인 대기보다 우선한다', () => {
    expect(deriveEmployeeState(workload({ retrying: 1, waitingApproval: 1 }))).toBe('retrying')
  })

  it('승인 대기가 작업 중보다 우선한다', () => {
    expect(deriveEmployeeState(workload({ waitingApproval: 1, running: 1 }))).toBe('waiting_approval')
  })
})

describe('성과 지표', () => {
  it('이력이 없으면 null이다 — 0%로 표시하면 실패한 것처럼 보인다', () => {
    const p = { totalRuns: 0, successRuns: 0, manualInterventions: 0, costUsd: 0 }
    expect(successRate(p)).toBeNull()
    expect(manualInterventionRate(p)).toBeNull()
  })

  it('성공률을 계산한다', () => {
    expect(
      successRate({ totalRuns: 10, successRuns: 8, manualInterventions: 0, costUsd: 0 })
    ).toBe(0.8)
  })

  it('수동 개입률을 계산한다', () => {
    expect(
      manualInterventionRate({ totalRuns: 10, successRuns: 8, manualInterventions: 3, costUsd: 0 })
    ).toBe(0.3)
  })
})
