import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/admin/diagnostics
// 자율 엔진 현재 상태 전체 스냅샷 반환
export async function GET() {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 503 })
  }

  const [
    autonomyResult,
    pendingTasksResult,
    openFindingsResult,
    recentRunsResult,
    productStatsResult,
    autoActionsResult,
  ] = await Promise.all([
    supabase.from('autonomy_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('agent_tasks').select('id, agent_type, action_type, priority, title, status, created_at').in('status', ['pending', 'approved', 'running']).order('created_at', { ascending: false }),
    supabase.from('agent_findings').select('id, agent_type, severity, title, created_at').is('resolved_at', null).order('created_at', { ascending: false }),
    supabase.from('agent_runs').select('agent_type, status, trigger_type, summary, completed_at').order('completed_at', { ascending: false }).limit(10),
    supabase.from('products').select('status, margin_rate').in('status', ['active', 'candidate', 'paused']),
    supabase.from('agent_tasks').select('id').eq('executed_by', 'autonomy').gte('executed_at', new Date(Date.now() - 86400000).toISOString()),
  ])

  const products = productStatsResult.data ?? []
  const lowMargin = products.filter((p) => Number(p.margin_rate) < 10).length
  const healthyMargin = products.filter((p) => Number(p.margin_rate) >= 10).length

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    env: {
      slackConfigured: Boolean(process.env.SLACK_WEBHOOK_URL),
      automationSecretConfigured: Boolean(process.env.AUTOMATION_WEBHOOK_SECRET),
      supabaseConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    autonomyPolicy: autonomyResult.data ?? null,
    tasks: {
      pending: pendingTasksResult.data?.filter((t) => t.status === 'pending').length ?? 0,
      approved: pendingTasksResult.data?.filter((t) => t.status === 'approved').length ?? 0,
      running: pendingTasksResult.data?.filter((t) => t.status === 'running').length ?? 0,
      items: pendingTasksResult.data ?? [],
    },
    findings: {
      total: openFindingsResult.data?.length ?? 0,
      critical: openFindingsResult.data?.filter((f) => f.severity === 'critical').length ?? 0,
      high: openFindingsResult.data?.filter((f) => f.severity === 'high').length ?? 0,
      items: openFindingsResult.data ?? [],
    },
    products: {
      total: products.length,
      lowMargin,
      healthyMargin,
    },
    recentRuns: recentRunsResult.data ?? [],
    autoActionsLast24h: autoActionsResult.data?.length ?? 0,
  })
}

// DELETE /api/admin/diagnostics
// 해결된 findings 일괄 정리 + 완료된 tasks 아카이브
export async function DELETE() {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 503 })
  }

  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString()

  const [findingsResult, tasksResult] = await Promise.all([
    // 7일 이상 지난 resolved findings 삭제
    supabase.from('agent_findings').delete().not('resolved_at', 'is', null).lt('resolved_at', cutoff),
    // 7일 이상 지난 completed/rejected tasks 삭제
    supabase.from('agent_tasks').delete().in('status', ['completed', 'rejected', 'skipped']).lt('created_at', cutoff),
  ])

  return NextResponse.json({
    cleaned: {
      findings: findingsResult.error ? 0 : 'ok',
      tasks: tasksResult.error ? 0 : 'ok',
    },
    errors: [findingsResult.error?.message, tasksResult.error?.message].filter(Boolean),
  })
}
