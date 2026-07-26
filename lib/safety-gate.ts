// 안전 게이트 — 지시서 §16·§18.
//
// 두 가지를 막는다:
//
//   1. 전역 비상정지(Emergency Stop)와 채널별 Kill Switch
//      기존 autonomy_settings.kill_switch는 '자율 실행' 경로에만 걸렸다.
//      관리자가 손으로 누르는 실행, 외부 등록, Make 호출은 그대로 나갔다.
//      진짜 비상정지는 부작용이 있는 모든 경로를 막아야 한다.
//
//   2. Preview 환경에서 외부 실동작
//      Vercel Preview 배포가 실제 채널에 상품을 등록하거나 고객에게
//      알림을 보내면 안 된다. 지금까지는 그대로 나갔다.
//
// 순수 함수 + 환경 판별로 구성했다. 정책값은 호출부가 DB에서 읽어 넘긴다.

/** 부작용이 있는 작업 분류. 차단 판단의 단위다. */
export const SIDE_EFFECT_CHANNELS = [
  /** 채널(쿠팡·네이버 등)에 상품 등록·수정 */
  'channel_publish',
  /** 고객에게 메시지 발송 */
  'customer_notice',
  /** 결제·환불 */
  'payment',
  /** Make.com 시나리오 트리거 */
  'make_trigger',
  /** 상품 가격 변경 */
  'price_change',
  /** 주문 상태 변경 */
  'order_mutation',
  /** 외부 스크랩·LLM 호출 (비용 발생) */
  'external_fetch',
] as const

export type SideEffectChannel = (typeof SIDE_EFFECT_CHANNELS)[number]

export const CHANNEL_LABELS: Record<SideEffectChannel, string> = {
  channel_publish: '채널 상품 등록',
  customer_notice: '고객 알림 발송',
  payment: '결제·환불',
  make_trigger: 'Make.com 실행',
  price_change: '가격 변경',
  order_mutation: '주문 상태 변경',
  external_fetch: '외부 조회(스크랩·LLM)',
}

/**
 * Preview·개발 환경에서 실행을 허용할 채널.
 *
 * external_fetch만 허용한다 — 발굴 파이프라인을 테스트하려면 스크랩과
 * LLM 호출이 필요하다. 나머지는 되돌릴 수 없거나 외부에 흔적을 남긴다.
 */
export const PREVIEW_ALLOWED_CHANNELS: readonly SideEffectChannel[] = ['external_fetch']

export interface SafetyPolicy {
  /** 전역 비상정지. 켜지면 모든 부작용 작업이 막힌다. */
  emergencyStop: boolean
  /** 채널별 개별 차단 */
  disabledChannels: readonly SideEffectChannel[]
  /** 일일 실행 비용 한도 (USD). 0 이하면 한도 없음. */
  dailyBudgetUsd: number
  /** 오늘 이미 쓴 비용 (USD) */
  spentTodayUsd: number
}

export const DEFAULT_SAFETY_POLICY: SafetyPolicy = {
  emergencyStop: false,
  disabledChannels: [],
  dailyBudgetUsd: 0,
  spentTodayUsd: 0,
}

export type RuntimeEnvironment = 'production' | 'preview' | 'development'

/**
 * 현재 실행 환경.
 *
 * VERCEL_ENV를 먼저 본다 — Vercel Preview에서 NODE_ENV는 'production'이라
 * NODE_ENV만으로는 프로덕션과 프리뷰를 구분할 수 없다.
 */
export function currentEnvironment(): RuntimeEnvironment {
  const vercelEnv = process.env.VERCEL_ENV
  if (vercelEnv === 'production') return 'production'
  if (vercelEnv === 'preview') return 'preview'
  if (vercelEnv === 'development') return 'development'

  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

export type BlockReason =
  | 'emergency_stop'
  | 'channel_disabled'
  | 'budget_exceeded'
  | 'non_production_environment'

export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: BlockReason; message: string }

/**
 * 이 작업을 실행해도 되는지 판정한다.
 *
 * 차단 순서가 중요하다 — 비상정지가 가장 위다. 예산이나 환경 판단보다
 * 먼저 걸려야 "정지를 눌렀는데 뭔가 실행됐다"가 생기지 않는다.
 */
export function checkGate(
  channel: SideEffectChannel,
  policy: SafetyPolicy = DEFAULT_SAFETY_POLICY,
  environment: RuntimeEnvironment = currentEnvironment()
): GateDecision {
  if (policy.emergencyStop) {
    return {
      allowed: false,
      reason: 'emergency_stop',
      message: `전역 비상정지가 켜져 있어 '${CHANNEL_LABELS[channel]}'을 실행하지 않습니다.`,
    }
  }

  if (policy.disabledChannels.includes(channel)) {
    return {
      allowed: false,
      reason: 'channel_disabled',
      message: `'${CHANNEL_LABELS[channel]}' 채널이 개별 차단되어 있습니다.`,
    }
  }

  if (environment !== 'production' && !PREVIEW_ALLOWED_CHANNELS.includes(channel)) {
    return {
      allowed: false,
      reason: 'non_production_environment',
      message: `${environment} 환경에서는 '${CHANNEL_LABELS[channel]}'을 실행하지 않습니다. 외부에 실제 영향을 주는 작업은 프로덕션에서만 동작합니다.`,
    }
  }

  if (policy.dailyBudgetUsd > 0 && policy.spentTodayUsd >= policy.dailyBudgetUsd) {
    return {
      allowed: false,
      reason: 'budget_exceeded',
      message: `일일 실행 비용 한도 $${policy.dailyBudgetUsd}를 초과했습니다(사용 $${policy.spentTodayUsd.toFixed(2)}).`,
    }
  }

  return { allowed: true }
}

/** 차단되면 던진다. 실행 경로 앞단에서 쓰는 축약형. */
export class SafetyGateError extends Error {
  constructor(
    readonly reason: BlockReason,
    message: string
  ) {
    super(message)
    this.name = 'SafetyGateError'
  }
}

export function assertGate(
  channel: SideEffectChannel,
  policy?: SafetyPolicy,
  environment?: RuntimeEnvironment
): void {
  const decision = checkGate(channel, policy, environment)
  if (!decision.allowed) throw new SafetyGateError(decision.reason, decision.message)
}
