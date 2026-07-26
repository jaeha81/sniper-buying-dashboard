import { describe, it, expect } from 'vitest'
import {
  calculateMarginV2,
  simulateMargin,
  applyScenario,
  upgradeLegacyMarginInput,
  DEFAULT_SCENARIOS,
  type MarginInputV2,
} from './margin-engine'
import { calculateMargin } from './calculator'

// 판매가 50,000원짜리 기준 케이스.
const base: MarginInputV2 = {
  sellingPrice: 50000,
  sourcing: {
    productPrice: 10, // USD
    optionCost: 1,
    localTax: 0.5,
    localShipping: 2,
    paymentFee: 0.5,
  },
  international: {
    shipping: 5000,
    volumetricSurcharge: 1000,
    insurance: 500,
    customsDuty: 1200,
    importVat: 2400,
    customsFee: 800,
  },
  selling: {
    marketplaceFeePct: 10,
    paymentFeePct: 3,
    adCost: 2000,
    couponDiscount: 1000,
    pointsCost: 500,
  },
  domesticOps: {
    shipping: 3000,
    packaging: 500,
    csCost: 300,
    returnReservePct: 2,
  },
  financial: {
    exchangeRate: 1350,
    fxSpreadPct: 1.5,
    taxReservePct: 20,
    otherCosts: 300,
  },
}

describe('calculateMarginV2 — 지시서 §9 비용 모델', () => {
  it('소싱비용에 환전 스프레드를 가산한다', () => {
    const r = calculateMarginV2(base)
    // 외화 합계 14 USD × 1350 × 1.015
    expect(r.sourcingCost).toBe(Math.round(14 * 1350 * 1.015))
  })

  it('스프레드가 0이면 단순 환산과 같다', () => {
    const r = calculateMarginV2({
      ...base,
      financial: { ...base.financial, fxSpreadPct: 0 },
    })
    expect(r.sourcingCost).toBe(14 * 1350)
  })

  it('국제비용은 6개 항목의 합이다', () => {
    const r = calculateMarginV2(base)
    expect(r.internationalCost).toBe(5000 + 1000 + 500 + 1200 + 2400 + 800)
  })

  it('판매 수수료는 판매가 기준 비율로 계산한다', () => {
    const r = calculateMarginV2(base)
    // 50000×10% + 50000×3% + 2000 + 1000 + 500
    expect(r.sellingCost).toBe(5000 + 1500 + 2000 + 1000 + 500)
  })

  it('반품 준비금은 판매가 대비 비율로 국내운영비에 들어간다', () => {
    const r = calculateMarginV2(base)
    expect(r.domesticOpsCost).toBe(3000 + 500 + 300 + 1000)
  })

  it('총원가는 5개 그룹의 합이고 순이익은 판매가에서 뺀 값이다', () => {
    const r = calculateMarginV2(base)
    expect(r.totalCost).toBe(
      r.sourcingCost + r.internationalCost + r.sellingCost + r.domesticOpsCost + r.financialCost
    )
    expect(r.expectedNetProfit).toBe(base.sellingPrice - r.totalCost)
  })

  it('ROI는 선투입비용(소싱+국제) 대비로 계산한다', () => {
    const r = calculateMarginV2(base)
    expect(r.upfrontCost).toBe(r.sourcingCost + r.internationalCost)
    expect(r.roiPct).toBeCloseTo((r.expectedNetProfit / r.upfrontCost) * 100, 6)
  })

  it('세전 이익이 음수면 세금 준비금을 잡지 않는다', () => {
    const loss = calculateMarginV2({ ...base, sellingPrice: 10000 })
    // 세금 준비금 0 → financialCost는 otherCosts만
    expect(loss.financialCost).toBe(base.financial.otherCosts)
    expect(loss.expectedNetProfit).toBeLessThan(0)
  })

  it('적자를 0으로 뭉개지 않는다', () => {
    // 손실 방지 게이트가 동작하려면 음수가 그대로 나와야 한다.
    const loss = calculateMarginV2({ ...base, sellingPrice: 5000 })
    expect(loss.expectedNetProfit).toBeLessThan(0)
    expect(loss.expectedNetMarginPct).toBeLessThan(0)
    expect(loss.roiPct).toBeLessThan(0)
  })

  it('판매가 0에서 0으로 나누지 않는다', () => {
    const r = calculateMarginV2({ ...base, sellingPrice: 0 })
    expect(Number.isFinite(r.expectedNetMarginPct)).toBe(true)
    expect(r.expectedNetMarginPct).toBe(0)
  })

  it('선투입 0에서 ROI가 무한대가 되지 않는다', () => {
    const r = calculateMarginV2({
      ...base,
      sourcing: { productPrice: 0, optionCost: 0, localTax: 0, localShipping: 0, paymentFee: 0 },
      international: {
        shipping: 0,
        volumetricSurcharge: 0,
        insurance: 0,
        customsDuty: 0,
        importVat: 0,
        customsFee: 0,
      },
    })
    expect(Number.isFinite(r.roiPct)).toBe(true)
    expect(r.roiPct).toBe(0)
  })

  it('구버전이 놓치던 비용이 마진을 실제로 깎는다', () => {
    // 마켓 수수료·광고비·반품 준비금을 0으로 두면 마진이 부풀려진다.
    // 이게 v2를 만든 이유다.
    const withoutSellingCosts = calculateMarginV2({
      ...base,
      selling: {
        marketplaceFeePct: 0,
        paymentFeePct: 0,
        adCost: 0,
        couponDiscount: 0,
        pointsCost: 0,
      },
      domesticOps: { ...base.domesticOps, returnReservePct: 0 },
    })
    const full = calculateMarginV2(base)

    expect(withoutSellingCosts.expectedNetMarginPct).toBeGreaterThan(
      full.expectedNetMarginPct
    )
    // 차이가 10%p 이상 — 무시할 수 있는 수준이 아니다.
    expect(
      withoutSellingCosts.expectedNetMarginPct - full.expectedNetMarginPct
    ).toBeGreaterThan(10)
  })
})

describe('시뮬레이션', () => {
  it('보수 시나리오가 기준보다, 기준이 낙관보다 이익이 적다', () => {
    const sim = simulateMargin(base)
    expect(sim.conservative.expectedNetProfit).toBeLessThan(sim.base.expectedNetProfit)
    expect(sim.base.expectedNetProfit).toBeLessThan(sim.optimistic.expectedNetProfit)
  })

  it('기준 시나리오는 원본 입력과 같은 결과를 낸다', () => {
    const sim = simulateMargin(base)
    expect(sim.base).toEqual(calculateMarginV2(base))
  })

  it('환율이 오르면 소싱 원가가 오른다', () => {
    const shifted = applyScenario(base, {
      ...DEFAULT_SCENARIOS.base,
      exchangeRatePct: 10,
    })
    expect(calculateMarginV2(shifted).sourcingCost).toBeGreaterThan(
      calculateMarginV2(base).sourcingCost
    )
  })

  it('반품 준비금률은 음수로 내려가지 않는다', () => {
    const shifted = applyScenario(
      { ...base, domesticOps: { ...base.domesticOps, returnReservePct: 1 } },
      { ...DEFAULT_SCENARIOS.base, returnReservePointDelta: -10 }
    )
    expect(shifted.domesticOps.returnReservePct).toBe(0)
  })
})

describe('구버전 입력 승격', () => {
  const legacy = {
    overseasPrice: 10,
    exchangeRate: 1300,
    localShippingCost: 2,
    internationalShippingCost: 5000,
    customsDuty: 1000,
    vat: 2000,
    domesticShippingCost: 3000,
    paymentFee: 700,
    otherCosts: 300,
    domesticExpectedPrice: 40000,
  }

  it('신규 항목을 0으로 채우면 구버전과 같은 총원가가 나온다', () => {
    const v1 = calculateMargin(legacy)
    const v2 = calculateMarginV2(upgradeLegacyMarginInput(legacy))

    expect(v2.totalCost).toBe(v1.totalCost)
    expect(v2.expectedNetProfit).toBe(v1.expectedMargin)
    expect(v2.expectedNetMarginPct).toBeCloseTo(v1.marginRate, 6)
  })
})
