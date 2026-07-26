import { describe, it, expect } from 'vitest'
import { calculateMargin, calculateSniperScore, DEFAULT_EXCHANGE_RATE } from './calculator'
import type { MarginInput, SniperInput } from './types'

// 지시서 §19는 테스트 없는 마진·점수 변경을 금지한다.
// 이 파일은 Score 2.0과 마진 엔진 v2로 넘어가기 전의 기준선을 고정한다.

const baseMargin: MarginInput = {
  overseasPrice: 10, // USD
  exchangeRate: 1300,
  localShippingCost: 2, // USD
  internationalShippingCost: 5000, // KRW
  customsDuty: 1000,
  vat: 2000,
  domesticShippingCost: 3000,
  paymentFee: 700,
  otherCosts: 300,
  domesticExpectedPrice: 40000,
}

const baseSniper: SniperInput = {
  demandScore: 3,
  priceCompetitivenessScore: 3,
  marginRate: 20,
  shippingStabilityScore: 3,
  riskLevel: 'LOW',
  competitionLevel: 'medium',
  pageConvincingScore: 3,
  automationScore: 3,
}

describe('calculateMargin', () => {
  it('USD 항목을 환율로 변환해 총원가에 더한다', () => {
    const r = calculateMargin(baseMargin)

    expect(r.overseasPriceKRW).toBe(13000)
    expect(r.localShippingCostKRW).toBe(2600)
    expect(r.taxEstimate).toBe(3000)
    // 13000 + 2600 + 5000 + 3000 + 3000 + 700 + 300
    expect(r.totalCost).toBe(27600)
    expect(r.expectedMargin).toBe(40000 - 27600)
  })

  it('마진율은 판매가 대비 비율이다', () => {
    const r = calculateMargin(baseMargin)
    expect(r.marginRate).toBeCloseTo((12400 / 40000) * 100, 6)
  })

  it('판매가가 0이면 0으로 나누지 않고 마진율 0을 준다', () => {
    const r = calculateMargin({ ...baseMargin, domesticExpectedPrice: 0 })
    expect(r.marginRate).toBe(0)
    expect(Number.isFinite(r.marginRate)).toBe(true)
  })

  it('원가가 판매가를 넘으면 마진이 음수로 나온다', () => {
    // 손실을 0으로 뭉개면 손실 방지 게이트가 동작하지 않는다.
    const r = calculateMargin({ ...baseMargin, domesticExpectedPrice: 10000 })
    expect(r.expectedMargin).toBeLessThan(0)
    expect(r.marginRate).toBeLessThan(0)
  })

  it('환율이 오르면 원가가 오르고 마진이 줄어든다', () => {
    const low = calculateMargin({ ...baseMargin, exchangeRate: 1300 })
    const high = calculateMargin({ ...baseMargin, exchangeRate: 1450 })

    expect(high.totalCost).toBeGreaterThan(low.totalCost)
    expect(high.expectedMargin).toBeLessThan(low.expectedMargin)
  })

  it('기본 환율 상수는 1350이다', () => {
    expect(DEFAULT_EXCHANGE_RATE).toBe(1350)
  })
})

describe('calculateSniperScore', () => {
  it('세부 점수의 합이 총점과 일치한다', () => {
    const r = calculateSniperScore(baseSniper)
    const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0)
    expect(r.total).toBe(sum)
  })

  it('모든 지표가 최고면 100점이다', () => {
    const r = calculateSniperScore({
      demandScore: 5,
      priceCompetitivenessScore: 5,
      marginRate: 30,
      shippingStabilityScore: 5,
      riskLevel: 'LOW',
      competitionLevel: 'low',
      pageConvincingScore: 5,
      automationScore: 5,
    })
    expect(r.total).toBe(100)
  })

  it('배점은 지시서 §8과 같다', () => {
    const r = calculateSniperScore({
      demandScore: 5,
      priceCompetitivenessScore: 5,
      marginRate: 30,
      shippingStabilityScore: 5,
      riskLevel: 'LOW',
      competitionLevel: 'low',
      pageConvincingScore: 5,
      automationScore: 5,
    })
    expect(r.breakdown).toEqual({
      demand: 20,
      priceCompetitiveness: 20,
      margin: 20,
      shippingStability: 15,
      customsRisk: 10,
      competition: 5,
      pageConvincing: 5,
      automation: 5,
    })
  })

  it('마진율 구간별 점수가 계단식으로 매겨진다', () => {
    const at = (marginRate: number) =>
      calculateSniperScore({ ...baseSniper, marginRate }).breakdown.margin

    expect(at(35)).toBe(20)
    expect(at(30)).toBe(20)
    expect(at(29.9)).toBe(16)
    expect(at(25)).toBe(16)
    expect(at(20)).toBe(12)
    expect(at(15)).toBe(8)
    expect(at(10)).toBe(4)
    expect(at(9.9)).toBe(0)
    expect(at(-5)).toBe(0)
  })

  it('통관 리스크가 높을수록 점수가 낮다', () => {
    const at = (riskLevel: SniperInput['riskLevel']) =>
      calculateSniperScore({ ...baseSniper, riskLevel }).breakdown.customsRisk

    expect(at('LOW')).toBe(10)
    expect(at('MEDIUM')).toBe(6)
    expect(at('HIGH')).toBe(2)
  })

  it('경쟁이 심할수록 점수가 낮다', () => {
    const at = (competitionLevel: SniperInput['competitionLevel']) =>
      calculateSniperScore({ ...baseSniper, competitionLevel }).breakdown.competition

    expect(at('low')).toBe(5)
    expect(at('medium')).toBe(3)
    expect(at('high')).toBe(1)
  })

  it('1-5 범위를 벗어난 입력을 범위 안으로 자른다', () => {
    const r = calculateSniperScore({
      ...baseSniper,
      demandScore: 99,
      priceCompetitivenessScore: -3,
      shippingStabilityScore: 0,
      pageConvincingScore: 12,
      automationScore: -1,
    })

    expect(r.breakdown.demand).toBe(20)
    expect(r.breakdown.priceCompetitiveness).toBe(4)
    expect(r.breakdown.shippingStability).toBe(3)
    expect(r.breakdown.pageConvincing).toBe(5)
    expect(r.breakdown.automation).toBe(1)
    expect(r.total).toBeLessThanOrEqual(100)
  })

  it('총점은 항상 0-100 안에 있다', () => {
    const worst = calculateSniperScore({
      demandScore: 1,
      priceCompetitivenessScore: 1,
      marginRate: -100,
      shippingStabilityScore: 1,
      riskLevel: 'HIGH',
      competitionLevel: 'high',
      pageConvincingScore: 1,
      automationScore: 1,
    })

    expect(worst.total).toBeGreaterThanOrEqual(0)
    expect(worst.total).toBeLessThanOrEqual(100)
  })
})
