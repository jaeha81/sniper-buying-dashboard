import {
  AGENT_TYPES,
  getAgentTaskPriority,
  requiresApproval,
  type AgentActionType,
  type AgentFindingSeverity,
  type AgentTaskPriority,
  type AgentType,
} from './agents'

export type AgentAutomationTrigger = 'manual_admin' | 'make_webhook' | 'scheduled'

export interface ProductAutomationSnapshot {
  id: string
  name: string
  category: string
  status: 'candidate' | 'active' | 'paused' | 'discontinued'
  marginRate: number
  sniperScore: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  automationScore: number
  totalCost?: number | null
  domesticExpectedPrice?: number | null
  createdAt?: string | null
}

export interface OrderAutomationSnapshot {
  id: string
  orderRef?: string | null
  productName: string
  status: 'pending' | 'ordered' | 'shipping' | 'delivered' | 'cancelled'
  totalPrice: number
  createdAt: string
}

export interface AutomationLogSnapshot {
  id: string
  scenarioName: string
  status: 'running' | 'success' | 'failed' | 'partial'
  errorMessage?: string | null
  startedAt: string
}

export interface AgentAutomationInput {
  triggerType: AgentAutomationTrigger
  nowIso: string
  products: ProductAutomationSnapshot[]
  orders: OrderAutomationSnapshot[]
  failedAutomationLogs: AutomationLogSnapshot[]
}

export interface PlannedAgentRun {
  agentType: AgentType
  status: 'success' | 'partial'
  summary: string
}

export interface PlannedAgentTask {
  agentType: AgentType
  actionType: AgentActionType
  title: string
  priority: AgentTaskPriority
  requiresApproval: boolean
  targetType: string
  targetId: string
  recommendation: string
  payload: Record<string, unknown>
}

export interface PlannedAgentFinding {
  agentType: AgentType
  severity: AgentFindingSeverity
  title: string
  summary: string
  targetType: string
  targetId: string
  confidence: number
  payload: Record<string, unknown>
}

type FiveAgentRuns = readonly [
  PlannedAgentRun,
  PlannedAgentRun,
  PlannedAgentRun,
  PlannedAgentRun,
  PlannedAgentRun,
]

export interface AgentAutomationPlan {
  runs: FiveAgentRuns
  tasks: PlannedAgentTask[]
  findings: PlannedAgentFinding[]
}

const HIGH_VALUE_CANDIDATE_SCORE = 70
const LOW_MARGIN_RATE = 15
const CRITICAL_MARGIN_RATE = 10
const DELAYED_ORDER_HOURS = 24
const TARGET_MARGIN_RATE = 20

/**
 * 저마진 상품의 목표 마진율(20%) 복원 제안가를 계산한다.
 * marginRate = (price - totalCost) / price 이므로 price = totalCost / (1 - target).
 * 자율 실행 엔진은 proposedChangePct가 가격 변동 한도 내일 때만 자동 적용한다.
 */
function buildRepricingProposal(product: ProductAutomationSnapshot): Record<string, number> | null {
  const totalCost = product.totalCost ?? 0
  const currentPrice = product.domesticExpectedPrice ?? 0
  if (totalCost <= 0 || currentPrice <= 0) return null

  const rawPrice = totalCost / (1 - TARGET_MARGIN_RATE / 100)
  const proposedPrice = Math.ceil(rawPrice / 100) * 100
  if (proposedPrice <= 0 || proposedPrice === currentPrice) return null

  const expectedMargin = proposedPrice - totalCost
  return {
    domesticExpectedPrice: proposedPrice,
    expectedMargin,
    marginRate: (expectedMargin / proposedPrice) * 100,
    currentPrice,
    proposedChangePct: ((proposedPrice - currentPrice) / currentPrice) * 100,
  }
}

function hoursBetween(nowIso: string, thenIso: string): number {
  const deltaMs = Date.parse(nowIso) - Date.parse(thenIso)
  if (!Number.isFinite(deltaMs)) return 0
  return Math.max(0, deltaMs / (60 * 60 * 1000))
}

function task(input: Omit<PlannedAgentTask, 'requiresApproval'>): PlannedAgentTask {
  return {
    ...input,
    requiresApproval: requiresApproval(input.actionType),
  }
}

function summarize(agentType: AgentType, tasks: PlannedAgentTask[], findings: PlannedAgentFinding[]): PlannedAgentRun {
  const ownTasks = tasks.filter((item) => item.agentType === agentType).length
  const ownFindings = findings.filter((item) => item.agentType === agentType).length
  return {
    agentType,
    status: ownTasks > 0 || ownFindings > 0 ? 'partial' : 'success',
    summary: `tasks=${ownTasks}; findings=${ownFindings}`,
  }
}

export function buildAgentAutomationPlan(input: AgentAutomationInput): AgentAutomationPlan {
  const tasks: PlannedAgentTask[] = []
  const findings: PlannedAgentFinding[] = []

  for (const product of input.products) {
    if (product.status === 'candidate' && product.sniperScore >= HIGH_VALUE_CANDIDATE_SCORE) {
      tasks.push(task({
        agentType: 'product_discovery',
        actionType: 'review_candidate',
        title: `Review candidate: ${product.name}`,
        priority: getAgentTaskPriority({ confidence: product.sniperScore / 100 }),
        targetType: 'product',
        targetId: product.id,
        recommendation: `Sniper score ${product.sniperScore}. Review sourcing, pricing, and compliance before approval.`,
        payload: { triggerType: input.triggerType, sniperScore: product.sniperScore },
      }))
    }

    if ((product.status === 'active' || product.status === 'candidate') && product.marginRate < LOW_MARGIN_RATE) {
      const severity: AgentFindingSeverity = product.marginRate < CRITICAL_MARGIN_RATE ? 'critical' : 'warning'
      findings.push({
        agentType: 'margin_pricing',
        severity,
        title: `Low margin product: ${product.name}`,
        summary: `Current margin is ${product.marginRate.toFixed(1)}%.`,
        targetType: 'product',
        targetId: product.id,
        confidence: product.marginRate < CRITICAL_MARGIN_RATE ? 0.9 : 0.75,
        payload: { triggerType: input.triggerType, marginRate: product.marginRate },
      })
      const repricing = product.marginRate < CRITICAL_MARGIN_RATE ? null : buildRepricingProposal(product)
      tasks.push(task({
        agentType: 'margin_pricing',
        actionType: product.marginRate < CRITICAL_MARGIN_RATE ? 'pause_product' : 'update_price',
        title: `Protect margin: ${product.name}`,
        priority: getAgentTaskPriority({ marginRate: product.marginRate }),
        targetType: 'product',
        targetId: product.id,
        recommendation: product.marginRate < CRITICAL_MARGIN_RATE
          ? 'Pause or reprice before accepting new orders.'
          : repricing
            ? `Reprice to ${repricing.domesticExpectedPrice.toLocaleString()} KRW to restore ${TARGET_MARGIN_RATE}% margin (${repricing.proposedChangePct >= 0 ? '+' : ''}${repricing.proposedChangePct.toFixed(1)}%).`
            : 'Review landed cost and update selling price.',
        payload: { triggerType: input.triggerType, marginRate: product.marginRate, ...(repricing ?? {}) },
      }))
    }

    if (product.riskLevel === 'HIGH' || product.automationScore <= 2) {
      findings.push({
        agentType: 'compliance_risk',
        severity: product.riskLevel === 'HIGH' ? 'critical' : 'warning',
        title: `Risk review needed: ${product.name}`,
        summary: `Risk level ${product.riskLevel}; automation score ${product.automationScore}.`,
        targetType: 'product',
        targetId: product.id,
        confidence: product.riskLevel === 'HIGH' ? 0.85 : 0.7,
        payload: {
          triggerType: input.triggerType,
          category: product.category,
          riskLevel: product.riskLevel,
          automationScore: product.automationScore,
        },
      })
      tasks.push(task({
        agentType: 'compliance_risk',
        actionType: 'inspect_risk',
        title: `Inspect compliance risk: ${product.name}`,
        priority: getAgentTaskPriority({
          severity: product.riskLevel === 'HIGH' ? 'critical' : 'warning',
          confidence: product.riskLevel === 'HIGH' ? 0.85 : 0.7,
        }),
        targetType: 'product',
        targetId: product.id,
        recommendation: 'Check import restrictions, listing claims, and customer-facing notices before activation.',
        payload: { triggerType: input.triggerType, riskLevel: product.riskLevel },
      }))
    }
  }

  for (const order of input.orders) {
    const ageHours = hoursBetween(input.nowIso, order.createdAt)
    if ((order.status === 'pending' || order.status === 'ordered') && ageHours >= DELAYED_ORDER_HOURS) {
      findings.push({
        agentType: 'order_ops',
        severity: ageHours >= 48 ? 'critical' : 'warning',
        title: `Delayed order: ${order.orderRef ?? order.id}`,
        summary: `${order.productName} has been ${order.status} for ${Math.floor(ageHours)} hours.`,
        targetType: 'order',
        targetId: order.id,
        confidence: ageHours >= 48 ? 0.9 : 0.75,
        payload: { triggerType: input.triggerType, status: order.status, ageHours },
      })
      tasks.push(task({
        agentType: 'order_ops',
        actionType: 'update_order_status',
        title: `Follow up order: ${order.orderRef ?? order.id}`,
        priority: getAgentTaskPriority({ ageHours, isCustomerFacing: true }),
        targetType: 'order',
        targetId: order.id,
        recommendation: 'Confirm purchase, shipment, or customer notice before changing status.',
        payload: { triggerType: input.triggerType, status: order.status, totalPrice: order.totalPrice },
      }))
    }
  }

  for (const log of input.failedAutomationLogs) {
    findings.push({
      agentType: 'command_center',
      severity: 'warning',
      title: `Automation failed: ${log.scenarioName}`,
      summary: log.errorMessage ?? 'Automation scenario failed without a detailed error message.',
      targetType: 'automation_log',
      targetId: log.id,
      confidence: 0.8,
      payload: { triggerType: input.triggerType, status: log.status, startedAt: log.startedAt },
    })
    tasks.push(task({
      agentType: 'command_center',
      actionType: 'review_automation_failure',
      title: `Review automation failure: ${log.scenarioName}`,
      priority: 'high',
      targetType: 'automation_log',
      targetId: log.id,
      recommendation: 'Review Make.com scenario history and rerun only after the root cause is identified.',
      payload: { triggerType: input.triggerType, errorMessage: log.errorMessage ?? null },
    }))
  }

  const runs = AGENT_TYPES.map((agentType) => summarize(agentType, tasks, findings)) as unknown as FiveAgentRuns

  return { runs, tasks, findings }
}
