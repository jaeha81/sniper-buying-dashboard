export const AGENT_TYPES = [
  'product_discovery',
  'margin_pricing',
  'order_ops',
  'compliance_risk',
  'command_center',
] as const

export type AgentType = (typeof AGENT_TYPES)[number]

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  product_discovery: '상품 발굴',
  margin_pricing: '마진/가격',
  order_ops: '주문 처리',
  compliance_risk: '리스크/컴플라이언스',
  command_center: '운영 지휘',
}

export const AGENT_TYPE_DESCRIPTIONS: Record<AgentType, string> = {
  product_discovery: '해외 상품 후보를 수집하고 Sniper Score 기준으로 검토 대상을 선별합니다.',
  margin_pricing: '환율, 배송비, 관세, 경쟁가를 반영해 가격과 마진 방어선을 점검합니다.',
  order_ops: '주문 접수, 구매 지시, 배송 추적, 상태 전환 작업을 관리합니다.',
  compliance_risk: '통관, 금지 품목, 개인정보, 고객 알림 리스크를 사전에 차단합니다.',
  command_center: '오늘의 승인 대기, 위험 발견, 실패 자동화, 지연 주문을 우선순위화합니다.',
}

export type AgentTaskStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AgentTaskPriority = 'low' | 'medium' | 'high' | 'critical'

export type AgentFindingSeverity = 'info' | 'warning' | 'critical'

export type AgentActionType =
  | 'review_candidate'
  | 'approve_product'
  | 'update_price'
  | 'pause_product'
  | 'update_order_status'
  | 'send_customer_notice'
  | 'inspect_risk'
  | 'review_automation_failure'

export const AGENT_ACTION_LABELS: Record<AgentActionType, string> = {
  review_candidate: '후보 검토',
  approve_product: '상품 승인',
  update_price: '가격 변경',
  pause_product: '상품 일시중지',
  update_order_status: '주문 상태 변경',
  send_customer_notice: '고객 알림 발송',
  inspect_risk: '리스크 점검',
  review_automation_failure: '자동화 실패 검토',
}

export const RISKY_AGENT_ACTIONS = [
  'approve_product',
  'update_price',
  'pause_product',
  'update_order_status',
  'send_customer_notice',
] as const satisfies readonly AgentActionType[]

type RiskyAgentAction = (typeof RISKY_AGENT_ACTIONS)[number]

const riskyActionSet = new Set<AgentActionType>(RISKY_AGENT_ACTIONS)

export function requiresApproval<T extends AgentActionType>(
  actionType: T
): T extends RiskyAgentAction ? true : boolean {
  return riskyActionSet.has(actionType) as T extends RiskyAgentAction ? true : boolean
}

export interface AgentTaskPriorityInput {
  severity?: AgentFindingSeverity | null
  confidence?: number | null
  marginRate?: number | null
  ageHours?: number | null
  isCustomerFacing?: boolean | null
}

export function getAgentTaskPriority(input: AgentTaskPriorityInput): AgentTaskPriority {
  const confidence = input.confidence ?? 0

  if (input.severity === 'critical' && confidence >= 0.8) return 'critical'
  if (input.isCustomerFacing && input.severity === 'critical') return 'critical'
  if ((input.marginRate ?? 100) < 10) return 'critical'
  if ((input.ageHours ?? 0) >= 48) return 'high'
  if (input.severity === 'warning') return 'high'
  if (confidence >= 0.7) return 'medium'
  return 'low'
}

export interface AgentTask {
  id: string
  agentType: AgentType
  actionType: AgentActionType
  title: string
  status: AgentTaskStatus
  priority: AgentTaskPriority
  requiresApproval: boolean
  targetType?: string | null
  targetId?: string | null
  recommendation?: string | null
  createdAt: string
  updatedAt?: string | null
}

export interface AgentFinding {
  id: string
  agentType: AgentType
  severity: AgentFindingSeverity
  title: string
  summary?: string | null
  targetType?: string | null
  targetId?: string | null
  confidence?: number | null
  createdAt: string
}

export interface AgentRun {
  id: string
  agentType: AgentType
  status: 'running' | 'success' | 'failed' | 'partial'
  startedAt: string
  completedAt?: string | null
}
