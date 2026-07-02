// ============================================================================
// 역할별 에이전트 구성 — 독립 Agent OS 의 단일 원천(single source of truth).
//
// 각 에이전트는 "무엇을 하는가(mission) / 어떤 구독 모델로 정밀 판단하는가(model) /
// 얼마나 자주 도는가(cadence) / 어떤 LLM 보강 판단을 수행하는가(reasoning) /
// 어떤 액션을 자율 실행하는가(autoActions)"를 데이터로 선언한다.
//
// 실행 로직(스캔/정책/실행)은 재사용 검증된 lib/ 모듈이 담당하고,
// 이 파일은 "구성"만 담는다 — 코드 수정 없이 역할·모델·주기를 조정할 수 있도록.
// ============================================================================

import { AGENT_TYPES, type AgentType, type AgentActionType } from '../../../lib/agents'

/** 로컬 게이트웨이가 라우팅하는 구독 모델 식별자 */
export type GatewayModel = 'claude' | 'codex' | 'gemini'

/** 에이전트가 LLM으로 보강하는 판단의 종류 */
export type ReasoningTask =
  | 'candidate_fit'       // 후보 상품 적합성/스코어 근거
  | 'listing_copy'        // 상세페이지 카피 초안
  | 'repricing_review'    // 재가격 시나리오 수치 검증
  | 'order_triage'        // 지연 주문 원인 분류·고객 문구
  | 'compliance_verdict'  // 통관/규제 판정 + 근거
  | 'daily_brief'         // 일일 브리핑·우선순위·이상탐지

export interface AgentConfig {
  /** lib/agents 의 AgentType 와 1:1 */
  id: AgentType
  /** 관리 UI 표기(한국어) */
  label: string
  /** 한 줄 미션 */
  mission: string
  /** 주 모델 + 실패 시 폴백 체인 (앞에서부터 시도) */
  model: { primary: GatewayModel; fallback: GatewayModel[] }
  /** LLM 보강 판단 목록 (게이트웨이 다운 시 스킵되고 heuristic 만 수행) */
  reasoning: ReasoningTask[]
  /** 스케줄러 틱 주기(초). 짧을수록 반응 빠르나 rate/비용 증가 */
  cadenceSec: number
  /**
   * 이 에이전트가 "자율 실행"할 수 있는 액션과, 그것이 열리는 최소 단계.
   * 실제 실행 여부는 여기 + autonomy-stages + lib/autonomy 가드레일의 AND 로 결정된다.
   * (즉 여기서 열려 있어도 킬스위치/한도/스코어 게이트를 통과해야 실행)
   */
  autoActions: Partial<Record<AgentActionType, { minStage: number; note: string }>>
  /** 사람 게이트 고정(자율 승격과 무관하게 항상 승인 필요) */
  humanGated: AgentActionType[]
}

// ── 에이전트 정의 ──────────────────────────────────────────────────────────

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  product_discovery: {
    id: 'product_discovery',
    label: '상품 발굴',
    mission: '해외 상품 후보를 수집하고 Sniper Score 기준으로 정밀 선별한다.',
    model: { primary: 'claude', fallback: ['gemini', 'codex'] },
    reasoning: ['candidate_fit', 'listing_copy'],
    cadenceSec: 30 * 60,
    autoActions: {
      // 발굴 승인은 항상 사람 게이트 — 자율 실행 없음(review_candidate 는 humanGated)
    },
    humanGated: ['review_candidate', 'approve_product'],
  },

  margin_pricing: {
    id: 'margin_pricing',
    label: '마진/가격',
    mission: '환율·배송·관세·경쟁가를 반영해 가격과 마진 방어선을 지킨다.',
    model: { primary: 'codex', fallback: ['claude'] },
    reasoning: ['repricing_review'],
    cadenceSec: 15 * 60,
    autoActions: {
      pause_product: { minStage: 1, note: '마진 방어선 미만 상품 방어적 일시중지' },
      update_price: { minStage: 1, note: '가격 변동 한도 내 재가격(목표 마진 복원)' },
    },
    humanGated: [],
  },

  order_ops: {
    id: 'order_ops',
    label: '주문 처리',
    mission: '주문 접수·구매지시·배송추적·상태전환을 관리한다.',
    model: { primary: 'gemini', fallback: ['claude'] },
    reasoning: ['order_triage'],
    cadenceSec: 10 * 60,
    autoActions: {
      // 상태변경/구매는 실물 확인이 필요 — S3(예산구매) 승격 전까지 사람 게이트
    },
    humanGated: ['update_order_status'],
  },

  compliance_risk: {
    id: 'compliance_risk',
    label: '리스크/컴플라이언스',
    mission: '통관·금지품목·인증·개인정보 리스크를 사전 차단한다.',
    model: { primary: 'claude', fallback: ['codex'] },
    reasoning: ['compliance_verdict'],
    cadenceSec: 60 * 60,
    autoActions: {
      inspect_risk: { minStage: 2, note: '비긴급(critical 제외) 리스크 점검 자동 기록' },
    },
    humanGated: [],
  },

  command_center: {
    id: 'command_center',
    label: '운영 지휘',
    mission: '승인 대기·위험 발견·실패 자동화·지연 주문을 우선순위화하고 브리핑한다.',
    model: { primary: 'claude', fallback: ['gemini'] },
    reasoning: ['daily_brief'],
    cadenceSec: 5 * 60,
    autoActions: {
      send_customer_notice: { minStage: 2, note: '알림 허용 설정 시 고객 알림 자동 발송' },
    },
    humanGated: ['review_automation_failure'],
  },
}

// ── 조회 헬퍼 ──────────────────────────────────────────────────────────────

/** 정의 순서대로 에이전트 구성 배열 반환 */
export function listAgentConfigs(): AgentConfig[] {
  return AGENT_TYPES.map((t) => AGENT_CONFIGS[t])
}

/**
 * 특정 액션이 주어진 단계에서 "구성상" 자율 실행 후보인지.
 * (여기서 true 여도 lib/autonomy 가드레일을 다시 통과해야 실제 실행됨)
 */
export function isAutoActionEnabled(agent: AgentType, action: AgentActionType, stage: number): boolean {
  const cfg = AGENT_CONFIGS[agent]
  if (cfg.humanGated.includes(action)) return false
  const rule = cfg.autoActions[action]
  return !!rule && stage >= rule.minStage
}

/** 게이트웨이 호출용 모델 체인(primary → fallback) */
export function modelChain(agent: AgentType): GatewayModel[] {
  const { primary, fallback } = AGENT_CONFIGS[agent].model
  return [primary, ...fallback]
}
