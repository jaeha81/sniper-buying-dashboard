import {
  AGENT_TYPES,
  AGENT_TYPE_LABELS,
  RISKY_AGENT_ACTIONS,
  getAgentTaskPriority,
  requiresApproval,
  type AgentActionType,
  type AgentTaskPriority,
  type AgentType,
} from './agents'

type Expect<T extends true> = T
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false

type ExpectedAgentType =
  | 'product_discovery'
  | 'margin_pricing'
  | 'order_ops'
  | 'compliance_risk'
  | 'command_center'

type ExpectedActionType =
  | 'review_candidate'
  | 'approve_product'
  | 'update_price'
  | 'pause_product'
  | 'update_order_status'
  | 'send_customer_notice'
  | 'inspect_risk'
  | 'review_automation_failure'

type ExpectedPriority = 'low' | 'medium' | 'high' | 'critical'

type _AgentTypesMatch = Expect<Equals<AgentType, ExpectedAgentType>>
type _ActionTypesMatch = Expect<Equals<AgentActionType, ExpectedActionType>>
type _PrioritiesMatch = Expect<Equals<AgentTaskPriority, ExpectedPriority>>

const allAgents: AgentType[] = [...AGENT_TYPES]

for (const agent of allAgents) {
  const label: string = AGENT_TYPE_LABELS[agent]
  if (!label) {
    throw new Error(`Missing label for ${agent}`)
  }
}

const riskyActions = [...RISKY_AGENT_ACTIONS]

for (const action of riskyActions) {
  const mustApprove: true = requiresApproval(action)
  if (!mustApprove) {
    throw new Error(`Risky action must require approval: ${action}`)
  }
}

const criticalPriority: AgentTaskPriority = getAgentTaskPriority({
  severity: 'critical',
  confidence: 0.91,
})

if (criticalPriority !== 'critical') {
  throw new Error('Critical findings must produce critical priority')
}
