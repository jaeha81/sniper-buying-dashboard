// P3 — 자율 최적화. 지시서 §17 P3.
//
//   "성과 기반 배정, 제한적 자동 승인 확대, 임계값 실험, 실패 사례 환류"
//
// 원칙: 자율성은 **증명된 만큼만** 확대한다. 성공률이 높다는 이유만으로
// 권한을 넓히지 않는다. 표본이 충분하고, 사람이 뒤집은 비율이 낮고,
// 실제로 손실을 낸 이력이 없어야 한다.
//
// 순수 함수다. 정책 변경은 호출부가 승인 게이트를 거쳐 적용한다 —
// 이 파일은 "확대해도 되는가"를 판정할 뿐 스스로 권한을 넓히지 않는다.

import type { EmployeeCode } from './employees'

// ─── 자율성 등급 ──────────────────────────────────────────────

/**
 * 액션 종류별 자율 실행 등급.
 *
 * never는 어떤 성과를 내도 자동화하지 않는다 — 결제·환불·법적 판단은
 * 지시서 §2가 명시적으로 승인 게이트를 요구한다.
 */
export type AutonomyTier = 'never' | 'manual' | 'assisted' | 'autopilot'

export const TIER_ORDER: readonly AutonomyTier[] = ['never', 'manual', 'assisted', 'autopilot']

export function tierRank(tier: AutonomyTier): number {
  return TIER_ORDER.indexOf(tier)
}

/** 액션별 상한. 이 위로는 어떤 실적으로도 올라가지 않는다. */
export const ACTION_TIER_CEILING: Record<string, AutonomyTier> = {
  // 방어적·가역 액션 — 완전 자율까지 허용
  pause_product: 'autopilot',
  watch_price: 'autopilot',
  watch_stock: 'autopilot',
  market_analysis: 'autopilot',
  margin_analysis: 'autopilot',
  health_check: 'autopilot',
  classify_inquiry: 'autopilot',
  calculate_profit: 'autopilot',

  // 한도 안에서만 자동 — 되돌릴 수 있지만 외부에 보인다
  price_update: 'assisted',
  update_listing: 'assisted',
  generate_content: 'assisted',
  draft_reply: 'assisted',

  // 비가역 — 절대 자동화하지 않는다 (지시서 §2·§7)
  publish_listing: 'never',
  unpublish_listing: 'never',
  payment: 'never',
  refund: 'never',
  send_customer_notice: 'never',
}

export function ceilingFor(actionType: string): AutonomyTier {
  // 정의되지 않은 액션은 보수적으로 manual로 본다.
  return ACTION_TIER_CEILING[actionType] ?? 'manual'
}

// ─── 확대 판정 ────────────────────────────────────────────────

export interface ActionTrackRecord {
  actionType: string
  /** 자율 실행 시도 횟수 */
  autoRuns: number
  /** 자율 실행 성공 횟수 */
  autoSuccesses: number
  /**
   * 사람이 자율 실행 결과를 되돌린 횟수.
   * 성공했지만 사람이 뒤집었다면 판단이 틀렸다는 뜻이다.
   */
  humanReversals: number
  /** 이 액션의 자율 실행이 초래한 실손실 (KRW). 0이어야 한다. */
  realizedLossKrw: number
  /** 마지막 실패로부터 경과한 실행 횟수 */
  runsSinceLastFailure: number
}

export interface PromotionCriteria {
  /** 확대 판단에 필요한 최소 표본 */
  minRuns: number
  /** 최소 성공률 */
  minSuccessRate: number
  /** 최대 사람 개입(되돌림) 비율 */
  maxReversalRate: number
  /** 마지막 실패 이후 필요한 연속 실행 횟수 */
  minRunsSinceFailure: number
}

/**
 * 등급별 승격 기준.
 *
 * autopilot 기준을 assisted보다 훨씬 엄격하게 잡았다. 완전 자율은
 * 사람이 결과를 보지 않는다는 뜻이라, 틀렸을 때 발견이 늦다.
 */
export const PROMOTION_CRITERIA: Record<'assisted' | 'autopilot', PromotionCriteria> = {
  assisted: {
    minRuns: 20,
    minSuccessRate: 0.9,
    maxReversalRate: 0.1,
    minRunsSinceFailure: 10,
  },
  autopilot: {
    minRuns: 100,
    minSuccessRate: 0.97,
    maxReversalRate: 0.02,
    minRunsSinceFailure: 50,
  },
}

export type PromotionBlockCode =
  | 'AT_CEILING'
  | 'INSUFFICIENT_SAMPLE'
  | 'LOW_SUCCESS_RATE'
  | 'HIGH_REVERSAL_RATE'
  | 'RECENT_FAILURE'
  | 'REALIZED_LOSS'

export interface PromotionBlock {
  code: PromotionBlockCode
  message: string
}

export interface PromotionDecision {
  actionType: string
  currentTier: AutonomyTier
  proposedTier: AutonomyTier
  /** 승격 가능한지 */
  eligible: boolean
  blocks: PromotionBlock[]
  /** 지표 요약 */
  metrics: {
    runs: number
    successRate: number | null
    reversalRate: number | null
    runsSinceLastFailure: number
    realizedLossKrw: number
  }
  /** 승격은 사람 승인을 거친다. 자동으로 적용되지 않는다. */
  requiresOwnerApproval: true
}

function nextTier(current: AutonomyTier): AutonomyTier | null {
  const idx = tierRank(current)
  // never에서는 올라갈 수 없다.
  if (current === 'never') return null
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null
  return TIER_ORDER[idx + 1]
}

/**
 * 이 액션의 자율성을 한 단계 올려도 되는지 판정한다.
 *
 * 판정만 한다. 실제 적용은 소유자 승인을 거친다 — 시스템이 스스로
 * 권한을 넓히면 가드레일이 의미를 잃는다.
 */
export function evaluatePromotion(
  actionType: string,
  currentTier: AutonomyTier,
  track: ActionTrackRecord
): PromotionDecision {
  const ceiling = ceilingFor(actionType)
  const proposed = nextTier(currentTier)

  const successRate = track.autoRuns > 0 ? track.autoSuccesses / track.autoRuns : null
  const reversalRate = track.autoRuns > 0 ? track.humanReversals / track.autoRuns : null

  const metrics = {
    runs: track.autoRuns,
    successRate,
    reversalRate,
    runsSinceLastFailure: track.runsSinceLastFailure,
    realizedLossKrw: track.realizedLossKrw,
  }

  const blocks: PromotionBlock[] = []

  // 상한에 닿았거나 never면 더 올라가지 않는다.
  if (!proposed || tierRank(proposed) > tierRank(ceiling)) {
    blocks.push({
      code: 'AT_CEILING',
      message:
        ceiling === 'never'
          ? `'${actionType}'은 비가역 작업이라 자동화하지 않습니다.`
          : `'${actionType}'의 자율성 상한은 ${ceiling}입니다.`,
    })

    return {
      actionType,
      currentTier,
      proposedTier: currentTier,
      eligible: false,
      blocks,
      metrics,
      requiresOwnerApproval: true,
    }
  }

  const criteria = PROMOTION_CRITERIA[proposed as 'assisted' | 'autopilot']

  if (!criteria) {
    // manual로의 승격에는 별도 기준이 없다(수동은 제약이 아니다).
    return {
      actionType,
      currentTier,
      proposedTier: proposed,
      eligible: true,
      blocks: [],
      metrics,
      requiresOwnerApproval: true,
    }
  }

  if (track.autoRuns < criteria.minRuns) {
    blocks.push({
      code: 'INSUFFICIENT_SAMPLE',
      message: `실행 ${track.autoRuns}회로는 판단할 수 없습니다. ${criteria.minRuns}회 이상 필요합니다.`,
    })
  }

  if (successRate === null || successRate < criteria.minSuccessRate) {
    blocks.push({
      code: 'LOW_SUCCESS_RATE',
      message: `성공률 ${successRate === null ? '이력 없음' : `${(successRate * 100).toFixed(1)}%`}가 기준 ${(criteria.minSuccessRate * 100).toFixed(0)}% 미만입니다.`,
    })
  }

  if (reversalRate !== null && reversalRate > criteria.maxReversalRate) {
    blocks.push({
      code: 'HIGH_REVERSAL_RATE',
      message: `사람이 되돌린 비율 ${(reversalRate * 100).toFixed(1)}%가 허용치 ${(criteria.maxReversalRate * 100).toFixed(0)}%를 넘습니다. 성공했지만 판단이 틀렸다는 뜻입니다.`,
    })
  }

  if (track.runsSinceLastFailure < criteria.minRunsSinceFailure) {
    blocks.push({
      code: 'RECENT_FAILURE',
      message: `마지막 실패 이후 ${track.runsSinceLastFailure}회밖에 지나지 않았습니다. ${criteria.minRunsSinceFailure}회 이상 필요합니다.`,
    })
  }

  // 실손실이 한 번이라도 있으면 확대하지 않는다. 손실 방지가 최상위 원칙이다.
  if (track.realizedLossKrw > 0) {
    blocks.push({
      code: 'REALIZED_LOSS',
      message: `이 액션의 자율 실행이 ${track.realizedLossKrw.toLocaleString()}원의 실손실을 냈습니다. 원인 해소 전에는 확대하지 않습니다.`,
    })
  }

  return {
    actionType,
    currentTier,
    proposedTier: proposed,
    eligible: blocks.length === 0,
    blocks,
    metrics,
    requiresOwnerApproval: true,
  }
}

// ─── 강등 ─────────────────────────────────────────────────────

export type DemotionTrigger =
  | 'realized_loss'
  | 'success_rate_collapse'
  | 'reversal_spike'
  | 'consecutive_failures'

export interface DemotionDecision {
  actionType: string
  currentTier: AutonomyTier
  demoteTo: AutonomyTier
  triggers: { trigger: DemotionTrigger; message: string }[]
  /** 강등은 승인을 기다리지 않는다. 위험을 줄이는 방향이므로 즉시 적용한다. */
  applyImmediately: boolean
}

export interface DemotionThresholds {
  /** 이 성공률 밑으로 떨어지면 강등 */
  minSuccessRate: number
  /** 이 되돌림 비율을 넘으면 강등 */
  maxReversalRate: number
  /** 연속 실패 허용 횟수 */
  maxConsecutiveFailures: number
}

export const DEFAULT_DEMOTION_THRESHOLDS: DemotionThresholds = {
  minSuccessRate: 0.8,
  maxReversalRate: 0.2,
  maxConsecutiveFailures: 3,
}

/**
 * 자율성을 낮춰야 하는지 판정한다.
 *
 * 승격과 달리 강등은 즉시 적용한다 — 위험을 줄이는 방향이라 승인을
 * 기다릴 이유가 없다. 지시서 §7 "안전한 자동 일시중지는 허용한다".
 */
export function evaluateDemotion(
  actionType: string,
  currentTier: AutonomyTier,
  track: ActionTrackRecord & { consecutiveFailures: number },
  thresholds: DemotionThresholds = DEFAULT_DEMOTION_THRESHOLDS
): DemotionDecision | null {
  if (currentTier === 'manual' || currentTier === 'never') return null

  const triggers: DemotionDecision['triggers'] = []

  if (track.realizedLossKrw > 0) {
    triggers.push({
      trigger: 'realized_loss',
      message: `실손실 ${track.realizedLossKrw.toLocaleString()}원 발생.`,
    })
  }

  const successRate = track.autoRuns > 0 ? track.autoSuccesses / track.autoRuns : null
  if (successRate !== null && successRate < thresholds.minSuccessRate) {
    triggers.push({
      trigger: 'success_rate_collapse',
      message: `성공률 ${(successRate * 100).toFixed(1)}%가 하한 ${(thresholds.minSuccessRate * 100).toFixed(0)}% 미만.`,
    })
  }

  const reversalRate = track.autoRuns > 0 ? track.humanReversals / track.autoRuns : null
  if (reversalRate !== null && reversalRate > thresholds.maxReversalRate) {
    triggers.push({
      trigger: 'reversal_spike',
      message: `되돌림 비율 ${(reversalRate * 100).toFixed(1)}%가 상한 ${(thresholds.maxReversalRate * 100).toFixed(0)}% 초과.`,
    })
  }

  if (track.consecutiveFailures >= thresholds.maxConsecutiveFailures) {
    triggers.push({
      trigger: 'consecutive_failures',
      message: `연속 ${track.consecutiveFailures}회 실패.`,
    })
  }

  if (triggers.length === 0) return null

  // 실손실이 났으면 manual까지 내린다. 한 단계만 내리면 여전히
  // 자동 실행되는 경로가 남는다.
  const demoteTo: AutonomyTier = track.realizedLossKrw > 0 ? 'manual' : 'assisted'

  return {
    actionType,
    currentTier,
    demoteTo: tierRank(demoteTo) < tierRank(currentTier) ? demoteTo : 'manual',
    triggers,
    applyImmediately: true,
  }
}

// ─── 성과 기반 배정 ───────────────────────────────────────────

export interface EmployeeScorecard {
  employee: EmployeeCode
  successRate: number | null
  /** 평균 실행 비용 (USD) */
  avgCostUsd: number
  /** 기여 이익 (KRW) */
  contributedProfitKrw: number
  /** 현재 부하 */
  activeLoad: number
}

/**
 * 배정 순위 점수.
 *
 * 성공률만 보면 비싼 직원에게 몰리고, 비용만 보면 실패가 늘어난다.
 * 성공률을 주 지표로 두고 부하와 비용으로 조정한다.
 *
 * 이력이 없는 직원은 0.5로 취급한다 — 0이면 신입이 영원히 배정을 못
 * 받고, 1이면 검증 없이 몰린다.
 */
export const NO_HISTORY_RATE = 0.5

export function assignmentScore(card: EmployeeScorecard): number {
  const rate = card.successRate ?? NO_HISTORY_RATE

  // 부하 1건당 0.05 감점. 성공률 차이가 부하보다 크게 작용한다.
  const loadPenalty = card.activeLoad * 0.05

  // 비용은 약하게만 반영한다. $1당 0.02 감점.
  const costPenalty = card.avgCostUsd * 0.02

  return rate - loadPenalty - costPenalty
}

export function rankForAssignment(cards: EmployeeScorecard[]): EmployeeScorecard[] {
  return [...cards].sort((a, b) => assignmentScore(b) - assignmentScore(a))
}

// ─── 실패 사례 환류 ───────────────────────────────────────────

export interface FailureCase {
  actionType: string
  errorCode: string
  count: number
  /** 이 오류가 dead letter까지 간 횟수 */
  deadLetterCount: number
}

export interface FeedbackAction {
  actionType: string
  errorCode: string
  /** 제안하는 조치 */
  suggestion: 'increase_max_attempts' | 'mark_non_retryable' | 'lower_tier' | 'fix_input_schema'
  message: string
}

/**
 * 반복 실패에서 조치를 도출한다.
 *
 * 같은 오류가 계속 dead letter로 가면 재시도를 늘리는 게 답이 아니다.
 * 재시도로 해결되는 오류(타임아웃·네트워크)와 그렇지 않은 오류(스키마
 * 불일치·권한)를 구분해야 한다.
 */
const RETRYABLE_CODES = new Set(['TIMEOUT', 'NETWORK', 'RATE_LIMIT', 'UPSTREAM_5XX'])

export function deriveFeedback(cases: FailureCase[]): FeedbackAction[] {
  const actions: FeedbackAction[] = []

  for (const c of cases) {
    if (c.count < 3) continue

    const retryable = RETRYABLE_CODES.has(c.errorCode)
    const mostlyDeadLetter = c.deadLetterCount / c.count >= 0.5

    if (retryable && mostlyDeadLetter) {
      actions.push({
        actionType: c.actionType,
        errorCode: c.errorCode,
        suggestion: 'increase_max_attempts',
        message: `${c.errorCode}가 ${c.count}회 발생했고 절반 이상이 dead letter로 갔습니다. 재시도 가능한 오류이므로 max_attempts를 늘리는 것을 검토하세요.`,
      })
      continue
    }

    if (!retryable) {
      // 재시도로 해결되지 않는 오류를 계속 재시도하면 비용만 든다.
      actions.push({
        actionType: c.actionType,
        errorCode: c.errorCode,
        suggestion: c.errorCode.includes('INVALID') || c.errorCode.includes('SCHEMA')
          ? 'fix_input_schema'
          : 'mark_non_retryable',
        message: `${c.errorCode}가 ${c.count}회 발생했습니다. 재시도로 해결되지 않는 오류이므로 ${
          c.errorCode.includes('INVALID') || c.errorCode.includes('SCHEMA')
            ? '입력 스키마를 점검'
            : '재시도 불가로 표시'
        }하세요.`,
      })
      continue
    }

    if (c.count >= 10) {
      actions.push({
        actionType: c.actionType,
        errorCode: c.errorCode,
        suggestion: 'lower_tier',
        message: `${c.errorCode}가 ${c.count}회 반복됩니다. 이 액션의 자율성을 낮추고 원인을 확인하세요.`,
      })
    }
  }

  return actions
}
