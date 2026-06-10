// 자율성 정책 엔진 — 에이전트 태스크를 사람 승인 없이 실행할지 판단하는 순수 로직.
// DB 접근 없음: 입력(태스크 + 정책 + 컨텍스트) → 결정(auto_execute | needs_approval).

import type { AgentActionType, AgentTaskPriority } from './agents'

export const AUTONOMY_LEVELS = ['manual', 'assisted', 'autopilot'] as const

export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number]

export const AUTONOMY_LEVEL_LABELS: Record<AutonomyLevel, string> = {
  manual: '수동',
  assisted: '반자율',
  autopilot: '완전자율',
}

export const AUTONOMY_LEVEL_DESCRIPTIONS: Record<AutonomyLevel, string> = {
  manual: '모든 액션을 관리자가 직접 승인합니다. 에이전트는 제안만 합니다.',
  assisted: '방어적 액션(저마진 일시중지, 한도 내 가격 조정)을 자동 실행합니다.',
  autopilot: '가드레일 내 모든 액션(상품 승인, 고객 알림 포함)을 자동 실행합니다.',
}

export interface AutonomyPolicy {
  autonomyLevel: AutonomyLevel
  killSwitch: boolean
  /** 24시간 내 자율 실행 최대 건수. 초과분은 승인 대기로 전환. */
  maxDailyAutoActions: number
  /** 자동 가격 변경 허용 폭(%). 초과 시 사람 승인 필요. */
  maxPriceChangePct: number
  /** 이 마진율(%) 미만이면 방어적 일시중지를 자율 실행. */
  minMarginRate: number
  /** autopilot에서 상품 자동 승인에 필요한 최소 Sniper Score. */
  minApproveSniperScore: number
  /** autopilot에서 고객 알림 자동 발송 허용 여부. */
  allowCustomerNotice: boolean
}

export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
  autonomyLevel: 'assisted',
  killSwitch: false,
  maxDailyAutoActions: 30,
  maxPriceChangePct: 10,
  minMarginRate: 10,
  minApproveSniperScore: 80,
  allowCustomerNotice: false,
}

export interface AutonomyTaskInput {
  actionType: AgentActionType
  priority: AgentTaskPriority
  payload?: Record<string, unknown> | null
}

export interface AutonomyContext {
  /** 최근 24시간 동안 autonomy가 실행한 액션 수 */
  autoActionsLast24h: number
}

export type AutonomyDecisionMode = 'auto_execute' | 'needs_approval'

export interface AutonomyDecision {
  mode: AutonomyDecisionMode
  reason: string
}

function auto(reason: string): AutonomyDecision {
  return { mode: 'auto_execute', reason }
}

function hold(reason: string): AutonomyDecision {
  return { mode: 'needs_approval', reason }
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * 액션별 자율 실행 매트릭스
 *
 * | 액션                      | manual | assisted                | autopilot                       |
 * |---------------------------|--------|-------------------------|---------------------------------|
 * | pause_product             | 승인   | 자동 (마진 방어)        | 자동                            |
 * | update_price              | 승인   | 자동 (한도 내 제안가)   | 자동 (한도 내 제안가)           |
 * | approve_product           | 승인   | 승인                    | 자동 (스코어 임계값 이상)       |
 * | send_customer_notice      | 승인   | 승인                    | 자동 (allowCustomerNotice 시)   |
 * | inspect_risk              | 승인   | 승인                    | 자동 (critical 제외)            |
 * | review_candidate          | 승인   | 승인                    | 승인 (발굴 게이트는 항상 사람)  |
 * | update_order_status       | 승인   | 승인                    | 승인 (실물 확인 필요)           |
 * | review_automation_failure | 승인   | 승인                    | 승인 (원인 진단 필요)           |
 */
export function decideTaskAutonomy(
  task: AutonomyTaskInput,
  policy: AutonomyPolicy,
  context: AutonomyContext
): AutonomyDecision {
  if (policy.killSwitch) {
    return hold('킬스위치 활성화 — 모든 자율 실행 중단')
  }
  if (policy.autonomyLevel === 'manual') {
    return hold('수동 모드 — 관리자 승인 필요')
  }
  if (context.autoActionsLast24h >= policy.maxDailyAutoActions) {
    return hold(`일일 자율 실행 한도 도달 (${policy.maxDailyAutoActions}건)`)
  }

  const payload = task.payload ?? {}
  const isAutopilot = policy.autonomyLevel === 'autopilot'

  switch (task.actionType) {
    case 'pause_product': {
      const marginRate = asNumber(payload.marginRate)
      if (marginRate !== null && marginRate < policy.minMarginRate) {
        return auto(`마진 방어 — 마진율 ${marginRate.toFixed(1)}% < 방어선 ${policy.minMarginRate}%`)
      }
      if (isAutopilot) return auto('완전자율 — 상품 일시중지 실행')
      return hold('마진 방어선 위 상품 — 일시중지는 관리자 판단 필요')
    }

    case 'update_price': {
      const changePct = asNumber(payload.proposedChangePct)
      const proposedPrice = asNumber(payload.domesticExpectedPrice)
      if (changePct === null || proposedPrice === null || proposedPrice <= 0) {
        return hold('제안 가격 없음 — 가격 산정 후 승인 필요')
      }
      if (Math.abs(changePct) > policy.maxPriceChangePct) {
        return hold(`가격 변동 ${changePct.toFixed(1)}%가 한도 ±${policy.maxPriceChangePct}% 초과`)
      }
      return auto(`한도 내 가격 조정 — ${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% (한도 ±${policy.maxPriceChangePct}%)`)
    }

    case 'approve_product': {
      if (!isAutopilot) return hold('상품 승인은 완전자율 모드에서만 자동 실행')
      const sniperScore = asNumber(payload.sniperScore)
      if (sniperScore !== null && sniperScore >= policy.minApproveSniperScore) {
        return auto(`고득점 상품 자동 승인 — 스코어 ${sniperScore} ≥ ${policy.minApproveSniperScore}`)
      }
      return hold(`Sniper Score가 자동 승인 임계값(${policy.minApproveSniperScore}) 미만`)
    }

    case 'send_customer_notice': {
      if (isAutopilot && policy.allowCustomerNotice) {
        return auto('완전자율 — 고객 알림 자동 발송')
      }
      return hold('고객 발송 액션 — 완전자율 + 알림 허용 설정 필요')
    }

    case 'inspect_risk': {
      if (isAutopilot && task.priority !== 'critical') {
        return auto('완전자율 — 비긴급 리스크 점검 자동 기록')
      }
      return hold('컴플라이언스 점검 — 관리자 확인 필요')
    }

    case 'review_candidate':
      return hold('상품 발굴 최종 게이트 — 항상 사람이 검토')

    case 'update_order_status':
      return hold('주문 상태는 실제 구매/배송 확인 후 변경 필요')

    case 'review_automation_failure':
      return hold('자동화 실패는 원인 진단 후 재실행 필요')

    default:
      return hold('알 수 없는 액션 — 안전을 위해 승인 대기')
  }
}
