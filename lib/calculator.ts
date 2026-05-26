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

/**
 * 관세율과 카테고리를 기반으로 위험 레벨 계산
 */
export function getRiskLevel(customsDutyRate: number, category: string): RiskLevel {
  // 카테고리별 기본 위험도
  const highRiskCategories = ['electronics']
  const lowRiskCategories = ['health', 'beauty']

  if (highRiskCategories.includes(category)) {
    if (customsDutyRate > 8) return 'HIGH'
    return 'MEDIUM'
  }

  if (lowRiskCategories.includes(category)) {
    if (customsDutyRate > 20) return 'HIGH'
    if (customsDutyRate > 10) return 'MEDIUM'
    return 'LOW'
  }

  // 기본 로직 (sports, outdoor 등)
  if (customsDutyRate > 13) return 'HIGH'
  if (customsDutyRate > 6.5) return 'MEDIUM'
  return 'LOW'
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
