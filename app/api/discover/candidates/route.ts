import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ candidates: [] })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100)

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name, category, source_url, source_site, status, sniper_score, margin_rate, ' +
      'expected_margin, domestic_expected_price, overseas_price, risk_level, ' +
      'ai_confidence, exchange_rate_snapshot, image_url, created_at'
    )
    .eq('status', 'candidate')
    .order('sniper_score', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: 'Failed to load candidates' }, { status: 500 })
  }

  return NextResponse.json({ candidates: data ?? [] })
}
