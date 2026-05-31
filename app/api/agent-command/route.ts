import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { AGENT_TYPES, AGENT_TYPE_LABELS, type AgentType } from '@/lib/agents'

async function requireAdmin() {
  const cookieStore = await cookies()
  return isAdminAuthenticated(cookieStore)
}

function emptyAgentSummary() {
  return AGENT_TYPES.map((agentType) => ({
    agentType,
    label: AGENT_TYPE_LABELS[agentType],
    pendingTasks: 0,
    criticalFindings: 0,
    failedRuns: 0,
  }))
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({
      agents: emptyAgentSummary(),
      pendingTasks: [],
      criticalFindings: [],
      failedAutomationLogs: [],
      lowMarginProducts: [],
      delayedOrders: [],
      source: 'unconfigured',
    })
  }

  try {
    const delayedSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
      tasksResult,
      findingsResult,
      logsResult,
      productsResult,
      ordersResult,
      failedRunsResult,
    ] = await Promise.all([
      supabase
        .from('agent_tasks')
        .select('id, agent_type, action_type, status, priority, title, recommendation, target_type, target_id, requires_approval, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('agent_findings')
        .select('id, agent_type, severity, title, summary, target_type, target_id, confidence, created_at')
        .eq('severity', 'critical')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('automation_logs')
        .select('id, scenario_name, trigger_type, status, error_message, started_at')
        .eq('status', 'failed')
        .order('started_at', { ascending: false })
        .limit(10),
      supabase
        .from('products')
        .select('id, name, margin_rate, sniper_score, status')
        .eq('status', 'active')
        .lt('margin_rate', 15)
        .order('margin_rate', { ascending: true })
        .limit(10),
      supabase
        .from('orders')
        .select('id, order_ref, product_name, status, total_price, created_at')
        .in('status', ['pending', 'ordered'])
        .lt('created_at', delayedSince)
        .order('created_at', { ascending: true })
        .limit(10),
      supabase
        .from('agent_runs')
        .select('agent_type')
        .eq('status', 'failed')
        .gte('created_at', delayedSince),
    ])

    const tableMissing = [
      tasksResult.error,
      findingsResult.error,
      logsResult.error,
      failedRunsResult.error,
    ].some((error) => error?.code === '42P01')

    if (tableMissing) {
      return NextResponse.json({
        agents: emptyAgentSummary(),
        pendingTasks: [],
        criticalFindings: [],
        failedAutomationLogs: [],
        lowMarginProducts: productsResult.data ?? [],
        delayedOrders: ordersResult.data ?? [],
        source: 'schema_missing',
      })
    }

    for (const result of [tasksResult, findingsResult, logsResult, productsResult, ordersResult, failedRunsResult]) {
      if (result.error) throw result.error
    }

    const pendingTasks = tasksResult.data ?? []
    const criticalFindings = findingsResult.data ?? []
    const failedRuns = failedRunsResult.data ?? []

    const agents = AGENT_TYPES.map((agentType: AgentType) => ({
      agentType,
      label: AGENT_TYPE_LABELS[agentType],
      pendingTasks: pendingTasks.filter((task) => task.agent_type === agentType).length,
      criticalFindings: criticalFindings.filter((finding) => finding.agent_type === agentType).length,
      failedRuns: failedRuns.filter((run) => run.agent_type === agentType).length,
    }))

    return NextResponse.json({
      agents,
      pendingTasks,
      criticalFindings,
      failedAutomationLogs: logsResult.data ?? [],
      lowMarginProducts: productsResult.data ?? [],
      delayedOrders: ordersResult.data ?? [],
      source: 'supabase',
    })
  } catch (err) {
    console.error('[GET /api/agent-command]', err)
    return NextResponse.json({ error: 'Failed to load agent command data.' }, { status: 500 })
  }
}
