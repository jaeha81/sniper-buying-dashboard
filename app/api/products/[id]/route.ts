import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getProductById } from '@/data/sample-products'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import type { Product } from '@/lib/types'

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

function productToRow(p: Partial<Product>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
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

// ─── GET /api/products/[id] ───────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = await createClient()

    if (!supabase) {
      const product = getProductById(id)
      if (!product) {
        return NextResponse.json({ error: '상품을 찾을 수 없습니다.' }, { status: 404 })
      }
      return NextResponse.json({ product, source: 'sample' })
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '상품을 찾을 수 없습니다.' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ product: rowToProduct(data) })
  } catch (err) {
    console.error(`[GET /api/products/${id}]`, err)
    return NextResponse.json({ error: '상품 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

// ─── PUT /api/products/[id] ───────────────────────────────────────────────────

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body: Partial<Product> = await request.json()

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase가 구성되지 않아 쓰기 작업을 수행할 수 없습니다.' },
        { status: 503 }
      )
    }

    const row = productToRow(body)
    const { data, error } = await supabase
      .from('products')
      .update(row)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '상품을 찾을 수 없습니다.' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ product: rowToProduct(data) })
  } catch (err) {
    console.error(`[PUT /api/products/${id}]`, err)
    return NextResponse.json({ error: '상품 수정 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

// ─── DELETE /api/products/[id] ────────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase가 구성되지 않아 쓰기 작업을 수행할 수 없습니다.' },
        { status: 503 }
      )
    }

    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[DELETE /api/products/${id}]`, err)
    return NextResponse.json({ error: '상품 삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
