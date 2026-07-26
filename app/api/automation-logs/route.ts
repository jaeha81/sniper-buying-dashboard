import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { hasValidAutomationSecret } from '@/lib/automation-auth'

type AutomationLogBody = {
  scenarioName: string
  scenarioId?: string
  triggerType?: string
  status?: 'running' | 'success' | 'failed' | 'partial'
  opsConsumed?: number
  recordsProcessed?: number
  recordsCreated?: number
  recordsUpdated?: number
  recordsFailed?: number
  errorMessage?: string
  errorDetail?: Record<string, unknown>
  payload?: Record<string, unknown>
  startedAt?: string
  completedAt?: string
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    if (!supabase) {
      return NextResponse.json({ logs: [] })
    }

    const { data, error } = await supabase
      .from('automation_logs')
      .select(
        'id, scenario_name, trigger_type, status, ops_consumed, records_processed, error_message, started_at, completed_at, duration_ms'
      )
      .order('started_at', { ascending: false })
      .limit(100)

    if (error) {
      // Table may not exist yet in Supabase
      if (error.code === '42P01') {
        return NextResponse.json({ logs: [] })
      }
      throw error
    }

    return NextResponse.json({ logs: data ?? [] })
  } catch (err) {
    console.error('[GET /api/automation-logs]', err)
    return NextResponse.json({ error: 'Failed to load automation logs.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!hasValidAutomationSecret(request)) {
    return NextResponse.json({ error: 'Valid automation secret is required.' }, { status: 401 })
  }

  try {
    const body: AutomationLogBody = await request.json()
    if (!body.scenarioName) {
      return NextResponse.json({ error: 'scenarioName is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 503 })
    }

    const startedAt = body.startedAt ?? new Date().toISOString()
    const completedAt = body.completedAt ?? null
    const durationMs =
      completedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) : null

    const { data, error } = await supabase
      .from('automation_logs')
      .insert({
        scenario_name: body.scenarioName,
        scenario_id: body.scenarioId ?? null,
        trigger_type: body.triggerType ?? null,
        status: body.status ?? 'success',
        ops_consumed: body.opsConsumed ?? 0,
        records_processed: body.recordsProcessed ?? 0,
        records_created: body.recordsCreated ?? 0,
        records_updated: body.recordsUpdated ?? 0,
        records_failed: body.recordsFailed ?? 0,
        error_message: body.errorMessage ?? null,
        error_detail: body.errorDetail ?? null,
        payload: body.payload ?? null,
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: durationMs,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ log: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/automation-logs]', err)
    return NextResponse.json({ error: 'Failed to create automation log.' }, { status: 500 })
  }
}
