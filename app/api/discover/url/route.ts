import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { discoverUrl, type DiscoverySite } from '@/lib/discovery-pipeline'
import { notifyAdmin } from '@/lib/notify'

const VALID_SITES: DiscoverySite[] = ['iherb', 'amazon', 'vitacost', 'costco', 'other']

function detectSite(url: string): DiscoverySite {
  if (url.includes('iherb.com')) return 'iherb'
  if (url.includes('amazon.com') || url.includes('amazon.co')) return 'amazon'
  if (url.includes('vitacost.com')) return 'vitacost'
  if (url.includes('costco.com')) return 'costco'
  return 'other'
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  let body: { url?: string; site?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url, site: siteInput } = body

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url 필드가 필요합니다.' }, { status: 400 })
  }

  try {
    new URL(url)
  } catch {
    return NextResponse.json({ error: '유효하지 않은 URL입니다.' }, { status: 400 })
  }

  const site: DiscoverySite =
    siteInput && VALID_SITES.includes(siteInput as DiscoverySite)
      ? (siteInput as DiscoverySite)
      : detectSite(url)

  const result = await discoverUrl(url, site)

  if (result.status === 'created') {
    await notifyAdmin(
      `새 상품 후보 발굴: Score ${result.sniperScore}점 / 마진 ${result.marginRate?.toFixed(1)}%`,
      'info',
      { url, site, sniperScore: result.sniperScore, marginRate: result.marginRate }
    )
    return NextResponse.json({ result }, { status: 201 })
  }

  if (result.status === 'duplicate') {
    return NextResponse.json({ result }, { status: 200 })
  }

  return NextResponse.json({ result }, { status: 422 })
}
