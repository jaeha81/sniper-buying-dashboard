import type { MarginInput, MarginResult, SniperInput, SniperScoreResult, RiskLevel } from './types'

export const DEFAULT_EXCHANGE_RATE = 1350 // KRW per USD

/**
 * 마진 계산
 * 총원가 = 해외원가(KRW) + 현지배송비(KRW) + 국제배송비 + 관세 + 부가세 + 국내배송비 + 결제수수료 + 기타비용
 * 예상순마진 = 국내판매가 - 총원가
 * 마진율 = (예상순마진 / 국내판매가) * 100
 */
export function calculateMargin(input: MarginInput): MarginResult {
  const {
    overseasPrice,
    exchangeRate,
    localShippingCost,
    internationalShippingCost,
    customsDuty,
    vat,
    domesticShippingCost,
    paymentFee,
    otherCosts,
    domesticExpectedPrice,
  } = input

  const overseasPriceKRW = Math.round(overseasPrice * exchangeRate)
  const localShippingCostKRW = Math.round(localShippingCost * exchangeRate)
  const taxEstimate = customsDuty + vat

  const totalCost =
    overseasPriceKRW +
    localShippingCostKRW +
    internationalShippingCost +
    taxEstimate +
    domesticShippingCost +
    paymentFee +
    otherCosts

  const expectedMargin = domesticExpectedPrice - totalCost
  const marginRate =
    domesticExpectedPrice > 0
      ? (expectedMargin / domesticExpectedPrice) * 100
      : 0

  return {
    overseasPriceKRW,
    localShippingCostKRW,
    totalCost,
    expectedMargin,
    marginRate,
    taxEstimate,
  }
}

/**
 * Sniper Score 계산 (100점 만점)
 * - 국내수요 20점 (1-5단계 → 4, 8, 12, 16, 20점)
 * - 해외가격경쟁력 20점 (1-5단계 → 4, 8, 12, 16, 20점)
 * - 마진율 20점 (30%이상=20, 25%=16, 20%=12, 15%=8, 10%=4, 10%미만=0)
 * - 배송안정성 15점 (1-5단계 → 3, 6, 9, 12, 15점)
 * - 통관리스크 역산 10점 (LOW=10, MEDIUM=6, HIGH=2)
 * - 경쟁강도 역산 5점 (낮음=5, 보통=3, 높음=1)
 * - 상세페이지설득력 5점 (1-5단계 → 1, 2, 3, 4, 5점)
 * - 자동화적합도 5점 (1-5단계 → 1, 2, 3, 4, 5점)
 */
export function calculateSniperScore(input: SniperInput): SniperScoreResult {
  const {
    demandScore,
    priceCompetitivenessScore,
    marginRate,
    shippingStabilityScore,
    riskLevel,
    competitionLevel,
    pageConvincingScore,
    automationScore,
  } = input

  // 국내수요 (1-5 → 4~20점)
  const demand = Math.min(5, Math.max(1, demandScore)) * 4

  // 해외가격경쟁력 (1-5 → 4~20점)
  const priceCompetitiveness = Math.min(5, Math.max(1, priceCompetitivenessScore)) * 4

  // 마진율 점수
  let margin = 0
  if (marginRate >= 30) margin = 20
  else if (marginRate >= 25) margin = 16
  else if (marginRate >= 20) margin = 12
  else if (marginRate >= 15) margin = 8
  else if (marginRate >= 10) margin = 4
  else margin = 0

  // 배송안정성 (1-5 → 3~15점)
  const shippingStability = Math.min(5, Math.max(1, shippingStabilityScore)) * 3

  // 통관리스크 역산
  const customsRiskMap: Record<RiskLevel, number> = {
    LOW: 10,
    MEDIUM: 6,
    HIGH: 2,
  }
  const customsRisk = customsRiskMap[riskLevel] ?? 6

  // 경쟁강도 역산
  const competitionMap: Record<string, number> = {
    low: 5,
    medium: 3,
    high: 1,
  }
  const competition = competitionMap[competitionLevel] ?? 3

  // 상세페이지설득력 (1-5 → 1~5점)
  const pageConvincing = Math.min(5, Math.max(1, pageConvincingScore))

  // 자동화적합도 (1-5 → 1~5점)
  const automation = Math.min(5, Math.max(1, automationScore))

  const total =
    demand +
    priceCompetitiveness +
    margin +
    shippingStability +
    customsRisk +
    competition +
    pageConvincing +
    automation

  return {
    total,
    breakdown: {
      demand,
      priceCompetitiveness,
      margin,
      shippingStability,
      customsRisk,
      competition,
      pageConvincing,
      automation,
    },
  }
}

/** 카테고리별 통관 리스크 기준 — 품목 특성 + 관세율 복합 판단 */
const CUSTOMS_CATEGORY_RULES: Record<
  string,
  { baseRisk: RiskLevel; highDutyThreshold: number; mediumDutyThreshold: number; notes: string }
> = {
  electronics: {
    baseRisk: 'MEDIUM',
    highDutyThreshold: 8,
    mediumDutyThreshold: 0,
    notes: '전파인증(KC) 미보유 시 통관 불가. 리튬배터리 항공위험물 규정 적용.',
  },
  food: {
    baseRisk: 'HIGH',
    highDutyThreshold: 0,
    mediumDutyThreshold: 0,
    notes: '식품위생법 적용. 성분표·원산지 표기 필수. 검역 대상 가능성 높음.',
  },
  medicine: {
    baseRisk: 'HIGH',
    highDutyThreshold: 0,
    mediumDutyThreshold: 0,
    notes: '의약품·의약외품은 개인 사용 목적 소량만 허용. 사전 허가 필요.',
  },
  health: {
    baseRisk: 'LOW',
    highDutyThreshold: 20,
    mediumDutyThreshold: 10,
    notes: '건강기능식품은 성분·용량 확인 필요. 프로바이오틱스 등 일부 검역 대상.',
  },
  beauty: {
    baseRisk: 'LOW',
    highDutyThreshold: 20,
    mediumDutyThreshold: 10,
    notes: '화장품 성분 규제 확인 필요. 미백·자외선차단 기능성 제품은 별도 신고.',
  },
  sports: {
    baseRisk: 'LOW',
    highDutyThreshold: 13,
    mediumDutyThreshold: 6.5,
    notes: '일반 스포츠용품은 통관 무난. 보호대 등 의료기기 분류 여부 확인.',
  },
  outdoor: {
    baseRisk: 'LOW',
    highDutyThreshold: 13,
    mediumDutyThreshold: 6.5,
    notes: '캠핑·아웃도어 용품 일반적으로 무난. 수입 금지 소재(특정 합금 등) 확인.',
  },
}

const CUSTOMS_THRESHOLD_KRW = 150 * DEFAULT_EXCHANGE_RATE // 목록통관 한도 (미화 150달러 × 기준환율)

/**
 * 관세율과 카테고리를 기반으로 위험 레벨 계산
 * food/medicine은 관세율 무관 HIGH 고정
 */
export function getRiskLevel(customsDutyRate: number, category: string): RiskLevel {
  const rule = CUSTOMS_CATEGORY_RULES[category]
  if (!rule) {
    if (customsDutyRate > 13) return 'HIGH'
    if (customsDutyRate > 6.5) return 'MEDIUM'
    return 'LOW'
  }

  if (rule.baseRisk === 'HIGH') return 'HIGH'

  if (customsDutyRate > rule.highDutyThreshold) return 'HIGH'
  if (customsDutyRate > rule.mediumDutyThreshold) return 'MEDIUM'
  return rule.baseRisk
}

/** 목록통관/일반통관 분기 안내 */
export interface CustomsInfo {
  clearanceType: '목록통관' | '일반통관'
  thresholdNote: string
  categoryNote: string
  actionRequired: boolean
}

/**
 * 상품 총액(KRW)과 카테고리를 기반으로 통관 안내 반환
 * 목록통관: 미화 150달러 이하, food/medicine/electronics 제외
 */
export function getCustomsInfo(totalPriceKRW: number, category: string): CustomsInfo {
  const rule = CUSTOMS_CATEGORY_RULES[category]
  const categoryNote = rule?.notes ?? '표준 통관 절차 적용.'

  // 식품·의약품은 금액 무관 일반통관
  if (category === 'food' || category === 'medicine') {
    return {
      clearanceType: '일반통관',
      thresholdNote: '식품·의약품은 금액 무관 일반통관 및 검역 대상입니다.',
      categoryNote,
      actionRequired: true,
    }
  }

  // 전자제품은 금액 무관 일반통관 + KC 확인 필요
  if (category === 'electronics') {
    return {
      clearanceType: '일반통관',
      thresholdNote: '전자제품은 금액 무관 일반통관. KC 전파인증 필수 확인.',
      categoryNote,
      actionRequired: true,
    }
  }

  if (totalPriceKRW <= CUSTOMS_THRESHOLD_KRW) {
    return {
      clearanceType: '목록통관',
      thresholdNote: `총액 ${totalPriceKRW.toLocaleString()}원 — 150달러 이하 목록통관 적용 가능. 관부가세 면제.`,
      categoryNote,
      actionRequired: false,
    }
  }

  return {
    clearanceType: '일반통관',
    thresholdNote: `총액 ${totalPriceKRW.toLocaleString()}원 — 150달러 초과 일반통관. 관부가세 납부 필요.`,
    categoryNote,
    actionRequired: true,
  }
}

/**
 * 마진율에 따른 색상 클래스 반환
 */
export function getMarginRateClass(marginRate: number): string {
  if (marginRate >= 30) return 'text-green-600'
  if (marginRate >= 20) return 'text-blue-600'
  if (marginRate >= 10) return 'text-yellow-600'
  return 'text-red-600'
}

/**
 * Sniper Score에 따른 등급 반환
 */
export function getSniperGrade(score: number): { grade: string; label: string; color: string } {
  if (score >= 85) return { grade: 'S', label: '최우선 추천', color: 'text-purple-600' }
  if (score >= 75) return { grade: 'A', label: '추천', color: 'text-green-600' }
  if (score >= 65) return { grade: 'B', label: '검토', color: 'text-blue-600' }
  if (score >= 50) return { grade: 'C', label: '주의', color: 'text-yellow-600' }
  return { grade: 'D', label: '비추천', color: 'text-red-600' }
}
