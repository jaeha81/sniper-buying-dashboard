// 직원형 에이전트 레지스트리 — 지시서 §5의 11개 직원.
//
// 기존 lib/agents.ts는 5종(product_discovery, margin_pricing, order_ops,
// compliance_risk, command_center)만 정의했다. 지시서는 업무를 11개로
// 쪼개 각 직원에게 권한·도구·상태를 부여하라고 요구한다.
//
// agents.ts를 덮어쓰지 않고 별 모듈로 둔 이유: agent_runs/agent_tasks의
// CHECK 제약이 5종에 묶여 있어 기존 코드가 여전히 그걸 쓴다. 아래
// LEGACY_AGENT_MAP이 신규 11종을 구 5종으로 접어 주므로 두 체계가
// 공존할 수 있다.

export const EMPLOYEE_CODES = [
  'sourcing',
  'market_research',
  'margin_pricing',
  'compliance_risk',
  'content',
  'listing',
  'price_stock_watch',
  'order_fulfillment',
  'customer_service',
  'revenue_analytics',
  'automation_watch',
] as const

export type EmployeeCode = (typeof EMPLOYEE_CODES)[number]

/** 직원 상태값 — 지시서 §5. */
export const EMPLOYEE_STATES = [
  'idle',
  'queued',
  'working',
  'waiting_approval',
  'blocked',
  'retrying',
  'paused',
  'error',
  'offline',
] as const

export type EmployeeState = (typeof EMPLOYEE_STATES)[number]

export const EMPLOYEE_STATE_LABELS: Record<EmployeeState, string> = {
  idle: '대기',
  queued: '큐 적재',
  working: '작업 중',
  waiting_approval: '승인 대기',
  blocked: '차단',
  retrying: '재시도 중',
  paused: '일시중지',
  error: '오류',
  offline: '오프라인',
}

/**
 * 직원이 다룰 수 있는 도구.
 * 권한 검사의 단위다 — 콘텐츠 담당이 결제 API를 부르는 일이 없어야 한다.
 */
export const EMPLOYEE_TOOLS = [
  'firecrawl.scrape',
  'openrouter.extract',
  'db.product.read',
  'db.product.write',
  'db.order.read',
  'db.order.write',
  'db.listing.read',
  'db.listing.write',
  'db.settlement.read',
  'margin.calculate',
  'score.calculate',
  'risk.check',
  'content.generate',
  'channel.publish',
  'notify.customer',
  'notify.admin',
  'make.trigger',
] as const

export type EmployeeTool = (typeof EMPLOYEE_TOOLS)[number]

export interface EmployeeDefinition {
  code: EmployeeCode
  /** 화면에 보이는 직책명 */
  name: string
  /** 담당 업무 */
  responsibility: string
  /** 이 직원이 만들 수 있는 Task 종류 */
  taskTypes: readonly string[]
  /** 허용된 도구 */
  tools: readonly EmployeeTool[]
  /**
   * 기존 5종 에이전트 중 어디에 속하는지.
   * agent_runs/agent_tasks의 CHECK 제약을 만족시키기 위한 매핑이다.
   */
  legacyAgentType: 'product_discovery' | 'margin_pricing' | 'order_ops' | 'compliance_risk' | 'command_center'
}

export const EMPLOYEES: Record<EmployeeCode, EmployeeDefinition> = {
  sourcing: {
    code: 'sourcing',
    name: '소싱 담당',
    responsibility: '후보 수집, 정규화, 중복 제거',
    taskTypes: ['collect_candidate', 'normalize_candidate', 'dedupe_candidate'],
    tools: ['firecrawl.scrape', 'openrouter.extract', 'db.product.read', 'db.product.write'],
    legacyAgentType: 'product_discovery',
  },
  market_research: {
    code: 'market_research',
    name: '시장분석 담당',
    responsibility: '국내 수요·가격대·경쟁 분석',
    taskTypes: ['market_analysis'],
    tools: ['firecrawl.scrape', 'openrouter.extract', 'db.product.read'],
    legacyAgentType: 'product_discovery',
  },
  margin_pricing: {
    code: 'margin_pricing',
    name: '마진·가격 담당',
    responsibility: '전체 비용, 권장가, 순익, ROI, 민감도 분석',
    taskTypes: ['margin_analysis', 'price_recommendation', 'price_update'],
    tools: ['margin.calculate', 'score.calculate', 'db.product.read', 'db.product.write'],
    legacyAgentType: 'margin_pricing',
  },
  compliance_risk: {
    code: 'compliance_risk',
    name: '규제·리스크 담당',
    responsibility: '통관·인증·금지·상표/IP·배송 위험 검토',
    taskTypes: ['risk_analysis', 'regulatory_check', 'ip_check'],
    tools: ['risk.check', 'firecrawl.scrape', 'db.product.read'],
    legacyAgentType: 'compliance_risk',
  },
  content: {
    code: 'content',
    name: '콘텐츠 담당',
    responsibility: '제목·설명·속성·FAQ·이미지 작업지시 생성',
    taskTypes: ['generate_content', 'revise_content'],
    tools: ['content.generate', 'openrouter.extract', 'db.product.read'],
    legacyAgentType: 'product_discovery',
  },
  listing: {
    code: 'listing',
    name: '상품등록 담당',
    responsibility: '승인된 상품의 채널 등록·수정',
    // 등록은 비가역이라 승인 게이트를 반드시 통과한다.
    taskTypes: ['publish_listing', 'update_listing', 'unpublish_listing'],
    tools: ['channel.publish', 'db.listing.read', 'db.listing.write', 'make.trigger'],
    legacyAgentType: 'order_ops',
  },
  price_stock_watch: {
    code: 'price_stock_watch',
    name: '가격·재고 감시 담당',
    responsibility: '소싱가·환율·재고·마진 하락 감시',
    taskTypes: ['watch_price', 'watch_stock', 'margin_alert', 'pause_product'],
    tools: ['firecrawl.scrape', 'margin.calculate', 'db.product.read', 'db.product.write', 'notify.admin'],
    legacyAgentType: 'margin_pricing',
  },
  order_fulfillment: {
    code: 'order_fulfillment',
    name: '주문·배송 담당',
    responsibility: '주문·발주 준비·배송·지연·취소 예외 처리',
    taskTypes: ['process_order', 'prepare_purchase', 'track_shipment', 'handle_delay'],
    tools: ['db.order.read', 'db.order.write', 'make.trigger', 'notify.admin'],
    legacyAgentType: 'order_ops',
  },
  customer_service: {
    code: 'customer_service',
    name: 'CS 담당',
    responsibility: '문의 분류와 답변 초안 작성',
    // 초안만 만든다. 실제 발송은 승인 게이트를 통과해야 한다.
    taskTypes: ['classify_inquiry', 'draft_reply'],
    tools: ['content.generate', 'db.order.read', 'notify.customer'],
    legacyAgentType: 'compliance_risk',
  },
  revenue_analytics: {
    code: 'revenue_analytics',
    name: '수익·성과 담당',
    responsibility: '예상/실현 손익, 상품·채널·직원 기여 분석',
    taskTypes: ['calculate_profit', 'variance_analysis', 'contribution_analysis'],
    tools: ['db.settlement.read', 'db.order.read', 'db.product.read', 'margin.calculate'],
    legacyAgentType: 'command_center',
  },
  automation_watch: {
    code: 'automation_watch',
    name: '자동화 감시 담당',
    responsibility: 'API·웹훅·스케줄·DB 작업 장애 감시',
    taskTypes: ['check_automation', 'review_dead_letter', 'health_check'],
    tools: ['notify.admin', 'db.product.read'],
    legacyAgentType: 'command_center',
  },
}

export const EMPLOYEE_LIST: readonly EmployeeDefinition[] = EMPLOYEE_CODES.map(
  (code) => EMPLOYEES[code]
)

/** 이 직원이 이 도구를 쓸 수 있는지. 권한 검사의 단일 지점. */
export function employeeCanUseTool(code: EmployeeCode, tool: EmployeeTool): boolean {
  return EMPLOYEES[code].tools.includes(tool)
}

/** 이 Task 종류를 담당하는 직원. 없으면 null. */
export function employeeForTaskType(taskType: string): EmployeeDefinition | null {
  for (const def of EMPLOYEE_LIST) {
    if (def.taskTypes.includes(taskType)) return def
  }
  return null
}

/** 기존 5종 체계로 접는다. agent_runs/agent_tasks 기록용. */
export function toLegacyAgentType(code: EmployeeCode): EmployeeDefinition['legacyAgentType'] {
  return EMPLOYEES[code].legacyAgentType
}

// ─── 상태 산출 ────────────────────────────────────────────────

export interface EmployeeWorkload {
  /** 실행 중 태스크 수 */
  running: number
  /** 대기(queued/scheduled) 태스크 수 */
  queued: number
  /** 승인 대기 태스크 수 */
  waitingApproval: number
  /** 재시도 예약된 태스크 수 */
  retrying: number
  /** dead letter 수 */
  deadLetter: number
  /** 직원이 수동으로 일시중지됐는지 */
  paused: boolean
  /** 도구·자격증명이 없어 일할 수 없는지 */
  offline: boolean
}

/**
 * 부하 지표에서 표시 상태를 정한다.
 *
 * 우선순위가 중요하다 — 일시중지·오프라인이 먼저다. 일하는 것처럼
 * 보이는데 실제로 멈춰 있으면 안 되기 때문이다. dead letter는 error로
 * 올린다: 사람이 봐야 하는 상태다.
 */
export function deriveEmployeeState(w: EmployeeWorkload): EmployeeState {
  if (w.offline) return 'offline'
  if (w.paused) return 'paused'
  if (w.deadLetter > 0) return 'error'
  if (w.retrying > 0) return 'retrying'
  if (w.waitingApproval > 0) return 'waiting_approval'
  if (w.running > 0) return 'working'
  if (w.queued > 0) return 'queued'
  return 'idle'
}

export interface EmployeePerformance {
  /** 총 시도 횟수 */
  totalRuns: number
  /** 성공 횟수 */
  successRuns: number
  /** 사람이 개입한 횟수(승인·반려·수정) */
  manualInterventions: number
  /** 누적 실행 비용 (USD) */
  costUsd: number
}

/** 성공률 0-1. 시도가 없으면 null — 0%로 표시하면 실패한 것처럼 보인다. */
export function successRate(p: EmployeePerformance): number | null {
  if (p.totalRuns <= 0) return null
  return p.successRuns / p.totalRuns
}

/** 수동 개입률 0-1. 자율성 확대 판단의 근거다(P3). */
export function manualInterventionRate(p: EmployeePerformance): number | null {
  if (p.totalRuns <= 0) return null
  return p.manualInterventions / p.totalRuns
}
