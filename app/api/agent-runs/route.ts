import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { buildAgentAutomationPlan, type AgentAutomationTrigger } from '@/lib/agent-automation'
import { hasValidAutomationSecret } from '@/lib/automation-auth'
import { createServiceClient } from '@/lib/supabase/server'

type ProductRow = {
  id: string
  name: string
  category: string
  status: 'candidate' | 'active' | 'paused' | 'discontinued'
  margin_rate: number | string
  sniper_score: number
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  automation_score: number
  created_at: string | null
}

type OrderRow = {
  id: string
  order_ref: string | null
  product_name: string
  status: 'pending' | 'ordered' | 'shipping' | 'delivered' | 'cancelled'
  total_price: number | string
  created_at: string
}

type FailedLogRow = {
  id: string
  scenario_name: string
  status: 'failed'
  error_message: string | null
  started_at: string
}

type ExistingTaskRow = {
  agent_type: string
  action_type: string
  target_type: string | null
  target_id: string | null
}

type ExistingFindingRow = {
  agent_type: string
  severity: string
  target_type: string | null
  target_id: string | null
}

function keyOf(parts: Array<string | null | undefined>) {
  return parts.map((part) => part ?? '').join('|')
}

async function isAuthorized(request: Request) {
  if (hasValidAutomationSecret(request)) return true
  const cookieStore = await cookies()
  return isAdminAuthenticated(cookieStore)
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Admin authentication or automation secret is required.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 503 })
  }

  let triggerType: AgentAutomationTrigger = hasValidAutomationSecret(request) ? 'make_webhook' : 'manual_admin'
  try {
    const body = await request.json().catch(() => ({}))
    if (body?.triggerType === 'scheduled' || body?.triggerType === 'manual_admin' || body?.triggerType === 'make_webhook') {
      triggerType = body.triggerType
    }
  } catch {
    // Empty or malformed JSON falls back to the auth-derived trigger type.
  }

  const nowIso = new Date().toISOString()

  try {
    const [productsResult, ordersResult, logsResult, tasksResult, findingsResult] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, category, status, margin_rate, sniper_score, risk_level, automation_score, created_at')
        .in('status', ['candidate', 'active', 'paused'])
        .limit(500),
      supabase
        .from('orders')
        .select('id, order_ref, product_name, status, total_price, created_at')
        .in('status', ['pending', 'ordered'])
        .limit(500),
      supabase
        .from('automation_logs')
        .select('id, scenario_name, status, error_message, started_at')
        .eq('status', 'failed')
        .order('started_at', { ascending: false })
        .limit(50),
      supabase
        .from('agent_tasks')
        .select('agent_type, action_type, target_type, target_id')
        .in('status', ['pending', 'approved', 'running'])
        .limit(1000),
      supabase
        .from('agent_findings')
        .select('agent_type, severity, target_type, target_id')
        .is('resolved_at', null)
        .limit(1000),
    ])

    for (const result of [productsResult, ordersResult, logsResult, tasksResult, findingsResult]) {
      if (result.error) throw result.error
    }

    const plan = buildAgentAutomationPlan({
      triggerType,
      nowIso,
      products: ((productsResult.data ?? []) as ProductRow[]).map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        status: product.status,
        marginRate: Number(product.margin_rate),
        sniperScore: Number(product.sniper_score),
        riskLevel: product.risk_level,
        automationScore: Number(product.automation_score),
        createdAt: product.created_at,
      })),
      orders: ((ordersResult.data ?? []) as OrderRow[]).map((order) => ({
        id: order.id,
        orderRef: order.order_ref,
        productName: order.product_name,
        status: order.status,
        totalPrice: Number(order.total_price),
        createdAt: order.created_at,
      })),
      failedAutomationLogs: ((logsResult.data ?? []) as FailedLogRow[]).map((log) => ({
        id: log.id,
        scenarioName: log.scenario_name,
        status: log.status,
        errorMessage: log.error_message,
        startedAt: log.started_at,
      })),
    })

    const activeTaskKeys = new Set(
      ((tasksResult.data ?? []) as ExistingTaskRow[]).map((task) =>
        keyOf([task.agent_type, task.action_type, task.target_type, task.target_id])
      )
    )
    const openFindingKeys = new Set(
      ((findingsResult.data ?? []) as ExistingFindingRow[]).map((finding) =>
        keyOf([finding.agent_type, finding.severity, finding.target_type, finding.target_id])
      )
    )

    const newTasks = plan.tasks.filter((task) =>
      !activeTaskKeys.has(keyOf([task.agentType, task.actionType, task.targetType, task.targetId]))
    )
    const newFindings = plan.findings.filter((finding) =>
      !openFindingKeys.has(keyOf([finding.agentType, finding.severity, finding.targetType, finding.targetId]))
    )

    const runRows = plan.runs.map((run) => ({
      agent_type: run.agentType,
      status: run.status,
      trigger_type: triggerType,
      summary: run.summary,
      input_payload: {
        products: productsResult.data?.length ?? 0,
        orders: ordersResult.data?.length ?? 0,
        failedAutomationLogs: logsResult.data?.length ?? 0,
      },
      output_payload: {
        plannedTasks: plan.tasks.length,
        plannedFindings: plan.findings.length,
        insertedTasks: newTasks.length,
        insertedFindings: newFindings.length,
      },
      completed_at: nowIso,
    }))

    const { error: runError } = await supabase.from('agent_runs').insert(runRows)
    if (runError) throw runError

    if (newTasks.length > 0) {
      const { error } = await supabase.from('agent_tasks').insert(newTasks.map((task) => ({
        agent_type: task.agentType,
        action_type: task.actionType,
        status: 'pending',
        priority: task.priority,
        title: task.title,
        recommendation: task.recommendation,
        target_type: task.targetType,
        target_id: task.targetId,
        requires_approval: task.requiresApproval,
        payload: task.payload,
      })))
      if (error) throw error
    }

    if (newFindings.length > 0) {
      const { error } = await supabase.from('agent_findings').insert(newFindings.map((finding) => ({
        agent_type: finding.agentType,
        severity: finding.severity,
        title: finding.title,
        summary: finding.summary,
        target_type: finding.targetType,
        target_id: finding.targetId,
        confidence: finding.confidence,
        payload: finding.payload,
      })))
      if (error) throw error
    }

    await supabase.from('automation_logs').insert({
      scenario_name: 'agent_operating_system_scan',
      trigger_type: triggerType,
      status: 'success',
      records_processed: (productsResult.data?.length ?? 0) + (ordersResult.data?.length ?? 0) + (logsResult.data?.length ?? 0),
      records_created: newTasks.length + newFindings.length + runRows.length,
      payload: {
        plannedTasks: plan.tasks.length,
        plannedFindings: plan.findings.length,
        insertedTasks: newTasks.length,
        insertedFindings: newFindings.length,
      },
      started_at: nowIso,
      completed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      triggerType,
      runs: plan.runs,
      plannedTasks: plan.tasks.length,
      plannedFindings: plan.findings.length,
      insertedTasks: newTasks.length,
      insertedFindings: newFindings.length,
    })
  } catch (err) {
    console.error('[POST /api/agent-runs]', err)
    return NextResponse.json({ error: 'Failed to run agent automation scan.' }, { status: 500 })
  }
}
