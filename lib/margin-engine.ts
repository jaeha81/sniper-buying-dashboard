// 마진 엔진 v2 — 지시서 §9의 전체 비용 모델.
//
// 기존 lib/calculator.ts의 calculateMargin()은 8개 항목만 반영했다.
// 마켓 수수료·광고비·반품 준비금·환전 스프레드처럼 실제로 이익을 갉아먹는
// 비용이 빠져 있어, 계산상 마진 20%가 실제로는 적자인 경우가 생긴다.
//
// 지시서가 정한 공식:
//   총원가     = 소싱비용 + 국제비용 + 판매비용 + 국내운영비 + 재무변수
//   예상순이익 = 예정판매가 - 총원가
//   예상순마진율 = 예상순이익 / 예정판매가 × 100
//   ROI        = 예상순이익 / 선투입비용 × 100
//
// 순수 함수다. DB도 네트워크도 건드리지 않는다 — 모든 화면과 에이전트가
// 같은 결과를 얻어야 하기 때문이다(지시서 §9 "동일한 서버 계산 서비스").

/** 현지 통화 기준 소싱 항목. 전부 외화 단위. */
export interface SourcingCosts {
  /** 상품가 */
  productPrice: number
  /** 옵션비 (사이즈·색상 추가금 등) */
  optionCost: number
  /** 현지 판매세 */
  localTax: number
  /** 현지 내 배송비 (판매자 → 배송대행지) */
  localShipping: number
  /** 해외 결제 수수료 */
  paymentFee: number
}

/** 국제 구간. 전부 KRW. */
export interface InternationalCosts {
  /** 국제배송비 */
  shipping: number
  /** 부피·중량 할증 */
  volumetricSurcharge: number
  /** 보험료 */
  insurance: number
  /** 관세 */
  customsDuty: number
  /** 수입 부가세 */
  importVat: number
  /** 통관 수수료 */
  customsFee: number
}

/** 판매 단계 비용. 비율 항목은 판매가 대비 %. */
export interface SellingCosts {
  /** 마켓 수수료 (%) */
  marketplaceFeePct: number
  /** 국내 결제 수수료 (%) */
  paymentFeePct: number
  /** 건당 광고비 (KRW) */
  adCost: number
  /** 쿠폰·할인 (KRW) */
  couponDiscount: number
  /** 적립금 부담 (KRW) */
  pointsCost: number
}

/** 국내 운영비. 전부 KRW. */
export interface DomesticOpsCosts {
  /** 국내 배송비 */
  shipping: number
  /** 포장비 */
  packaging: number
  /** 건당 CS 비용 */
  csCost: number
  /** 반품·환불·손상 준비금 (%) — 판매가 대비 */
  returnReservePct: number
}

/** 재무 변수. */
export interface FinancialVariables {
  /** 환율 (KRW per 외화 1단위) */
  exchangeRate: number
  /** 환전 스프레드 (%) — 소싱 원가에 가산 */
  fxSpreadPct: number
  /** 세금 준비금 (%) — 순이익 대비 유보 */
  taxReservePct: number
  /** 기타 비용 (KRW) */
  otherCosts: number
}

export interface MarginInputV2 {
  /** 예정 판매가 (KRW) */
  sellingPrice: number
  sourcing: SourcingCosts
  international: InternationalCosts
  selling: SellingCosts
  domesticOps: DomesticOpsCosts
  financial: FinancialVariables
}

export interface MarginResultV2 {
  /** 소싱비용 합계 (KRW 환산, 환전 스프레드 포함) */
  sourcingCost: number
  /** 국제비용 합계 */
  internationalCost: number
  /** 판매비용 합계 */
  sellingCost: number
  /** 국내운영비 합계 */
  domesticOpsCost: number
  /** 재무변수 합계 (세금 준비금 + 기타) */
  financialCost: number
  /** 총원가 */
  totalCost: number
  /** 예상 순이익 = 판매가 - 총원가 */
  expectedNetProfit: number
  /** 예상 순마진율 (%) */
  expectedNetMarginPct: number
  /**
   * 선투입비용 — 판매 전에 실제로 나가는 돈(소싱 + 국제).
   * 판매·운영 비용은 팔린 뒤 정산에서 빠지므로 제외한다.
   */
  upfrontCost: number
  /** ROI (%) = 순이익 / 선투입비용 × 100 */
  roiPct: number
}

function round(n: number): number {
  return Math.round(n)
}

/** 지시서 §9의 전체 비용 모델로 마진을 계산한다. */
export function calculateMarginV2(input: MarginInputV2): MarginResultV2 {
  const { sellingPrice, sourcing, international, selling, domesticOps, financial } = input

  // ── 소싱비용 ────────────────────────────────────────────────
  // 외화 합계를 환율로 환산하고, 환전 스프레드를 가산한다.
  // 스프레드는 실제 환전 시 고시환율보다 불리하게 적용되는 폭이라
  // 원가를 늘리는 방향으로만 작용한다.
  const sourcingForeign =
    sourcing.productPrice +
    sourcing.optionCost +
    sourcing.localTax +
    sourcing.localShipping +
    sourcing.paymentFee

  const effectiveRate = financial.exchangeRate * (1 + financial.fxSpreadPct / 100)
  const sourcingCost = round(sourcingForeign * effectiveRate)

  // ── 국제비용 ────────────────────────────────────────────────
  const internationalCost = round(
    international.shipping +
      international.volumetricSurcharge +
      international.insurance +
      international.customsDuty +
      international.importVat +
      international.customsFee
  )

  // ── 판매비용 ────────────────────────────────────────────────
  // 수수료는 판매가 기준 비율이다.
  const sellingCost = round(
    (sellingPrice * selling.marketplaceFeePct) / 100 +
      (sellingPrice * selling.paymentFeePct) / 100 +
      selling.adCost +
      selling.couponDiscount +
      selling.pointsCost
  )

  // ── 국내운영비 ──────────────────────────────────────────────
  // 반품 준비금은 판매가 대비 비율. 반품률이 아니라 '유보액'이다.
  const domesticOpsCost = round(
    domesticOps.shipping +
      domesticOps.packaging +
      domesticOps.csCost +
      (sellingPrice * domesticOps.returnReservePct) / 100
  )

  // ── 재무변수 ────────────────────────────────────────────────
  // 세금 준비금은 '세전 이익'에 대해 잡는다. 세전 이익이 음수면
  // 낼 세금도 없으므로 0으로 둔다.
  const preTaxProfit =
    sellingPrice - (sourcingCost + internationalCost + sellingCost + domesticOpsCost)

  const taxReserve =
    preTaxProfit > 0 ? round((preTaxProfit * financial.taxReservePct) / 100) : 0

  const financialCost = round(taxReserve + financial.otherCosts)

  // ── 합산 ────────────────────────────────────────────────────
  const totalCost =
    sourcingCost + internationalCost + sellingCost + domesticOpsCost + financialCost

  const expectedNetProfit = sellingPrice - totalCost

  // 판매가가 0이면 마진율은 정의되지 않는다. 0으로 나누지 않는다.
  const expectedNetMarginPct =
    sellingPrice > 0 ? (expectedNetProfit / sellingPrice) * 100 : 0

  const upfrontCost = sourcingCost + internationalCost

  // 선투입이 0이면 ROI도 정의되지 않는다.
  const roiPct = upfrontCost > 0 ? (expectedNetProfit / upfrontCost) * 100 : 0

  return {
    sourcingCost,
    internationalCost,
    sellingCost,
    domesticOpsCost,
    financialCost,
    totalCost,
    expectedNetProfit,
    expectedNetMarginPct,
    upfrontCost,
    roiPct,
  }
}

// ─── 시뮬레이션 ───────────────────────────────────────────────
// 지시서 §9: 환율·소싱가·배송비·판매가·광고·반품률 변화에 대한
// 낙관/기준/보수 시나리오를 제공한다.

export type ScenarioName = 'optimistic' | 'base' | 'conservative'

export interface ScenarioShift {
  /** 환율 변동 (%) */
  exchangeRatePct: number
  /** 소싱가 변동 (%) */
  sourcingPricePct: number
  /** 국제배송비 변동 (%) */
  internationalShippingPct: number
  /** 판매가 변동 (%) */
  sellingPricePct: number
  /** 광고비 변동 (%) */
  adCostPct: number
  /** 반품 준비금률 가감 (%p) */
  returnReservePointDelta: number
}

/**
 * 기본 시나리오 폭.
 * 보수 쪽을 낙관 쪽보다 크게 잡은 것은 의도적이다 — 손실은 이익보다
 * 빠르게 커지고, 지시서의 최상위 원칙이 손실 방지이기 때문이다.
 */
export const DEFAULT_SCENARIOS: Record<ScenarioName, ScenarioShift> = {
  optimistic: {
    exchangeRatePct: -3,
    sourcingPricePct: -5,
    internationalShippingPct: -5,
    sellingPricePct: 0,
    adCostPct: -20,
    returnReservePointDelta: -1,
  },
  base: {
    exchangeRatePct: 0,
    sourcingPricePct: 0,
    internationalShippingPct: 0,
    sellingPricePct: 0,
    adCostPct: 0,
    returnReservePointDelta: 0,
  },
  conservative: {
    exchangeRatePct: 8,
    sourcingPricePct: 10,
    internationalShippingPct: 15,
    sellingPricePct: -5,
    adCostPct: 30,
    returnReservePointDelta: 3,
  },
}

export function applyScenario(input: MarginInputV2, shift: ScenarioShift): MarginInputV2 {
  const scale = (value: number, pct: number) => value * (1 + pct / 100)

  return {
    ...input,
    sellingPrice: Math.round(scale(input.sellingPrice, shift.sellingPricePct)),
    sourcing: {
      ...input.sourcing,
      productPrice: scale(input.sourcing.productPrice, shift.sourcingPricePct),
      optionCost: scale(input.sourcing.optionCost, shift.sourcingPricePct),
    },
    international: {
      ...input.international,
      shipping: scale(input.international.shipping, shift.internationalShippingPct),
      volumetricSurcharge: scale(
        input.international.volumetricSurcharge,
        shift.internationalShippingPct
      ),
    },
    selling: {
      ...input.selling,
      adCost: scale(input.selling.adCost, shift.adCostPct),
    },
    domesticOps: {
      ...input.domesticOps,
      returnReservePct: Math.max(
        0,
        input.domesticOps.returnReservePct + shift.returnReservePointDelta
      ),
    },
    financial: {
      ...input.financial,
      exchangeRate: scale(input.financial.exchangeRate, shift.exchangeRatePct),
    },
  }
}

export type MarginSimulation = Record<ScenarioName, MarginResultV2>

export function simulateMargin(
  input: MarginInputV2,
  scenarios: Record<ScenarioName, ScenarioShift> = DEFAULT_SCENARIOS
): MarginSimulation {
  return {
    optimistic: calculateMarginV2(applyScenario(input, scenarios.optimistic)),
    base: calculateMarginV2(applyScenario(input, scenarios.base)),
    conservative: calculateMarginV2(applyScenario(input, scenarios.conservative)),
  }
}

// ─── 구버전 입력 승격 ─────────────────────────────────────────

/**
 * 기존 8항목 MarginInput을 v2 구조로 올린다.
 *
 * 구버전에 없던 항목(마켓 수수료·광고비·반품 준비금 등)은 0으로 채운다.
 * 0으로 채우면 v2 결과가 구버전과 같아진다 — 즉 이 함수는 마이그레이션
 * 경로일 뿐이고, 실제 운영값은 호출부가 채워 넣어야 한다.
 */
export function upgradeLegacyMarginInput(legacy: {
  overseasPrice: number
  exchangeRate: number
  localShippingCost: number
  internationalShippingCost: number
  customsDuty: number
  vat: number
  domesticShippingCost: number
  paymentFee: number
  otherCosts: number
  domesticExpectedPrice: number
}): MarginInputV2 {
  return {
    sellingPrice: legacy.domesticExpectedPrice,
    sourcing: {
      productPrice: legacy.overseasPrice,
      optionCost: 0,
      localTax: 0,
      localShipping: legacy.localShippingCost,
      paymentFee: 0,
    },
    international: {
      shipping: legacy.internationalShippingCost,
      volumetricSurcharge: 0,
      insurance: 0,
      customsDuty: legacy.customsDuty,
      importVat: legacy.vat,
      customsFee: 0,
    },
    selling: {
      marketplaceFeePct: 0,
      paymentFeePct: 0,
      adCost: 0,
      couponDiscount: 0,
      pointsCost: 0,
    },
    domesticOps: {
      shipping: legacy.domesticShippingCost,
      packaging: 0,
      csCost: 0,
      returnReservePct: 0,
    },
    financial: {
      exchangeRate: legacy.exchangeRate,
      fxSpreadPct: 0,
      taxReservePct: 0,
      // 구버전 paymentFee는 KRW 고정액이라 v2의 비율 항목에 넣을 수 없다.
      otherCosts: legacy.otherCosts + legacy.paymentFee,
    },
  }
}
