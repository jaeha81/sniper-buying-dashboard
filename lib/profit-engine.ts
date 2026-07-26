// 수익 엔진 — 지시서 §15·§18.
//
// "수익은 주문·정산·비용에서 계산한다."
//
// 핵심 구분:
//   매출(gross sales)     = 주문 금액 합계. '팔린 값'.
//   정산액(net settlement) = 채널이 실제로 입금한 값. '들어온 값'.
//   실현 순이익            = 정산액 - 실제 발생 비용.
//
// 주문 금액을 매출로 잡고 끝내면 채널 수수료·프로모션 분담·환불이
// 빠져 실제보다 부풀려진다. 그래서 실현 매출은 정산액만 인정한다.
//
// 순수 함수다. DB 접근은 호출부가 한다.

// ─── 입력 ─────────────────────────────────────────────────────

export interface SettlementRecord {
  orderId: string | null
  grossAmount: number
  channelFee: number
  paymentFee: number
  promotionShare: number
  adjustment: number
  netAmount: number
  status: 'expected' | 'confirmed' | 'paid' | 'disputed' | 'cancelled'
}

export type ExpenseCategory =
  | 'sourcing'
  | 'local_shipping'
  | 'international_shipping'
  | 'customs'
  | 'vat'
  | 'domestic_shipping'
  | 'packaging'
  | 'advertising'
  | 'cs'
  | 'return_shipping'
  | 'platform_fee'
  | 'payment_fee'
  | 'fx_loss'
  | 'tool_subscription'
  | 'other'

export interface ExpenseRecord {
  orderId: string | null
  productId: string | null
  category: ExpenseCategory
  amount: number
  verified: boolean
}

export interface OrderRecord {
  id: string
  totalPrice: number
  status: 'pending' | 'ordered' | 'shipping' | 'delivered' | 'cancelled'
  paymentStatus: 'unconfirmed' | 'confirmed' | 'failed' | 'refunded'
  /** 이 주문의 예상 순이익 합계 (order_items 기준) */
  expectedNetProfit: number
}

export interface RefundRecord {
  orderId: string
  amount: number
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'failed' | 'cancelled'
}

// ─── 결과 ─────────────────────────────────────────────────────

export interface ProfitSummary {
  orderCount: number
  /** 주문 금액 합계 */
  grossSales: number
  /** 정산 실입금 합계 */
  netSettlement: number
  /** 채널·결제 수수료 합계 */
  totalFees: number
  totalExpense: number
  /** 증빙 없는(추정) 비용 합계. 이 값이 크면 실현 손익의 신뢰도가 낮다. */
  unverifiedExpense: number
  realizedNetProfit: number
  /** 실현 순마진율 (%) — 정산액 대비 */
  realizedMarginPct: number
  /** 예상 순이익 합계 */
  expectedNetProfit: number
  /** 예상 대비 오차 (실현 - 예상). 음수면 예상보다 못 벌었다. */
  varianceAmount: number
  variancePct: number
  refundCount: number
  refundAmount: number
  /** 평균 주문금액 */
  averageOrderValue: number
  /** 환불·취소율 (%) */
  refundRatePct: number
  /** 정산이 전부 확정됐는지. 미확정이면 수치가 바뀔 수 있다. */
  fullySettled: boolean
}

/**
 * 실현 매출로 인정하는 정산 상태.
 *
 * expected는 제외한다 — 채널이 "이만큼 줄 예정"이라고 한 값이지 들어온
 * 돈이 아니다. disputed도 제외한다: 분쟁 중인 금액을 수익으로 잡으면
 * 나중에 뒤집힌다.
 */
const REALIZED_SETTLEMENT_STATUSES: readonly SettlementRecord['status'][] = ['confirmed', 'paid']

/** 실제로 나간 환불만 센다. */
const REALIZED_REFUND_STATUSES: readonly RefundRecord['status'][] = ['completed']

/** 매출로 인정하는 주문. 결제 미승인·취소는 제외한다. */
export function isRevenueBearingOrder(order: OrderRecord): boolean {
  if (order.status === 'cancelled') return false
  // Toss 서버 승인이 없어 payment_status가 unconfirmed인 주문은
  // 돈이 들어오지 않았다. 매출로 잡으면 가짜 수익이 된다.
  if (order.paymentStatus !== 'confirmed') return false
  return true
}

export interface ProfitInput {
  orders: OrderRecord[]
  settlements: SettlementRecord[]
  expenses: ExpenseRecord[]
  refunds: RefundRecord[]
}

export function summarizeProfit(input: ProfitInput): ProfitSummary {
  const countedOrders = input.orders.filter(isRevenueBearingOrder)

  const grossSales = countedOrders.reduce((s, o) => s + o.totalPrice, 0)
  const expectedNetProfit = countedOrders.reduce((s, o) => s + o.expectedNetProfit, 0)

  const realizedSettlements = input.settlements.filter((s) =>
    REALIZED_SETTLEMENT_STATUSES.includes(s.status)
  )

  const netSettlement = realizedSettlements.reduce((s, r) => s + r.netAmount, 0)
  const totalFees = realizedSettlements.reduce(
    (s, r) => s + r.channelFee + r.paymentFee + r.promotionShare,
    0
  )

  const totalExpense = input.expenses.reduce((s, e) => s + e.amount, 0)
  const unverifiedExpense = input.expenses
    .filter((e) => !e.verified)
    .reduce((s, e) => s + e.amount, 0)

  const realizedRefunds = input.refunds.filter((r) => REALIZED_REFUND_STATUSES.includes(r.status))
  const refundAmount = realizedRefunds.reduce((s, r) => s + r.amount, 0)

  // 환불은 정산액에서 빼고 비용에도 안 넣는다 — 이중 차감이 된다.
  const realizedNetProfit = netSettlement - totalExpense - refundAmount

  const realizedMarginPct = netSettlement > 0 ? (realizedNetProfit / netSettlement) * 100 : 0

  const varianceAmount = realizedNetProfit - expectedNetProfit
  const variancePct =
    expectedNetProfit !== 0 ? (varianceAmount / Math.abs(expectedNetProfit)) * 100 : 0

  const averageOrderValue =
    countedOrders.length > 0 ? Math.round(grossSales / countedOrders.length) : 0

  const refundRatePct =
    countedOrders.length > 0 ? (realizedRefunds.length / countedOrders.length) * 100 : 0

  // 정산이 하나도 없으면 '확정됨'이라고 말할 수 없다.
  const fullySettled =
    input.settlements.length > 0 &&
    input.settlements.every((s) => s.status === 'paid' || s.status === 'cancelled')

  return {
    orderCount: countedOrders.length,
    grossSales,
    netSettlement,
    totalFees,
    totalExpense,
    unverifiedExpense,
    realizedNetProfit,
    realizedMarginPct,
    expectedNetProfit,
    varianceAmount,
    variancePct,
    refundCount: realizedRefunds.length,
    refundAmount,
    averageOrderValue,
    refundRatePct,
    fullySettled,
  }
}

// ─── 오차 원인 분석 (지시서 §15) ──────────────────────────────

export type VarianceCause =
  | 'channel_fee_higher'
  | 'expense_overrun'
  | 'refund_loss'
  | 'fx_loss'
  | 'advertising_overrun'
  | 'unverified_expense'
  | 'settlement_pending'

export interface VarianceFactor {
  cause: VarianceCause
  amount: number
  message: string
}

/**
 * 예상과 실현이 왜 벌어졌는지 큰 항목부터 짚는다.
 *
 * "마진이 예상보다 낮다"만 알려주면 조치를 못 한다. 광고비 초과인지
 * 환불 손실인지 환차손인지가 나와야 다음 판단이 된다.
 */
export function explainVariance(
  summary: ProfitSummary,
  expenses: ExpenseRecord[]
): VarianceFactor[] {
  const factors: VarianceFactor[] = []

  if (summary.varianceAmount >= 0) return factors

  const byCategory = new Map<ExpenseCategory, number>()
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount)
  }

  const advertising = byCategory.get('advertising') ?? 0
  const fxLoss = byCategory.get('fx_loss') ?? 0
  const platformFee = (byCategory.get('platform_fee') ?? 0) + (byCategory.get('payment_fee') ?? 0)

  if (summary.refundAmount > 0) {
    factors.push({
      cause: 'refund_loss',
      amount: summary.refundAmount,
      message: `환불 ${summary.refundCount}건으로 ${summary.refundAmount.toLocaleString()}원이 빠졌습니다.`,
    })
  }

  if (fxLoss > 0) {
    factors.push({
      cause: 'fx_loss',
      amount: fxLoss,
      message: `환차손 ${fxLoss.toLocaleString()}원. 예상 환율보다 불리하게 환전되었습니다.`,
    })
  }

  if (advertising > 0) {
    factors.push({
      cause: 'advertising_overrun',
      amount: advertising,
      message: `광고비 ${advertising.toLocaleString()}원 집행.`,
    })
  }

  if (summary.totalFees > platformFee && summary.totalFees > 0) {
    factors.push({
      cause: 'channel_fee_higher',
      amount: summary.totalFees,
      message: `채널·결제 수수료 ${summary.totalFees.toLocaleString()}원이 정산에서 차감되었습니다.`,
    })
  }

  if (summary.unverifiedExpense > 0) {
    factors.push({
      cause: 'unverified_expense',
      amount: summary.unverifiedExpense,
      message: `증빙 없는 비용 ${summary.unverifiedExpense.toLocaleString()}원이 포함되어 실현 손익의 정확도가 낮습니다.`,
    })
  }

  if (!summary.fullySettled) {
    factors.push({
      cause: 'settlement_pending',
      amount: 0,
      message: '정산이 확정되지 않아 수치가 바뀔 수 있습니다.',
    })
  }

  return factors.sort((a, b) => b.amount - a.amount)
}

// ─── 비용 워터폴 (지시서 §15) ─────────────────────────────────

export interface WaterfallStep {
  label: string
  /** 이 단계에서 빠지는 금액 (양수) */
  amount: number
  /** 차감 후 잔액 */
  remaining: number
}

/** 정산액에서 비용이 어떻게 빠져 순이익이 되는지 단계별로 보여준다. */
export function costWaterfall(summary: ProfitSummary, expenses: ExpenseRecord[]): WaterfallStep[] {
  const byCategory = new Map<ExpenseCategory, number>()
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount)
  }

  // 원가 성격이 큰 순서로 나열한다. 어디서 돈이 새는지 한눈에 보이게.
  const order: { label: string; categories: ExpenseCategory[] }[] = [
    { label: '소싱 원가', categories: ['sourcing', 'local_shipping'] },
    { label: '국제 물류·통관', categories: ['international_shipping', 'customs', 'vat'] },
    { label: '국내 물류·포장', categories: ['domestic_shipping', 'packaging'] },
    { label: '광고비', categories: ['advertising'] },
    { label: 'CS·반품', categories: ['cs', 'return_shipping'] },
    { label: '수수료', categories: ['platform_fee', 'payment_fee'] },
    { label: '환차손', categories: ['fx_loss'] },
    { label: '기타', categories: ['tool_subscription', 'other'] },
  ]

  const steps: WaterfallStep[] = []
  let remaining = summary.netSettlement

  for (const group of order) {
    const amount = group.categories.reduce((s, c) => s + (byCategory.get(c) ?? 0), 0)
    if (amount === 0) continue

    remaining -= amount
    steps.push({ label: group.label, amount, remaining })
  }

  if (summary.refundAmount > 0) {
    remaining -= summary.refundAmount
    steps.push({ label: '환불', amount: summary.refundAmount, remaining })
  }

  return steps
}

// ─── 파이프라인 전환율 (지시서 §15) ───────────────────────────

export interface FunnelCounts {
  candidates: number
  analyzed: number
  recommended: number
  approved: number
  contentReady: number
  published: number
  sold: number
}

export interface FunnelStage {
  from: string
  to: string
  fromCount: number
  toCount: number
  /** 전환율 (%). 이전 단계가 0이면 null — 0%로 표시하면 실패처럼 보인다. */
  conversionPct: number | null
}

export function conversionFunnel(counts: FunnelCounts): FunnelStage[] {
  const stages: { from: keyof FunnelCounts; to: keyof FunnelCounts; labels: [string, string] }[] = [
    { from: 'candidates', to: 'analyzed', labels: ['후보', '분석'] },
    { from: 'analyzed', to: 'recommended', labels: ['분석', '추천'] },
    { from: 'recommended', to: 'approved', labels: ['추천', '승인'] },
    { from: 'approved', to: 'contentReady', labels: ['승인', '콘텐츠'] },
    { from: 'contentReady', to: 'published', labels: ['콘텐츠', '등록'] },
    { from: 'published', to: 'sold', labels: ['등록', '판매'] },
  ]

  return stages.map((s) => {
    const fromCount = counts[s.from]
    const toCount = counts[s.to]

    return {
      from: s.labels[0],
      to: s.labels[1],
      fromCount,
      toCount,
      conversionPct: fromCount > 0 ? (toCount / fromCount) * 100 : null,
    }
  })
}

// ─── 상품·채널 기여도 ─────────────────────────────────────────

export interface ContributionRow {
  key: string
  label: string
  orderCount: number
  netSettlement: number
  expense: number
  netProfit: number
  marginPct: number
}

export function rankContribution(rows: ContributionRow[]): ContributionRow[] {
  // 순이익 내림차순. 적자 항목이 뒤에 모여 바로 눈에 띈다.
  return [...rows].sort((a, b) => b.netProfit - a.netProfit)
}
