import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'

export async function GET() {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  try {
    const supabase = await createClient()
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
