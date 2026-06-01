import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { hasValidAutomationSecret } from '@/lib/automation-auth'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { cookies } from 'next/headers'
import { discoverUrl, type DiscoverySite } from '@/lib/discovery-pipeline'
import { notifyAdmin } from '@/lib/notify'

async function isAuthorized(request: Request) {
  if (hasValidAutomationSecret(request)) return true
  const cookieStore = await cookies()
  return isAdminAuthenticated(cookieStore)
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { jobId?: string; itemId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { jobId, itemId } = body
  if (!jobId && !itemId) {
    return NextResponse.json({ error: 'jobId 또는 itemId 필요' }, { status: 400 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  let item: { id: string; job_id: string; url: string; status: string } | null = null

  if (itemId) {
    const { data } = await supabase
      .from('scan_items')
      .select('id, job_id, url, status')
      .eq('id', itemId)
      .single()
    item = data
  } else {
    const { data } = await supabase
      .from('scan_items')
      .select('id, job_id, url, status')
      .eq('job_id', jobId!)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    item = data
  }

  if (!item) {
    return NextResponse.json({ message: '처리할 항목 없음', done: true })
  }

  if (item.status !== 'queued') {
    return NextResponse.json({ message: `이미 처리됨: ${item.status}`, done: false })
  }

  await supabase
    .from('scan_items')
    .update({ status: 'processing' })
    .eq('id', item.id)

  const { data: jobRow } = await supabase
    .from('scan_jobs')
    .select('source_site')
    .eq('id', item.job_id)
    .single()

  const site = (jobRow?.source_site ?? 'other') as DiscoverySite
  const result = await discoverUrl(item.url, site)

  await supabase
    .from('scan_items')
    .update({
      status: result.status === 'failed' ? 'failed' : 'done',
      result_product_id: result.status === 'created' ? result.productId : null,
      error_message: result.status === 'failed' ? result.reason : null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', item.id)

  // job processed_items 증가 (수동 방식 — RPC 없이)
  const { data: currentJob } = await supabase
    .from('scan_jobs')
    .select('processed_items')
    .eq('id', item.job_id)
    .single()

  if (currentJob) {
    await supabase
      .from('scan_jobs')
      .update({ processed_items: currentJob.processed_items + 1 })
      .eq('id', item.job_id)
  }

  const { count: remaining } = await supabase
    .from('scan_items')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', item.job_id)
    .eq('status', 'queued')

  const allDone = (remaining ?? 0) === 0
  if (allDone) {
    await supabase
      .from('scan_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', item.job_id)

    const { count: createdCount } = await supabase
      .from('scan_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', item.job_id)
      .eq('status', 'done')

    await notifyAdmin(
      `스캔 완료: ${createdCount ?? 0}개 후보 발굴`,
      'info',
      { jobId: item.job_id, created: createdCount }
    )
  }

  return NextResponse.json({ result, itemId: item.id, remainingItems: remaining ?? 0 })
}
