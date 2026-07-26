import { describe, it, expect } from 'vitest'
import {
  calculateSniperScoreV2,
  calculateConfidence,
  evaluateHardBlocks,
  scoreBreakdown,
  freshnessWeight,
  marginPoints,
  SCORE_WEIGHTS,
  DEFAULT_THRESHOLDS,
  type ScoreMetrics,
  type ScoreEvidence,
  type HardBlockFacts,
  type ScoreMetricKey,
} from './score-engine'
import { calculateSniperScore } from './calculator'

const NOW = new Date('2026-07-26T00:00:00Z').getTime()

const perfectMetrics: ScoreMetrics = {
  demandScore: 5,
  priceCompetitivenessScore: 5,
  netMarginPct: 30,
  shippingStabilityScore: 5,
  riskLevel: 'LOW',
  competitionLevel: 'low',
  pageConvincingScore: 5,
  automationScore: 5,
}

function fullEvidence(overrides: ScoreEvidence = {}): ScoreEvidence {
  const keys = Object.keys(SCORE_WEIGHTS) as ScoreMetricKey[]
  const base = {} as ScoreEvidence
  for (const k of keys) {
    base[k] = { source: 'measured', capturedAt: '2026-07-25T00:00:00Z' }
  }
  return { ...base, ...overrides }
}

const cleanFacts: HardBlockFacts = {
  netMarginPct: 30,
  unitProfit: 15000,
  roiPct: 60,
  sellable: true,
  shippable: true,
  regulatoryCleared: true,
  ipCleared: true,
  supplierTrust: 0.9,
}

describe('배점 — 지시서 §8 유지', () => {
  it('8개 지표의 배점 합이 100이다', () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
  })

  it('구버전 calculateSniperScore와 같은 점수를 낸다', () => {
    // Score 2.0은 배점을 바꾸지 않는다. 판단 방식만 바뀐다.
    const cases: ScoreMetrics[] = [
      perfectMetrics,
      { ...perfectMetrics, netMarginPct: 12, riskLevel: 'HIGH', competitionLevel: 'high' },
      { ...perfectMetrics, demandScore: 2, priceCompetitivenessScore: 1, netMarginPct: 22 },
    ]

    for (const m of cases) {
      const v2 = scoreBreakdown(m)
      const v1 = calculateSniperScore({
        demandScore: m.demandScore,
        priceCompetitivenessScore: m.priceCompetitivenessScore,
        marginRate: m.netMarginPct,
        shippingStabilityScore: m.shippingStabilityScore,
        riskLevel: m.riskLevel,
        competitionLevel: m.competitionLevel,
        pageConvincingScore: m.pageConvincingScore,
        automationScore: m.automationScore,
      })
      expect(v2).toEqual(v1.breakdown)
    }
  })

  it('마진 구간이 계단식으로 유지된다', () => {
    expect(marginPoints(30)).toBe(20)
    expect(marginPoints(29.9)).toBe(16)
    expect(marginPoints(9.9)).toBe(0)
    expect(marginPoints(-50)).toBe(0)
  })
})

describe('데이터 신뢰도', () => {
  it('전 지표가 최근 측정치면 신뢰도가 1에 가깝다', () => {
    const { confidence } = calculateConfidence(fullEvidence(), NOW)
    expect(confidence).toBeCloseTo(1, 5)
  })

  it('근거가 아예 없으면 신뢰도 0이다', () => {
    const { confidence } = calculateConfidence({}, NOW)
    expect(confidence).toBe(0)
  })

  it('추정(inferred)은 측정(measured)보다 신뢰도가 낮다', () => {
    const measured = calculateConfidence(fullEvidence(), NOW).confidence
    const inferred = calculateConfidence(
      fullEvidence({ demand: { source: 'inferred', capturedAt: '2026-07-25T00:00:00Z' } }),
      NOW
    ).confidence

    expect(inferred).toBeLessThan(measured)
  })

  it('배점이 큰 지표의 근거 부실이 신뢰도를 더 크게 떨어뜨린다', () => {
    // demand는 20점, automation은 5점.
    const demandMissing = calculateConfidence(
      fullEvidence({ demand: { source: 'missing' } }),
      NOW
    ).confidence
    const automationMissing = calculateConfidence(
      fullEvidence({ automation: { source: 'missing' } }),
      NOW
    ).confidence

    expect(demandMissing).toBeLessThan(automationMissing)
  })

  it('오래된 데이터일수록 신선도 가중치가 낮다', () => {
    const day = 24 * 60 * 60 * 1000
    const at = (daysAgo: number) =>
      freshnessWeight(new Date(NOW - daysAgo * day).toISOString(), NOW)

    expect(at(0)).toBe(1)
    expect(at(7)).toBe(1)
    expect(at(30)).toBeLessThan(1)
    expect(at(30)).toBeGreaterThan(0.3)
    expect(at(60)).toBe(0.3)
    expect(at(365)).toBe(0.3)
  })

  it('수집 시각을 모르면 절반만 인정한다', () => {
    expect(freshnessWeight(null, NOW)).toBe(0.5)
    expect(freshnessWeight(undefined, NOW)).toBe(0.5)
    expect(freshnessWeight('not-a-date', NOW)).toBe(0.5)
  })
})

describe('하드블록 — 지시서 §8', () => {
  it('조건이 모두 충족되면 블록이 없다', () => {
    expect(evaluateHardBlocks(cleanFacts, 1.0)).toEqual([])
  })

  it('최저 순마진 미달을 차단한다', () => {
    const blocks = evaluateHardBlocks({ ...cleanFacts, netMarginPct: 10 }, 1.0)
    expect(blocks.map((b) => b.code)).toContain('BELOW_MIN_NET_MARGIN')
  })

  it('건당 이익 미달을 차단한다', () => {
    const blocks = evaluateHardBlocks({ ...cleanFacts, unitProfit: 500 }, 1.0)
    expect(blocks.map((b) => b.code)).toContain('BELOW_MIN_UNIT_PROFIT')
  })

  it('ROI 미달을 차단한다', () => {
    const blocks = evaluateHardBlocks({ ...cleanFacts, roiPct: 5 }, 1.0)
    expect(blocks.map((b) => b.code)).toContain('BELOW_MIN_ROI')
  })

  it('판매·배송 불가를 차단한다', () => {
    expect(
      evaluateHardBlocks({ ...cleanFacts, sellable: false }, 1.0).map((b) => b.code)
    ).toContain('NOT_SELLABLE')
    expect(
      evaluateHardBlocks({ ...cleanFacts, shippable: false }, 1.0).map((b) => b.code)
    ).toContain('NOT_SHIPPABLE')
  })

  it('규제·IP 미해결을 차단한다', () => {
    expect(
      evaluateHardBlocks({ ...cleanFacts, regulatoryCleared: false }, 1.0).map((b) => b.code)
    ).toContain('REGULATORY_UNRESOLVED')
    expect(
      evaluateHardBlocks({ ...cleanFacts, ipCleared: false }, 1.0).map((b) => b.code)
    ).toContain('IP_RISK_UNRESOLVED')
  })

  it('소싱처 신뢰도 미달을 차단한다', () => {
    const blocks = evaluateHardBlocks({ ...cleanFacts, supplierTrust: 0.3 }, 1.0)
    expect(blocks.map((b) => b.code)).toContain('UNTRUSTED_SUPPLIER')
  })

  it('신뢰도가 낮으면 데이터 부족으로 차단한다', () => {
    const blocks = evaluateHardBlocks(cleanFacts, 0.2)
    expect(blocks.map((b) => b.code)).toContain('MISSING_REQUIRED_DATA')
  })

  it('임계값 경계에서 통과시킨다', () => {
    const atThreshold: HardBlockFacts = {
      ...cleanFacts,
      netMarginPct: DEFAULT_THRESHOLDS.minNetMarginPct,
      unitProfit: DEFAULT_THRESHOLDS.minUnitProfit,
      roiPct: DEFAULT_THRESHOLDS.minRoiPct,
      supplierTrust: DEFAULT_THRESHOLDS.minSupplierTrust,
    }
    expect(evaluateHardBlocks(atThreshold, DEFAULT_THRESHOLDS.minConfidence)).toEqual([])
  })
})

describe('통합 판정', () => {
  it('점수가 높고 블록이 없으면 recommend', () => {
    const r = calculateSniperScoreV2(
      { metrics: perfectMetrics, evidence: fullEvidence(), facts: cleanFacts },
      NOW
    )
    expect(r.score).toBe(100)
    expect(r.hardBlocks).toEqual([])
    expect(r.verdict).toBe('recommend')
  })

  it('만점이어도 하드블록 하나면 reject — 점수가 위험을 상쇄하지 못한다', () => {
    const r = calculateSniperScoreV2(
      {
        metrics: perfectMetrics,
        evidence: fullEvidence(),
        facts: { ...cleanFacts, ipCleared: false },
      },
      NOW
    )

    expect(r.score).toBe(100)
    expect(r.verdict).toBe('reject')
    expect(r.hardBlocks.map((b) => b.code)).toEqual(['IP_RISK_UNRESOLVED'])
    expect(r.reasons[0]).toContain('점수 100점과 무관')
  })

  it('블록은 없지만 점수가 낮으면 review', () => {
    const r = calculateSniperScoreV2(
      {
        metrics: { ...perfectMetrics, demandScore: 1, priceCompetitivenessScore: 1 },
        evidence: fullEvidence(),
        facts: cleanFacts,
      },
      NOW
    )
    expect(r.score).toBeLessThan(75)
    expect(r.hardBlocks).toEqual([])
    expect(r.verdict).toBe('review')
  })

  it('근거 없이 만점을 주면 신뢰도 부족으로 reject된다', () => {
    // 지시서 §19 "근거 없는 수요·법규·가격 생성" 금지를 강제하는 지점.
    const r = calculateSniperScoreV2(
      { metrics: perfectMetrics, evidence: {}, facts: cleanFacts },
      NOW
    )

    expect(r.score).toBe(100)
    expect(r.confidence).toBe(0)
    expect(r.verdict).toBe('reject')
    expect(r.hardBlocks.map((b) => b.code)).toContain('MISSING_REQUIRED_DATA')
  })

  it('여러 블록이 동시에 잡힌다', () => {
    const r = calculateSniperScoreV2(
      {
        metrics: perfectMetrics,
        evidence: fullEvidence(),
        facts: {
          ...cleanFacts,
          netMarginPct: 1,
          unitProfit: 0,
          roiPct: 0,
          sellable: false,
        },
      },
      NOW
    )
    expect(r.hardBlocks.length).toBeGreaterThanOrEqual(4)
    expect(r.verdict).toBe('reject')
  })

  it('점수는 항상 0-100 안에 있다', () => {
    const worst = calculateSniperScoreV2(
      {
        metrics: {
          demandScore: -99,
          priceCompetitivenessScore: -99,
          netMarginPct: -1000,
          shippingStabilityScore: -99,
          riskLevel: 'HIGH',
          competitionLevel: 'high',
          pageConvincingScore: -99,
          automationScore: -99,
        },
        evidence: fullEvidence(),
        facts: cleanFacts,
      },
      NOW
    )
    expect(worst.score).toBeGreaterThanOrEqual(0)
    expect(worst.score).toBeLessThanOrEqual(100)
  })
})
