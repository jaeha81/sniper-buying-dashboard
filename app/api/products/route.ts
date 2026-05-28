import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sampleProducts } from '@/data/sample-products'
import type { Product } from '@/lib/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function isAdminAuthenticated(cookieStore: Awaited<ReturnType<typeof cookies>>): boolean {
  const session = cookieStore.get('admin_session')?.value
  const adminPass = process.env.ADMIN_PASSWORD ?? 'sniper2026'
  return session === adminPass || session === 'authenticated'
}

// DB row (snake_case) → TypeScript Product (camelCase)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProduct(row: Record<string, any>): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? '',
    overseasPrice: Number(row.overseas_price),
    localShippingCost: Number(row.local_shipping_cost),
    internationalShippingCost: Number(row.international_shipping_cost),
    domesticExpectedPrice: Number(row.domestic_expected_price),
    taxEstimate: Number(row.tax_estimate),
    paymentFee: Number(row.payment_fee),
    domesticShippingCost: Number(row.domestic_shipping_cost),
    otherCosts: Number(row.other_costs),
    totalCost: Number(row.total_cost),
    expectedMargin: Number(row.expected_margin),
    marginRate: Number(row.margin_rate),
    sniperScore: Number(row.sniper_score),
    riskLevel: row.risk_level,
    sourceUrl: row.source_url ?? '',
    competitorUrl: row.competitor_url ?? '',
    status: row.status,
    demandScore: Number(row.demand_score),
    priceCompetitivenessScore: Number(row.price_competitiveness_score),
    shippingStabilityScore: Number(row.shipping_stability_score),
    competitionLevel: row.competition_level,
    pageConvincingScore: Number(row.page_convincing_score),
    automationScore: Number(row.automation_score),
    imageUrl: row.image_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// TypeScript Product (camelCase) → DB columns (snake_case)
function productToRow(p: Partial<Product>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (p.id !== undefined) row.id = p.id
  if (p.name !== undefined) row.name = p.name
  if (p.category !== undefined) row.category = p.category
  if (p.description !== undefined) row.description = p.description
  if (p.overseasPrice !== undefined) row.overseas_price = p.overseasPrice
  if (p.localShippingCost !== undefined) row.local_shipping_cost = p.localShippingCost
  if (p.internationalShippingCost !== undefined) row.international_shipping_cost = p.internationalShippingCost
  if (p.domesticExpectedPrice !== undefined) row.domestic_expected_price = p.domesticExpectedPrice
  if (p.taxEstimate !== undefined) row.tax_estimate = p.taxEstimate
  if (p.paymentFee !== undefined) row.payment_fee = p.paymentFee
  if (p.domesticShippingCost !== undefined) row.domestic_shipping_cost = p.domesticShippingCost
  if (p.otherCosts !== undefined) row.other_costs = p.otherCosts
  if (p.totalCost !== undefined) row.total_cost = p.totalCost
  if (p.expectedMargin !== undefined) row.expected_margin = p.expectedMargin
  if (p.marginRate !== undefined) row.margin_rate = p.marginRate
  if (p.sniperScore !== undefined) row.sniper_score = p.sniperScore
  if (p.riskLevel !== undefined) row.risk_level = p.riskLevel
  if (p.sourceUrl !== undefined) row.source_url = p.sourceUrl
  if (p.competitorUrl !== undefined) row.competitor_url = p.competitorUrl
  if (p.status !== undefined) row.status = p.status
  if (p.demandScore !== undefined) row.demand_score = p.demandScore
  if (p.priceCompetitivenessScore !== undefined) row.price_competitiveness_score = p.priceCompetitivenessScore
  if (p.shippingStabilityScore !== undefined) row.shipping_stability_score = p.shippingStabilityScore
  if (p.competitionLevel !== undefined) row.competition_level = p.competitionLevel
  if (p.pageConvincingScore !== undefined) row.page_convincing_score = p.pageConvincingScore
  if (p.automationScore !== undefined) row.automation_score = p.automationScore
  if (p.imageUrl !== undefined) row.image_url = p.imageUrl
  return row
}

// ─── GET /api/products ────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')

  try {
    const supabase = await createClient()

    if (!supabase) {
      // Supabase not configured — return sample data
      const products = statusFilter
        ? sampleProducts.filter((p) => p.status === statusFilter)
        : sampleProducts
      return NextResponse.json({ products, source: 'sample' })
    }

    let query = supabase.from('products').select('*').order('created_at', { ascending: false })
    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query
    if (error) throw error

    const products = (data ?? []).map(rowToProduct)
    return NextResponse.json({ products, source: 'supabase' })
  } catch (err) {
    console.error('[GET /api/products]', err)
    return NextResponse.json({ error: '상품 목록 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

// ─── POST /api/products ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  try {
    const body: Partial<Product> = await request.json()

    if (!body.id || !body.name || !body.category) {
      return NextResponse.json(
        { error: 'id, name, category 필드는 필수입니다.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase가 구성되지 않아 쓰기 작업을 수행할 수 없습니다.' },
        { status: 503 }
      )
    }

    const row = productToRow(body)
    const { data, error } = await supabase.from('products').insert(row).select().single()
    if (error) throw error

    return NextResponse.json({ product: rowToProduct(data) }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/products]', err)
    return NextResponse.json({ error: '상품 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
