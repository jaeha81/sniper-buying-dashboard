// Sniper Score 2.0 — 지시서 §8.
//
// 기존 8개 지표와 배점은 그대로 둔다. 바뀐 것은 판단 방식이다:
//
//   가중 점수 + 데이터 신뢰도 + 하드블록
//
// 하드블록은 점수와 무관하게 차단한다. 95점이어도 규제 위험이 해소되지
// 않았으면 통과시키지 않는다. 지시서의 최상위 원칙이 손실 방지이기 때문에,
// 점수가 높다는 이유로 위험을 상쇄하게 두면 안 된다.
//
// 순수 함수다. DB도 네트워크도 건드리지 않는다.

import type { RiskLevel } from './types'

// ─── 지표와 배점 (지시서 §8) ──────────────────────────────────

export const SCORE_WEIGHTS = {
  demand: 20,
  priceCompetitiveness: 20,
  margin: 20,
  shippingStability: 15,
  customsRisk: 10,
  competition: 5,
  pageConvincing: 5,
  automation: 5,
} as const

export type ScoreMetricKey = keyof typeof SCORE_WEIGHTS

export interface ScoreMetrics {
  /** 국내 수요 1-5 */
  demandScore: number
  /** 가격 경쟁력 1-5 */
  priceCompetitivenessScore: number
  /** 순마진율 (%) — 마진 엔진 v2의 expectedNetMarginPct */
  netMarginPct: number
  /** 배송 안정성 1-5 */
  shippingStabilityScore: number
  /** 통관·규제 위험도 */
  riskLevel: RiskLevel
  /** 경쟁 강도 */
  competitionLevel: 'low' | 'medium' | 'high'
  /** 페이지 설득력 1-5 */
  pageConvincingScore: number
  /** 자동화 적합도 1-5 */
  automationScore: number
}

// ─── 데이터 신뢰도 ────────────────────────────────────────────

export type EvidenceSource =
  /** 공식 API·정산 데이터 등 1차 출처 */
  | 'measured'
  /** 스크랩한 실제 페이지 */
  | 'scraped'
  /** LLM 추정 */
  | 'inferred'
  /** 사람이 손으로 입력 */
  | 'manual'
  /** 근거 없음 — 기본값으로 채워짐 */
  | 'missing'

/** 출처별 신뢰 가중치. missing은 0이라 신뢰도를 직접 떨어뜨린다. */
const SOURCE_WEIGHT: Record<EvidenceSource, number> = {
  measured: 1.0,
  scraped: 0.85,
  inferred: 0.6,
  manual: 0.75,
  missing: 0,
}

export interface EvidenceRef {
  source: EvidenceSource
  /** 데이터를 수집한 시각 (ISO). 없으면 신선도를 알 수 없다. */
  capturedAt?: string | null
  /** 근거 URL·레코드 ID 등 */
  ref?: string | null
}

/** 지표별 근거. 누락된 지표는 missing으로 간주한다. */
export type ScoreEvidence = Partial<Record<ScoreMetricKey, EvidenceRef>>

/** 이 일수를 넘으면 신선도 감점이 시작된다. */
export const FRESHNESS_FULL_DAYS = 7
/** 이 일수를 넘으면 신선도 가중치가 바닥(0.3)에 닿는다. */
export const FRESHNESS_STALE_DAYS = 60

/**
 * 수집 시각 기준 신선도 가중치 (0.3 ~ 1.0).
 * 7일 이내는 만점, 60일 이상이면 0.3. 그 사이는 선형 감소.
 */
export function freshnessWeight(capturedAt: string | null | undefined, now: number): number {
  if (!capturedAt) return 0.5 // 언제 수집했는지 모르면 절반만 인정한다.

  const captured = new Date(capturedAt).getTime()
  if (!Number.isFinite(captured)) return 0.5

  const ageDays = (now - captured) / (1000 * 60 * 60 * 24)
  if (ageDays <= FRESHNESS_FULL_DAYS) return 1.0
  if (ageDays >= FRESHNESS_STALE_DAYS) return 0.3

  const span = FRESHNESS_STALE_DAYS - FRESHNESS_FULL_DAYS
  return 1.0 - ((ageDays - FRESHNESS_FULL_DAYS) / span) * 0.7
}

// ─── 하드블록 ─────────────────────────────────────────────────

export type HardBlockCode =
  | 'MISSING_REQUIRED_DATA'
  | 'BELOW_MIN_NET_MARGIN'
  | 'BELOW_MIN_UNIT_PROFIT'
  | 'BELOW_MIN_ROI'
  | 'NOT_SELLABLE'
  | 'NOT_SHIPPABLE'
  | 'REGULATORY_UNRESOLVED'
  | 'IP_RISK_UNRESOLVED'
  | 'UNTRUSTED_SUPPLIER'

export interface HardBlock {
  code: HardBlockCode
  message: string
}

export interface HardBlockFacts {
  /** 마진 엔진 v2 결과 */
  netMarginPct: number
  unitProfit: number
  roiPct: number
  /** 판매 가능 여부 (품절·단종이면 false) */
  sellable: boolean
  /** 배송 가능 여부 (금지 품목·배송 불가 지역이면 false) */
  shippable: boolean
  /** 규제 검토가 끝났는지 */
  regulatoryCleared: boolean
  /** 상표·IP 위험이 해소됐는지 */
  ipCleared: boolean
  /** 소싱처 신뢰도 0-1 */
  supplierTrust: number
}

export interface HardBlockThresholds {
  minNetMarginPct: number
  minUnitProfit: number
  minRoiPct: number
  minSupplierTrust: number
  /** 이 신뢰도 미만이면 데이터 부족으로 차단 */
  minConfidence: number
}

export const DEFAULT_THRESHOLDS: HardBlockThresholds = {
  minNetMarginPct: 15,
  minUnitProfit: 3000, // KRW
  minRoiPct: 20,
  minSupplierTrust: 0.6,
  minConfidence: 0.5,
}

// ─── 결과 ─────────────────────────────────────────────────────

export type ScoreVerdict = 'recommend' | 'review' | 'reject'

export interface ScoreResultV2 {
  /** 가중 점수 0-100 */
  score: number
  breakdown: Record<ScoreMetricKey, number>
  /** 데이터 신뢰도 0-1 */
  confidence: number
  /** 지표별 신뢰도 기여 */
  confidenceBreakdown: Record<ScoreMetricKey, number>
  /** 해소되지 않은 하드블록. 하나라도 있으면 verdict는 reject. */
  hardBlocks: HardBlock[]
  verdict: ScoreVerdict
  /** 판정 근거 */
  reasons: string[]
}

// ─── 지표 점수 ────────────────────────────────────────────────

function clamp1to5(v: number): number {
  if (!Number.isFinite(v)) return 1
  return Math.min(5, Math.max(1, v))
}

/** 순마진율 → 점수. 구간은 기존 calculator.ts와 동일하게 유지한다. */
export function marginPoints(netMarginPct: number): number {
  if (netMarginPct >= 30) return 20
  if (netMarginPct >= 25) return 16
  if (netMarginPct >= 20) return 12
  if (netMarginPct >= 15) return 8
  if (netMarginPct >= 10) return 4
  return 0
}

const RISK_POINTS: Record<RiskLevel, number> = { LOW: 10, MEDIUM: 6, HIGH: 2 }
const COMPETITION_POINTS: Record<string, number> = { low: 5, medium: 3, high: 1 }

export function scoreBreakdown(m: ScoreMetrics): Record<ScoreMetricKey, number> {
  return {
    demand: clamp1to5(m.demandScore) * 4,
    priceCompetitiveness: clamp1to5(m.priceCompetitivenessScore) * 4,
    margin: marginPoints(m.netMarginPct),
    shippingStability: clamp1to5(m.shippingStabilityScore) * 3,
    customsRisk: RISK_POINTS[m.riskLevel] ?? 6,
    competition: COMPETITION_POINTS[m.competitionLevel] ?? 3,
    pageConvincing: clamp1to5(m.pageConvincingScore),
    automation: clamp1to5(m.automationScore),
  }
}

// ─── 신뢰도 ───────────────────────────────────────────────────

/**
 * 지표별 (출처 가중치 × 신선도 가중치)를 배점으로 가중평균한다.
 * 배점이 큰 지표의 근거가 부실하면 신뢰도가 크게 떨어진다.
 */
export function calculateConfidence(
  evidence: ScoreEvidence,
  now: number = Date.now()
): { confidence: number; breakdown: Record<ScoreMetricKey, number> } {
  const breakdown = {} as Record<ScoreMetricKey, number>
  let weightedSum = 0
  let totalWeight = 0

  for (const key of Object.keys(SCORE_WEIGHTS) as ScoreMetricKey[]) {
    const weight = SCORE_WEIGHTS[key]
    const ref = evidence[key]

    const sourceWeight = SOURCE_WEIGHT[ref?.source ?? 'missing']
    // 근거 자체가 없으면 신선도를 따질 필요가 없다.
    const value = sourceWeight === 0 ? 0 : sourceWeight * freshnessWeight(ref?.capturedAt, now)

    breakdown[key] = value
    weightedSum += value * weight
    totalWeight += weight
  }

  return {
    confidence: totalWeight > 0 ? weightedSum / totalWeight : 0,
    breakdown,
  }
}

// ─── 하드블록 판정 ────────────────────────────────────────────

export function evaluateHardBlocks(
  facts: HardBlockFacts,
  confidence: number,
  thresholds: HardBlockThresholds = DEFAULT_THRESHOLDS
): HardBlock[] {
  const blocks: HardBlock[] = []

  if (confidence < thresholds.minConfidence) {
    blocks.push({
      code: 'MISSING_REQUIRED_DATA',
      message: `데이터 신뢰도 ${(confidence * 100).toFixed(0)}%가 기준(${(
        thresholds.minConfidence * 100
      ).toFixed(0)}%) 미만입니다.`,
    })
  }

  if (facts.netMarginPct < thresholds.minNetMarginPct) {
    blocks.push({
      code: 'BELOW_MIN_NET_MARGIN',
      message: `순마진율 ${facts.netMarginPct.toFixed(1)}%가 최저 기준 ${thresholds.minNetMarginPct}% 미만입니다.`,
    })
  }

  if (facts.unitProfit < thresholds.minUnitProfit) {
    blocks.push({
      code: 'BELOW_MIN_UNIT_PROFIT',
      message: `건당 이익 ${Math.round(facts.unitProfit).toLocaleString()}원이 최저 기준 ${thresholds.minUnitProfit.toLocaleString()}원 미만입니다.`,
    })
  }

  if (facts.roiPct < thresholds.minRoiPct) {
    blocks.push({
      code: 'BELOW_MIN_ROI',
      message: `ROI ${facts.roiPct.toFixed(1)}%가 최저 기준 ${thresholds.minRoiPct}% 미만입니다.`,
    })
  }

  if (!facts.sellable) {
    blocks.push({ code: 'NOT_SELLABLE', message: '판매 불가 상태입니다(품절·단종).' })
  }

  if (!facts.shippable) {
    blocks.push({ code: 'NOT_SHIPPABLE', message: '배송 불가 품목입니다.' })
  }

  if (!facts.regulatoryCleared) {
    blocks.push({
      code: 'REGULATORY_UNRESOLVED',
      message: '통관·인증 등 규제 검토가 완료되지 않았습니다.',
    })
  }

  if (!facts.ipCleared) {
    blocks.push({ code: 'IP_RISK_UNRESOLVED', message: '상표·IP 위험이 해소되지 않았습니다.' })
  }

  if (facts.supplierTrust < thresholds.minSupplierTrust) {
    blocks.push({
      code: 'UNTRUSTED_SUPPLIER',
      message: `소싱처 신뢰도 ${(facts.supplierTrust * 100).toFixed(0)}%가 기준 ${(
        thresholds.minSupplierTrust * 100
      ).toFixed(0)}% 미만입니다.`,
    })
  }

  return blocks
}

// ─── 통합 ─────────────────────────────────────────────────────

export interface ScoreInputV2 {
  metrics: ScoreMetrics
  evidence: ScoreEvidence
  facts: HardBlockFacts
  thresholds?: HardBlockThresholds
  /** 이 점수 이상이어야 recommend. 미만이면 review. */
  recommendScore?: number
}

export const DEFAULT_RECOMMEND_SCORE = 75

export function calculateSniperScoreV2(
  input: ScoreInputV2,
  now: number = Date.now()
): ScoreResultV2 {
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS
  const recommendScore = input.recommendScore ?? DEFAULT_RECOMMEND_SCORE

  const breakdown = scoreBreakdown(input.metrics)
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0)

  const { confidence, breakdown: confidenceBreakdown } = calculateConfidence(input.evidence, now)
  const hardBlocks = evaluateHardBlocks(input.facts, confidence, thresholds)

  const reasons: string[] = []
  let verdict: ScoreVerdict

  if (hardBlocks.length > 0) {
    // 점수와 무관하게 차단한다. 이게 Score 2.0의 핵심이다.
    verdict = 'reject'
    reasons.push(`하드블록 ${hardBlocks.length}건으로 차단 (점수 ${score}점과 무관)`)
    reasons.push(...hardBlocks.map((b) => b.message))
  } else if (score >= recommendScore) {
    verdict = 'recommend'
    reasons.push(`점수 ${score}점이 추천 기준 ${recommendScore}점 이상이고 하드블록이 없습니다.`)
  } else {
    verdict = 'review'
    reasons.push(`점수 ${score}점이 추천 기준 ${recommendScore}점 미만입니다. 사람 검토가 필요합니다.`)
  }

  return {
    score,
    breakdown,
    confidence,
    confidenceBreakdown,
    hardBlocks,
    verdict,
    reasons,
  }
}
