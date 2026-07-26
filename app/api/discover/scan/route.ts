import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'

const IHERB_SEED_URLS: Record<string, string[]> = {
  health: [
    'https://www.iherb.com/pr/now-foods-vitamin-d-3-5-000-iu/14888',
    'https://www.iherb.com/pr/jarrow-formulas-methylcobalamin/454',
    'https://www.iherb.com/pr/now-foods-omega-3/389',
    'https://www.iherb.com/pr/natrol-melatonin-fast-dissolve/27081',
    'https://www.iherb.com/pr/california-gold-nutrition-vitamin-c/52970',
  ],
  sports: [
    'https://www.iherb.com/pr/optimum-nutrition-gold-standard-100-whey-protein/27569',
    'https://www.iherb.com/pr/now-foods-l-glutamine-powder/21167',
  ],
  beauty: [
    'https://www.iherb.com/pr/derma-e-vitamin-c-serum/62370',
    'https://www.iherb.com/pr/andalou-naturals-1000-roses/70440',
  ],
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  let body: { site?: string; category?: string; urls?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { site = 'iherb', category = 'health', urls: customUrls } = body

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 503 })
  }

  const urlsToScan: string[] =
    customUrls && customUrls.length > 0
      ? customUrls.slice(0, 50)
      : (IHERB_SEED_URLS[category] ?? IHERB_SEED_URLS.health)

  const { data: job, error: jobError } = await supabase
    .from('scan_jobs')
    .insert({
      job_type: 'category_scan',
      source_site: site,
      category,
      status: 'queued',
      total_items: urlsToScan.length,
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Failed to create scan job' }, { status: 500 })
  }

  const items = urlsToScan.map((url) => ({
    job_id: job.id,
    url,
    status: 'queued' as const,
  }))

  const { error: itemsError } = await supabase.from('scan_items').insert(items)
  if (itemsError) {
    return NextResponse.json({ error: 'Failed to create scan items' }, { status: 500 })
  }

  return NextResponse.json({
    jobId: job.id,
    totalItems: urlsToScan.length,
    message: `${urlsToScan.length}개 상품 스캔 큐에 등록됨. Make.com이 순차 처리합니다.`,
  })
}
