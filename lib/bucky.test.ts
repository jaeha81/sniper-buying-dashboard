import { describe, it, expect } from 'vitest'
import {
  decide,
  detectConflicts,
  derivePriority,
  planNextActions,
  assign,
  buildBriefing,
  NO_HISTORY_SUCCESS_RATE,
  type BuckyInput,
  type EmployeeReport,
  type AssignmentCandidate,
} from './bucky'
import { EMPLOYEES, type EmployeeWorkload, type EmployeePerformance } from './employees'
import type { ScoreResultV2 } from './score-engine'
import type { MarginResultV2 } from './margin-engine'

const healthyScore: ScoreResultV2 = {
  score: 88,
  breakdown: {
    demand: 20, priceCompetitiveness: 20, margin: 20, shippingStability: 12,
    customsRisk: 10, competition: 3, pageConvincing: 3, automation: 0,
  },
  confidence: 0.9,
  confidenceBreakdown: {
    demand: 1, priceCompetitiveness: 1, margin: 1, shippingStability: 1,
    customsRisk: 1, competition: 1, pageConvincing: 1, automation: 1,
  },
  hardBlocks: [],
  verdict: 'recommend',
  reasons: ['점수 88점이 추천 기준 이상이고 하드블록이 없습니다.'],
}

const healthyMargin: MarginResultV2 = {
  sourcingCost: 20000, internationalCost: 10000, sellingCost: 6500,
  domesticOpsCost: 4800, financialCost: 1740, totalCost: 43040,
  expectedNetProfit: 16960, expectedNetMarginPct: 28.3,
  upfrontCost: 30000, roiPct: 56.5,
}

function report(overrides: Partial<EmployeeReport> = {}): EmployeeReport {
  return {
    employee: 'market_research',
    summary: '국내 수요 양호',
    confidence: 0.85,
    evidenceRefs: ['https://example.com/a'],
    ...overrides,
  }
}

function input(overrides: Partial<BuckyInput> = {}): BuckyInput {
  return {
    productId: 'prod-001',
    score: healthyScore,
    margin: healthyMargin,
    reports: [report()],
    ...overrides,
  }
}

describe('상충 검출', () => {
  it('한 직원만 주장하면 상충이 아니다', () => {
    expect(detectConflicts([report({ claims: { demandScore: 4 } })])).toEqual([])
  })

  it('같은 값이면 상충이 아니다', () => {
    const conflicts = detectConflicts([
      report({ employee: 'market_research', claims: { demandScore: 4 } }),
      report({ employee: 'margin_pricing', claims: { demandScore: 4 } }),
    ])
    expect(conflicts).toEqual([])
  })

  it('허용 오차 안의 숫자 차이는 상충으로 보지 않는다', () => {
    // 3.0 vs 3.2 — 노이즈를 상충이라 부르면 검토 큐가 쓰레기로 찬다.
    const conflicts = detectConflicts([
      report({ employee: 'market_research', claims: { demandScore: 3.0 } }),
      report({ employee: 'margin_pricing', claims: { demandScore: 3.2 } }),
    ])
    expect(conflicts).toEqual([])
  })

  it('허용 오차를 넘는 숫자 차이는 상충이다', () => {
    const conflicts = detectConflicts([
      report({ employee: 'market_research', claims: { demandScore: 2 } }),
      report({ employee: 'margin_pricing', claims: { demandScore: 5 } }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].field).toBe('demandScore')
    expect(conflicts[0].employees).toEqual(['market_research', 'margin_pricing'])
  })

  it('문자열·불린은 완전 일치만 인정한다', () => {
    const conflicts = detectConflicts([
      report({ employee: 'compliance_risk', claims: { sellable: false } }),
      report({ employee: 'sourcing', claims: { sellable: true } }),
    ])
    expect(conflicts).toHaveLength(1)
  })

  it('둘 다 0이면 상충이 아니다', () => {
    const conflicts = detectConflicts([
      report({ employee: 'market_research', claims: { x: 0 } }),
      report({ employee: 'margin_pricing', claims: { x: 0 } }),
    ])
    expect(conflicts).toEqual([])
  })
})

describe('우선순위', () => {
  it('적자는 P0이다', () => {
    expect(
      derivePriority({ hardBlockCount: 0, expectedProfitKrw: -1, netMarginPct: -1, score: 95 })
    ).toBe('P0')
  })

  it('하드블록은 P1이다', () => {
    expect(
      derivePriority({ hardBlockCount: 1, expectedProfitKrw: 10000, netMarginPct: 25, score: 90 })
    ).toBe('P1')
  })

  it('고득점·고마진은 P1이다', () => {
    expect(
      derivePriority({ hardBlockCount: 0, expectedProfitKrw: 20000, netMarginPct: 30, score: 90 })
    ).toBe('P1')
  })

  it('낮은 점수는 P3이다', () => {
    expect(
      derivePriority({ hardBlockCount: 0, expectedProfitKrw: 1000, netMarginPct: 16, score: 55 })
    ).toBe('P3')
  })
})

describe('판정', () => {
  it('건강한 입력은 recommend', () => {
    const d = decide(input())
    expect(d.verdict).toBe('recommend')
    expect(d.hardBlocks).toEqual([])
    expect(d.requiresOwnerApproval).toBe(true)
  })

  it('비상정지는 다른 모든 판단보다 앞선다', () => {
    const d = decide(input({ emergencyStop: true }))
    expect(d.verdict).toBe('pause')
    expect(d.reasons[0]).toContain('비상정지')
  })

  it('비상정지가 하드블록보다 먼저 걸린다', () => {
    const d = decide(
      input({
        emergencyStop: true,
        score: {
          ...healthyScore,
          verdict: 'reject',
          hardBlocks: [{ code: 'NOT_SELLABLE', message: '판매 불가' }],
        },
      })
    )
    expect(d.verdict).toBe('pause')
  })

  it('예산 초과는 pause다', () => {
    const d = decide(input({ dailyBudgetUsd: 10, spentTodayUsd: 10 }))
    expect(d.verdict).toBe('pause')
    expect(d.reasons[0]).toContain('한도')
  })

  it('예산 한도 0은 무제한으로 본다', () => {
    const d = decide(input({ dailyBudgetUsd: 0, spentTodayUsd: 9999 }))
    expect(d.verdict).toBe('recommend')
  })

  it('하드블록은 점수와 무관하게 reject다', () => {
    const d = decide(
      input({
        score: {
          ...healthyScore,
          score: 100,
          verdict: 'reject',
          hardBlocks: [{ code: 'IP_RISK_UNRESOLVED', message: '상표 위험 미해소' }],
        },
      })
    )
    expect(d.verdict).toBe('reject')
    expect(d.reasons[0]).toContain('점수 100점과 무관')
  })

  it('직원이 막히면 review로 보낸다', () => {
    const d = decide(input({ reports: [report({ blockedReason: '스크랩 실패' })] }))
    expect(d.verdict).toBe('review')
    expect(d.reasons[0]).toContain('완료하지 못했습니다')
  })

  it('상충이 있으면 review로 보낸다', () => {
    const d = decide(
      input({
        reports: [
          report({ employee: 'market_research', claims: { demandScore: 1 } }),
          report({ employee: 'margin_pricing', claims: { demandScore: 5 } }),
        ],
      })
    )
    expect(d.verdict).toBe('review')
    expect(d.conflicts).toHaveLength(1)
  })

  it('신뢰도는 스코어와 직원 중 낮은 쪽을 따른다', () => {
    const d = decide(input({ reports: [report({ confidence: 0.3 })] }))
    expect(d.confidence).toBe(0.3)
  })

  it('근거 참조를 중복 없이 모은다', () => {
    const d = decide(
      input({
        reports: [
          report({ employee: 'market_research', evidenceRefs: ['a', 'b'] }),
          report({ employee: 'margin_pricing', evidenceRefs: ['b', 'c'] }),
        ],
      })
    )
    expect(d.evidenceRefs.sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('다음 행동 계획', () => {
  it('recommend는 콘텐츠 생성과 등록을 낸다', () => {
    const actions = planNextActions('recommend', [])
    expect(actions.map((a) => a.taskType)).toEqual(['generate_content', 'publish_listing'])
  })

  it('등록은 반드시 승인을 요구한다 — 지시서 §18', () => {
    const publish = planNextActions('recommend', []).find((a) => a.taskType === 'publish_listing')
    expect(publish?.requiresApproval).toBe(true)
  })

  it('규제·IP 차단은 재확인 작업을 낸다', () => {
    const actions = planNextActions('reject', [
      { code: 'REGULATORY_UNRESOLVED', message: '통관 미확인' },
    ])
    expect(actions.map((a) => a.taskType)).toEqual(['regulatory_check'])
  })

  it('되돌릴 수 없는 차단은 후속 작업을 만들지 않는다', () => {
    const actions = planNextActions('reject', [
      { code: 'BELOW_MIN_NET_MARGIN', message: '마진 미달' },
    ])
    expect(actions).toEqual([])
  })

  it('pause는 자동화 점검을 낸다', () => {
    expect(planNextActions('pause', []).map((a) => a.taskType)).toEqual(['health_check'])
  })
})

describe('배정', () => {
  function candidate(
    code: keyof typeof EMPLOYEES,
    workload: Partial<EmployeeWorkload> = {},
    performance: Partial<EmployeePerformance> = {}
  ): AssignmentCandidate {
    return {
      employee: EMPLOYEES[code],
      workload: {
        running: 0, queued: 0, waitingApproval: 0, retrying: 0,
        deadLetter: 0, paused: false, offline: false, ...workload,
      },
      performance: {
        totalRuns: 10, successRuns: 9, manualInterventions: 1, costUsd: 0, ...performance,
      },
    }
  }

  it('Task 종류를 담당하는 직원에게 배정한다', () => {
    const r = assign('market_analysis', [candidate('market_research'), candidate('content')])
    expect(r.employee).toBe('market_research')
  })

  it('담당자가 정의되지 않은 Task는 배정하지 않는다', () => {
    const r = assign('unknown_task_type', [candidate('market_research')])
    expect(r.employee).toBeNull()
    expect(r.reason).toContain('정의되지 않았습니다')
  })

  it('일시중지된 직원에게 배정하지 않는다', () => {
    const r = assign('market_analysis', [candidate('market_research', { paused: true })])
    expect(r.employee).toBeNull()
    expect(r.reason).toContain('일시중지')
  })

  it('오프라인 직원에게 배정하지 않는다', () => {
    const r = assign('market_analysis', [candidate('market_research', { offline: true })])
    expect(r.employee).toBeNull()
    expect(r.reason).toContain('오프라인')
  })

  it('후보에 아예 없으면 사유를 밝힌다', () => {
    const r = assign('market_analysis', [candidate('content')])
    expect(r.employee).toBeNull()
    expect(r.reason).toContain('후보 목록에 없습니다')
  })

  it('이력 없는 직원도 배정 대상이다', () => {
    // 성공률 0으로 취급하면 신입이 영원히 일을 못 받는다.
    const r = assign('market_analysis', [
      candidate('market_research', {}, { totalRuns: 0, successRuns: 0 }),
    ])
    expect(r.employee).toBe('market_research')
    expect(r.reason).toContain('이력 없음')
    expect(NO_HISTORY_SUCCESS_RATE).toBe(0.5)
  })
})

describe('브리핑', () => {
  it('데이터가 없으면 문장을 만들어내지 않는다', () => {
    const b = buildBriefing({
      pendingApprovals: [],
      deadLetterCount: 0,
      blockedProductCount: 0,
      negativeMarginProductCount: 0,
      emergencyStop: false,
    })
    expect(b.goals).toEqual([])
    expect(b.bottlenecks).toEqual([])
    expect(b.risks).toEqual([])
    expect(b.topApprovals).toEqual([])
  })

  it('적자 상품을 위험으로 올린다', () => {
    const b = buildBriefing({
      pendingApprovals: [],
      deadLetterCount: 0,
      blockedProductCount: 0,
      negativeMarginProductCount: 3,
      emergencyStop: false,
    })
    expect(b.risks[0]).toContain('적자 상품 3건')
    expect(b.goals).toContain('적자 상품 일시중지 또는 가격 조정')
  })

  it('비상정지를 위험 목록 맨 앞에 둔다', () => {
    const b = buildBriefing({
      pendingApprovals: [],
      deadLetterCount: 0,
      blockedProductCount: 0,
      negativeMarginProductCount: 1,
      emergencyStop: true,
    })
    expect(b.risks[0]).toContain('비상정지')
  })

  it('승인 대기를 우선순위 순으로 5건까지 뽑는다', () => {
    const b = buildBriefing({
      pendingApprovals: [
        { title: 'C', priority: 'P3' },
        { title: 'A', priority: 'P0' },
        { title: 'B', priority: 'P1' },
        { title: 'D', priority: 'P3' },
        { title: 'E', priority: 'P2' },
        { title: 'F', priority: 'P3' },
      ],
      deadLetterCount: 0,
      blockedProductCount: 0,
      negativeMarginProductCount: 0,
      emergencyStop: false,
    })
    expect(b.topApprovals).toHaveLength(5)
    expect(b.topApprovals[0]).toBe('[P0] A')
    expect(b.topApprovals[1]).toBe('[P1] B')
  })
})
