import {
  buildAgentAutomationPlan,
  type AgentAutomationInput,
  type AgentAutomationPlan,
} from './agent-automation'

const input: AgentAutomationInput = {
  triggerType: 'manual_admin',
  nowIso: '2026-06-01T00:00:00.000Z',
  products: [
    {
      id: 'prod-1',
      name: 'Candidate product',
      category: 'health',
      status: 'candidate',
      marginRate: 9,
      sniperScore: 72,
      riskLevel: 'HIGH',
      automationScore: 2,
      createdAt: '2026-05-30T00:00:00.000Z',
    },
  ],
  orders: [
    {
      id: 'order-1',
      orderRef: 'SB-1',
      productName: 'Delayed order',
      status: 'pending',
      totalPrice: 45000,
      createdAt: '2026-05-29T00:00:00.000Z',
    },
  ],
  failedAutomationLogs: [
    {
      id: 'log-1',
      scenarioName: 'Make product scout',
      status: 'failed',
      errorMessage: 'timeout',
      startedAt: '2026-05-31T00:00:00.000Z',
    },
  ],
}

const plan: AgentAutomationPlan = buildAgentAutomationPlan(input)

const hasFiveAgentRuns: 5 = plan.runs.length
const hasTasks: boolean = plan.tasks.length > 0
const hasFindings: boolean = plan.findings.length > 0

void hasFiveAgentRuns
void hasTasks
void hasFindings
