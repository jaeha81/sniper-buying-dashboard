import { describe, it, expect } from 'vitest'
import {
  evaluatePromotion,
  evaluateDemotion,
  ceilingFor,
  tierRank,
  assignmentScore,
  rankForAssignment,
  deriveFeedback,
  PROMOTION_CRITERIA,
  NO_HISTORY_RATE,
  type ActionTrackRecord,
  type EmployeeScorecard,
} from './autonomy-tuning'

function track(overrides: Partial<ActionTrackRecord> = {}): ActionTrackRecord {
  return {
    actionType: 'price_update',
    autoRuns: 50,
    autoSuccesses: 49,
    humanReversals: 1,
    realizedLossKrw: 0,
    runsSinceLastFailure: 30,
    ...overrides,
  }
}

describe('자율성 상한 — 지시서 §2·§7', () => {
  it('비가역 작업은 절대 자동화하지 않는다', () => {
    for (const action of ['publish_listing', 'payment', 'refund', 'send_customer_notice']) {
      expect(ceilingFor(action)).toBe('never')
    }
  })

  it('방어적·가역 작업은 완전 자율까지 허용한다', () => {
    for (const action of ['pause_product', 'watch_price', 'market_analysis']) {
      expect(ceilingFor(action)).toBe('autopilot')
    }
  })

  it('가격 변경은 반자율까지만 허용한다', () => {
    expect(ceilingFor('price_update')).toBe('assisted')
  })

  it('정의되지 않은 액션은 보수적으로 manual로 본다', () => {
    expect(ceilingFor('some_new_action')).toBe('manual')
  })
})

describe('자율성 확대 판정', () => {
  it('실적이 충분하면 승격 가능하다', () => {
    const d = evaluatePromotion('price_update', 'manual', track())
    expect(d.eligible).toBe(true)
    expect(d.proposedTier).toBe('assisted')
  })

  it('승격은 항상 소유자 승인을 요구한다', () => {
    // 시스템이 스스로 권한을 넓히면 가드레일이 의미를 잃는다.
    const d = evaluatePromotion('price_update', 'manual', track())
    expect(d.requiresOwnerApproval).toBe(true)
  })

  it('비가역 작업은 어떤 실적으로도 승격되지 않는다', () => {
    const perfect = track({ autoRuns: 10000, autoSuccesses: 10000, humanReversals: 0, runsSinceLastFailure: 10000 })
    const d = evaluatePromotion('publish_listing', 'manual', perfect)

    expect(d.eligible).toBe(false)
    expect(d.blocks.map((b) => b.code)).toContain('AT_CEILING')
    expect(d.blocks[0].message).toContain('비가역')
  })

  it('상한에 닿으면 더 올라가지 않는다', () => {
    const d = evaluatePromotion('price_update', 'assisted', track({ autoRuns: 1000, autoSuccesses: 1000 }))
    expect(d.eligible).toBe(false)
    expect(d.blocks.map((b) => b.code)).toContain('AT_CEILING')
  })

  it('표본이 부족하면 승격하지 않는다', () => {
    const d = evaluatePromotion('price_update', 'manual', track({ autoRuns: 5, autoSuccesses: 5 }))
    expect(d.eligible).toBe(false)
    expect(d.blocks.map((b) => b.code)).toContain('INSUFFICIENT_SAMPLE')
  })

  it('성공률이 낮으면 승격하지 않는다', () => {
    const d = evaluatePromotion('price_update', 'manual', track({ autoRuns: 50, autoSuccesses: 30 }))
    expect(d.eligible).toBe(false)
    expect(d.blocks.map((b) => b.code)).toContain('LOW_SUCCESS_RATE')
  })

  it('사람이 자주 되돌리면 승격하지 않는다', () => {
    // 성공했지만 판단이 틀렸다는 뜻이다.
    const d = evaluatePromotion('price_update', 'manual', track({ autoRuns: 50, autoSuccesses: 50, humanReversals: 15 }))
    expect(d.eligible).toBe(false)
    const block = d.blocks.find((b) => b.code === 'HIGH_REVERSAL_RATE')
    expect(block?.message).toContain('판단이 틀렸다')
  })

  it('최근 실패가 있으면 승격하지 않는다', () => {
    const d = evaluatePromotion('price_update', 'manual', track({ runsSinceLastFailure: 2 }))
    expect(d.eligible).toBe(false)
    expect(d.blocks.map((b) => b.code)).toContain('RECENT_FAILURE')
  })

  it('실손실이 한 번이라도 있으면 승격하지 않는다', () => {
    // 손실 방지가 최상위 원칙이다.
    const d = evaluatePromotion('price_update', 'manual', track({ realizedLossKrw: 1 }))
    expect(d.eligible).toBe(false)
    expect(d.blocks.map((b) => b.code)).toContain('REALIZED_LOSS')
  })

  it('완전 자율 기준이 반자율보다 엄격하다', () => {
    expect(PROMOTION_CRITERIA.autopilot.minRuns).toBeGreaterThan(PROMOTION_CRITERIA.assisted.minRuns)
    expect(PROMOTION_CRITERIA.autopilot.minSuccessRate).toBeGreaterThan(
      PROMOTION_CRITERIA.assisted.minSuccessRate
    )
    expect(PROMOTION_CRITERIA.autopilot.maxReversalRate).toBeLessThan(
      PROMOTION_CRITERIA.assisted.maxReversalRate
    )
  })

  it('반자율 기준으로는 완전 자율에 못 간다', () => {
    // assisted 기준(20회/90%)은 통과하지만 autopilot 기준(100회/97%)은 미달.
    const d = evaluatePromotion('watch_price', 'assisted', track({ autoRuns: 30, autoSuccesses: 28 }))
    expect(d.proposedTier).toBe('autopilot')
    expect(d.eligible).toBe(false)
    expect(d.blocks.map((b) => b.code)).toContain('INSUFFICIENT_SAMPLE')
  })
})

describe('자율성 강등', () => {
  const base = { ...track(), consecutiveFailures: 0 }

  it('정상이면 강등하지 않는다', () => {
    expect(evaluateDemotion('price_update', 'assisted', base)).toBeNull()
  })

  it('manual·never는 더 내릴 곳이 없다', () => {
    expect(evaluateDemotion('price_update', 'manual', { ...base, realizedLossKrw: 100000 })).toBeNull()
    expect(evaluateDemotion('publish_listing', 'never', { ...base, realizedLossKrw: 100000 })).toBeNull()
  })

  it('강등은 승인을 기다리지 않는다', () => {
    // 위험을 줄이는 방향이므로 즉시 적용한다.
    const d = evaluateDemotion('price_update', 'assisted', { ...base, realizedLossKrw: 50000 })
    expect(d?.applyImmediately).toBe(true)
  })

  it('실손실이 나면 manual까지 내린다', () => {
    // 한 단계만 내리면 여전히 자동 실행 경로가 남는다.
    const d = evaluateDemotion('watch_price', 'autopilot', { ...base, realizedLossKrw: 10000 })
    expect(d?.demoteTo).toBe('manual')
    expect(d?.triggers.map((t) => t.trigger)).toContain('realized_loss')
  })

  it('성공률이 붕괴하면 강등한다', () => {
    const d = evaluateDemotion('watch_price', 'autopilot', {
      ...base,
      autoRuns: 50,
      autoSuccesses: 30,
    })
    expect(d).not.toBeNull()
    expect(d?.triggers.map((t) => t.trigger)).toContain('success_rate_collapse')
  })

  it('되돌림이 급증하면 강등한다', () => {
    const d = evaluateDemotion('watch_price', 'autopilot', {
      ...base,
      autoRuns: 50,
      autoSuccesses: 50,
      humanReversals: 20,
    })
    expect(d?.triggers.map((t) => t.trigger)).toContain('reversal_spike')
  })

  it('연속 실패가 쌓이면 강등한다', () => {
    const d = evaluateDemotion('watch_price', 'autopilot', { ...base, consecutiveFailures: 3 })
    expect(d?.triggers.map((t) => t.trigger)).toContain('consecutive_failures')
  })

  it('여러 사유가 동시에 잡힌다', () => {
    const d = evaluateDemotion('watch_price', 'autopilot', {
      ...base,
      autoRuns: 50,
      autoSuccesses: 20,
      humanReversals: 25,
      realizedLossKrw: 5000,
      consecutiveFailures: 5,
    })
    expect(d?.triggers.length).toBeGreaterThanOrEqual(4)
  })
})

describe('성과 기반 배정', () => {
  function card(overrides: Partial<EmployeeScorecard> = {}): EmployeeScorecard {
    return {
      employee: 'market_research',
      successRate: 0.9,
      avgCostUsd: 0.05,
      contributedProfitKrw: 0,
      activeLoad: 0,
      ...overrides,
    }
  }

  it('성공률이 높은 쪽이 앞선다', () => {
    const ranked = rankForAssignment([
      card({ employee: 'sourcing', successRate: 0.6 }),
      card({ employee: 'market_research', successRate: 0.95 }),
    ])
    expect(ranked[0].employee).toBe('market_research')
  })

  it('부하가 많으면 순위가 내려간다', () => {
    const light = card({ activeLoad: 0 })
    const heavy = card({ activeLoad: 10 })
    expect(assignmentScore(light)).toBeGreaterThan(assignmentScore(heavy))
  })

  it('성공률 차이가 부하보다 크게 작용한다', () => {
    // 부하 2건 차이가 성공률 30%p 차이를 뒤집으면 안 된다.
    const good = card({ successRate: 0.95, activeLoad: 2 })
    const bad = card({ successRate: 0.65, activeLoad: 0 })
    expect(assignmentScore(good)).toBeGreaterThan(assignmentScore(bad))
  })

  it('이력이 없는 직원도 배정 대상이다', () => {
    const rookie = card({ successRate: null })
    expect(assignmentScore(rookie)).toBeCloseTo(NO_HISTORY_RATE - 0.05 * 0 - 0.02 * 0.05, 5)
    expect(NO_HISTORY_RATE).toBe(0.5)
  })

  it('실적 좋은 직원이 신입보다 앞선다', () => {
    const ranked = rankForAssignment([card({ successRate: null }), card({ successRate: 0.9 })])
    expect(ranked[0].successRate).toBe(0.9)
  })
})

describe('실패 사례 환류', () => {
  it('발생 횟수가 적으면 조치를 제안하지 않는다', () => {
    expect(deriveFeedback([{ actionType: 'a', errorCode: 'TIMEOUT', count: 2, deadLetterCount: 2 }])).toEqual([])
  })

  it('재시도 가능한 오류가 dead letter로 가면 재시도 확대를 제안한다', () => {
    const actions = deriveFeedback([
      { actionType: 'watch_price', errorCode: 'TIMEOUT', count: 10, deadLetterCount: 8 },
    ])
    expect(actions[0].suggestion).toBe('increase_max_attempts')
  })

  it('스키마 오류는 입력 점검을 제안한다', () => {
    const actions = deriveFeedback([
      { actionType: 'market_analysis', errorCode: 'INVALID_INPUT', count: 5, deadLetterCount: 5 },
    ])
    expect(actions[0].suggestion).toBe('fix_input_schema')
  })

  it('재시도로 해결되지 않는 오류는 재시도 불가 표시를 제안한다', () => {
    const actions = deriveFeedback([
      { actionType: 'watch_price', errorCode: 'PERMISSION_DENIED', count: 5, deadLetterCount: 5 },
    ])
    expect(actions[0].suggestion).toBe('mark_non_retryable')
  })

  it('타임아웃이 반복되지만 dead letter가 적으면 자율성 하향을 제안한다', () => {
    const actions = deriveFeedback([
      { actionType: 'watch_price', errorCode: 'TIMEOUT', count: 15, deadLetterCount: 1 },
    ])
    expect(actions[0].suggestion).toBe('lower_tier')
  })
})

describe('등급 순서', () => {
  it('never < manual < assisted < autopilot', () => {
    expect(tierRank('never')).toBeLessThan(tierRank('manual'))
    expect(tierRank('manual')).toBeLessThan(tierRank('assisted'))
    expect(tierRank('assisted')).toBeLessThan(tierRank('autopilot'))
  })
})
