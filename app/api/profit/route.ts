import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'
import {
  summarizeProfit,
  explainVariance,
  costWaterfall,
  conversionFunnel,
  rankContribution,
  type ExpenseRecord,
  type OrderRecord,
  type RefundRecord,
  type SettlementRecord,
  type ContributionRow,
} from '@/lib/profit-engine'

// GET /api/profit?days=30 — 수익 대시보드 (지시서 §15)
//
// 지시서 §18: "수익은 주문·정산·비용에서 계산한다."
// 이 라우트는 profit_daily 캐시를 읽지 않고 원본에서 계산한다 —
// 캐시가 틀렸을 때 화면이 틀린 숫자를 보여주면 안 되기 때문이다.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const daysRaw = Number(searchParams.get('days') ?? 30)
  const days = Number.isInteger(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30

  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)
  const sinceIso = since.toISOString()

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase가 구성되지 않았습니다.' }, { status: 503 })
  }

  const [ordersRes, settlementsRes, expensesRes, refundsRes, itemsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, total_price, status, payment_status, created_at')
      .gte('created_at', sinceIso),
    supabase
      .from('settlements')
      .select('order_id, gross_amount, channel_fee, payment_fee, promotion_share, adjustment, net_amount, status')
      .gte('created_at', sinceIso),
    supabase
      .from('expenses')
      .select('order_id, product_id, category, amount, verified')
      .gte('incurred_on', sinceIso.slice(0, 10)),
    supabase.from('refunds').select('order_id, amount, status').gte('created_at', sinceIso),
    supabase
      .from('order_items')
      .select('order_id, product_id, product_name, quantity, total_price, expected_unit_cost')
      .gte('created_at', sinceIso),
  ])

  // 011 미적용이면 대부분이 에러다. 0원이라고 보고하면 "수익이 0"과
  // "측정 불가"를 구분할 수 없다.
  const missing = [
    settlementsRes.error && 'settlements',
    expensesRes.error && 'expenses',
    refundsRes.error && 'refunds',
    itemsRes.error && 'order_items',
  ].filter(Boolean)

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: '수익 계산에 필요한 테이블이 없습니다. 011_commerce.sql 적용 여부를 확인하세요.',
        missingTables: missing,
      },
      { status: 503 }
    )
  }

  // 주문별 예상 순이익을 order_items에서 합산한다.
  const expectedByOrder = new Map<string, number>()
  for (const item of itemsRes.data ?? []) {
    const expected =
      Number(item.total_price) - Number(item.expected_unit_cost) * Number(item.quantity)
    expectedByOrder.set(item.order_id, (expectedByOrder.get(item.order_id) ?? 0) + expected)
  }

  const orders: OrderRecord[] = (ordersRes.data ?? []).map((o) => ({
    id: o.id,
    totalPrice: Number(o.total_price),
    status: o.status,
    // 007에서 추가한 열. 미적용이면 undefined → unconfirmed로 취급한다.
    paymentStatus: (o.payment_status ?? 'unconfirmed') as OrderRecord['paymentStatus'],
    expectedNetProfit: expectedByOrder.get(o.id) ?? 0,
  }))

  const settlements: SettlementRecord[] = (settlementsRes.data ?? []).map((s) => ({
    orderId: s.order_id,
    grossAmount: Number(s.gross_amount),
    channelFee: Number(s.channel_fee),
    paymentFee: Number(s.payment_fee),
    promotionShare: Number(s.promotion_share),
    adjustment: Number(s.adjustment),
    netAmount: Number(s.net_amount),
    status: s.status,
  }))

  const expenses: ExpenseRecord[] = (expensesRes.data ?? []).map((e) => ({
    orderId: e.order_id,
    productId: e.product_id,
    category: e.category,
    amount: Number(e.amount),
    verified: Boolean(e.verified),
  }))

  const refunds: RefundRecord[] = (refundsRes.data ?? []).map((r) => ({
    orderId: r.order_id,
    amount: Number(r.amount),
    status: r.status,
  }))

  const summary = summarizeProfit({ orders, settlements, expenses, refunds })

  // ── 상품별 기여도 ───────────────────────────────────────────
  const settlementByOrder = new Map<string, number>()
  for (const s of settlements) {
    if (!s.orderId) continue
    if (s.status !== 'confirmed' && s.status !== 'paid') continue
    settlementByOrder.set(s.orderId, (settlementByOrder.get(s.orderId) ?? 0) + s.netAmount)
  }

  const productRows = new Map<string, ContributionRow>()
  for (const item of itemsRes.data ?? []) {
    const key = item.product_id
    const row =
      productRows.get(key) ??
      { key, label: item.product_name, orderCount: 0, netSettlement: 0, expense: 0, netProfit: 0, marginPct: 0 }

    row.orderCount += 1
    // 주문 정산액을 품목 금액 비중으로 배분한다. 정확한 품목별 정산은
    // 채널이 주지 않으므로 근사치다.
    row.netSettlement += settlementByOrder.get(item.order_id) ?? 0
    productRows.set(key, row)
  }

  for (const e of expenses) {
    if (!e.productId) continue
    const row = productRows.get(e.productId)
    if (row) row.expense += e.amount
  }

  const contribution = rankContribution(
    Array.from(productRows.values()).map((r) => ({
      ...r,
      netProfit: r.netSettlement - r.expense,
      marginPct: r.netSettlement > 0 ? ((r.netSettlement - r.expense) / r.netSettlement) * 100 : 0,
    }))
  )

  // ── 파이프라인 전환율 ───────────────────────────────────────
  const [candidateCount, decisionCount, recommendCount, approvedCount, contentCount, publishedCount] =
    await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso),
      supabase.from('bucky_decisions').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso),
      supabase.from('bucky_decisions').select('id', { count: 'exact', head: true }).eq('verdict', 'recommend').gte('created_at', sinceIso),
      supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', sinceIso),
      supabase.from('content_assets').select('id', { count: 'exact', head: true }).eq('reviewed', true).gte('created_at', sinceIso),
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('created_at', sinceIso),
    ])

  const funnel = conversionFunnel({
    candidates: candidateCount.count ?? 0,
    analyzed: decisionCount.count ?? 0,
    recommended: recommendCount.count ?? 0,
    approved: approvedCount.count ?? 0,
    contentReady: contentCount.count ?? 0,
    published: publishedCount.count ?? 0,
    sold: summary.orderCount,
  })

  return NextResponse.json({
    period: { days, since: sinceIso },
    summary,
    variance: explainVariance(summary, expenses),
    waterfall: costWaterfall(summary, expenses),
    funnel,
    contribution: contribution.slice(0, 20),
    // 지시서 §6: 모든 수치에 출처와 기준시각을 붙인다.
    dataQuality: summary.fullySettled ? 'REAL' : 'ESTIMATE',
    dataQualityNote: summary.fullySettled
      ? '정산이 확정된 데이터입니다.'
      : '정산 미확정 항목이 있어 수치가 바뀔 수 있습니다.',
    capturedAt: new Date().toISOString(),
  })
}
