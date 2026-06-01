import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ jobs: [] })
  }

  const { data: jobs, error } = await supabase
    .from('scan_jobs')
    .select('id, job_type, source_site, category, status, total_items, processed_items, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: 'Failed to load scan jobs' }, { status: 500 })
  }

  return NextResponse.json({ jobs: jobs ?? [] })
}
