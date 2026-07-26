import { describe, it, expect } from 'vitest'
import {
  summarizeProfit,
  explainVariance,
  costWaterfall,
  conversionFunnel,
  rankContribution,
  isRevenueBearingOrder,
  type OrderRecord,
  type SettlementRecord,
  type ExpenseRecord,
  type RefundRecord,
} from './profit-engine'

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'o1',
    totalPrice: 50000,
    status: 'delivered',
    paymentStatus: 'confirmed',
    expectedNetProfit: 12000,
    ...overrides,
  }
}

function settlement(overrides: Partial<SettlementRecord> = {}): SettlementRecord {
  return {
    orderId: 'o1',
    grossAmount: 50000,
    channelFee: 5000,
    paymentFee: 1500,
    promotionShare: 0,
    adjustment: 0,
    netAmount: 43500,
    status: 'paid',
    ...overrides,
  }
}

function expense(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return { orderId: 'o1', productId: 'p1', category: 'sourcing', amount: 20000, verified: true, ...overrides }
}

describe('매출 인정 기준', () => {
  it('결제 승인된 주문만 매출로 잡는다', () => {
    // Toss 서버 승인이 없어 unconfirmed인 주문은 돈이 들어오지 않았다.
    // 매출로 잡으면 가짜 수익이 된다.
    expect(isRevenueBearingOrder(order({ paymentStatus: 'confirmed' }))).toBe(true)
    expect(isRevenueBearingOrder(order({ paymentStatus: 'unconfirmed' }))).toBe(false)
    expect(isRevenueBearingOrder(order({ paymentStatus: 'failed' }))).toBe(false)
    expect(isRevenueBearingOrder(order({ paymentStatus: 'refunded' }))).toBe(false)
  })

  it('취소된 주문은 제외한다', () => {
    expect(isRevenueBearingOrder(order({ status: 'cancelled' }))).toBe(false)
  })

  it('미승인 주문만 있으면 매출이 0이다', () => {
    const s = summarizeProfit({
      orders: [order({ paymentStatus: 'unconfirmed' }), order({ id: 'o2', paymentStatus: 'unconfirmed' })],
      settlements: [],
      expenses: [],
      refunds: [],
    })

    expect(s.orderCount).toBe(0)
    expect(s.grossSales).toBe(0)
  })
})

describe('실현 손익 — 지시서 §18', () => {
  it('실현 매출은 정산 실입금액만 인정한다', () => {
    // 주문 금액 50000이지만 수수료 차감 후 실입금은 43500이다.
    const s = summarizeProfit({
      orders: [order()],
      settlements: [settlement()],
      expenses: [],
      refunds: [],
    })

    expect(s.grossSales).toBe(50000)
    expect(s.netSettlement).toBe(43500)
    expect(s.totalFees).toBe(6500)
  })

  it('예정(expected) 정산은 실현으로 잡지 않는다', () => {
    // "이만큼 줄 예정"은 들어온 돈이 아니다.
    const s = summarizeProfit({
      orders: [order()],
      settlements: [settlement({ status: 'expected' })],
      expenses: [],
      refunds: [],
    })

    expect(s.netSettlement).toBe(0)
  })

  it('분쟁 중인 정산도 제외한다', () => {
    const s = summarizeProfit({
      orders: [order()],
      settlements: [settlement({ status: 'disputed' })],
      expenses: [],
      refunds: [],
    })

    expect(s.netSettlement).toBe(0)
  })

  it('실현 순이익 = 정산액 - 비용 - 환불이다', () => {
    const s = summarizeProfit({
      orders: [order()],
      settlements: [settlement()],
      expenses: [expense({ amount: 20000 }), expense({ category: 'advertising', amount: 3000 })],
      refunds: [{ orderId: 'o1', amount: 5000, status: 'completed' }],
    })

    expect(s.realizedNetProfit).toBe(43500 - 23000 - 5000)
  })

  it('완료되지 않은 환불은 차감하지 않는다', () => {
    const pending: RefundRecord[] = [{ orderId: 'o1', amount: 5000, status: 'pending' }]
    const s = summarizeProfit({
      orders: [order()],
      settlements: [settlement()],
      expenses: [],
      refunds: pending,
    })

    expect(s.refundAmount).toBe(0)
    expect(s.realizedNetProfit).toBe(43500)
  })

  it('예상 대비 오차를 계산한다', () => {
    const s = summarizeProfit({
      orders: [order({ expectedNetProfit: 20000 })],
      settlements: [settlement()],
      expenses: [expense({ amount: 30000 })],
      refunds: [],
    })

    // 실현 13500 vs 예상 20000
    expect(s.realizedNetProfit).toBe(13500)
    expect(s.expectedNetProfit).toBe(20000)
    expect(s.varianceAmount).toBe(-6500)
    expect(s.variancePct).toBeCloseTo(-32.5, 5)
  })

  it('적자를 0으로 뭉개지 않는다', () => {
    const s = summarizeProfit({
      orders: [order()],
      settlements: [settlement()],
      expenses: [expense({ amount: 90000 })],
      refunds: [],
    })

    expect(s.realizedNetProfit).toBeLessThan(0)
    expect(s.realizedMarginPct).toBeLessThan(0)
  })

  it('정산이 0일 때 0으로 나누지 않는다', () => {
    const s = summarizeProfit({ orders: [], settlements: [], expenses: [], refunds: [] })

    expect(Number.isFinite(s.realizedMarginPct)).toBe(true)
    expect(s.realizedMarginPct).toBe(0)
    expect(s.averageOrderValue).toBe(0)
    expect(s.refundRatePct).toBe(0)
  })

  it('증빙 없는 비용을 따로 집계한다', () => {
    const s = summarizeProfit({
      orders: [order()],
      settlements: [settlement()],
      expenses: [expense({ amount: 10000, verified: true }), expense({ amount: 4000, verified: false })],
      refunds: [],
    })

    expect(s.totalExpense).toBe(14000)
    expect(s.unverifiedExpense).toBe(4000)
  })

  it('정산이 없으면 확정됐다고 말하지 않는다', () => {
    const s = summarizeProfit({ orders: [order()], settlements: [], expenses: [], refunds: [] })
    expect(s.fullySettled).toBe(false)
  })

  it('전 정산이 paid면 확정으로 본다', () => {
    const s = summarizeProfit({
      orders: [order()],
      settlements: [settlement({ status: 'paid' })],
      expenses: [],
      refunds: [],
    })
    expect(s.fullySettled).toBe(true)
  })
})

describe('오차 원인 분석 — 지시서 §15', () => {
  it('예상보다 잘 벌었으면 원인을 나열하지 않는다', () => {
    const s = summarizeProfit({
      orders: [order({ expectedNetProfit: 1000 })],
      settlements: [settlement()],
      expenses: [],
      refunds: [],
    })

    expect(explainVariance(s, [])).toEqual([])
  })

  it('환불·환차손·광고비를 원인으로 짚는다', () => {
    const expenses = [
      expense({ category: 'fx_loss', amount: 3000 }),
      expense({ category: 'advertising', amount: 8000 }),
    ]

    const s = summarizeProfit({
      orders: [order({ expectedNetProfit: 30000 })],
      settlements: [settlement()],
      expenses,
      refunds: [{ orderId: 'o1', amount: 6000, status: 'completed' }],
    })

    const causes = explainVariance(s, expenses).map((f) => f.cause)
    expect(causes).toContain('refund_loss')
    expect(causes).toContain('fx_loss')
    expect(causes).toContain('advertising_overrun')
  })

  it('금액이 큰 원인을 앞에 둔다', () => {
    const expenses = [
      expense({ category: 'fx_loss', amount: 1000 }),
      expense({ category: 'advertising', amount: 50000 }),
    ]

    const s = summarizeProfit({
      orders: [order({ expectedNetProfit: 30000 })],
      settlements: [settlement()],
      expenses,
      refunds: [],
    })

    const factors = explainVariance(s, expenses)
    expect(factors[0].amount).toBeGreaterThanOrEqual(factors[factors.length - 1].amount)
  })

  it('증빙 없는 비용을 신뢰도 문제로 알린다', () => {
    const expenses = [expense({ amount: 40000, verified: false })]
    const s = summarizeProfit({
      orders: [order({ expectedNetProfit: 30000 })],
      settlements: [settlement()],
      expenses,
      refunds: [],
    })

    expect(explainVariance(s, expenses).map((f) => f.cause)).toContain('unverified_expense')
  })
})

describe('비용 워터폴', () => {
  it('정산액에서 단계별로 차감해 잔액을 보여준다', () => {
    const expenses = [
      expense({ category: 'sourcing', amount: 20000 }),
      expense({ category: 'international_shipping', amount: 5000 }),
      expense({ category: 'advertising', amount: 2000 }),
    ]

    const s = summarizeProfit({
      orders: [order()],
      settlements: [settlement()],
      expenses,
      refunds: [],
    })

    const steps = costWaterfall(s, expenses)

    expect(steps[0].label).toBe('소싱 원가')
    expect(steps[0].remaining).toBe(43500 - 20000)
    // 마지막 잔액이 실현 순이익과 같아야 한다.
    expect(steps[steps.length - 1].remaining).toBe(s.realizedNetProfit)
  })

  it('금액이 0인 항목은 건너뛴다', () => {
    const expenses = [expense({ category: 'sourcing', amount: 10000 })]
    const s = summarizeProfit({
      orders: [order()],
      settlements: [settlement()],
      expenses,
      refunds: [],
    })

    expect(costWaterfall(s, expenses)).toHaveLength(1)
  })
})

describe('파이프라인 전환율', () => {
  it('단계별 전환율을 계산한다', () => {
    const funnel = conversionFunnel({
      candidates: 100,
      analyzed: 80,
      recommended: 20,
      approved: 10,
      contentReady: 8,
      published: 6,
      sold: 3,
    })

    expect(funnel[0].conversionPct).toBe(80)
    expect(funnel[funnel.length - 1].conversionPct).toBe(50)
  })

  it('이전 단계가 0이면 null이다 — 0%는 실패처럼 보인다', () => {
    const funnel = conversionFunnel({
      candidates: 0, analyzed: 0, recommended: 0,
      approved: 0, contentReady: 0, published: 0, sold: 0,
    })

    for (const stage of funnel) {
      expect(stage.conversionPct).toBeNull()
    }
  })
})

describe('기여도 정렬', () => {
  it('순이익 내림차순으로 정렬해 적자를 뒤로 모은다', () => {
    const rows = [
      { key: 'a', label: 'A', orderCount: 1, netSettlement: 100, expense: 200, netProfit: -100, marginPct: -100 },
      { key: 'b', label: 'B', orderCount: 5, netSettlement: 500, expense: 200, netProfit: 300, marginPct: 60 },
      { key: 'c', label: 'C', orderCount: 2, netSettlement: 200, expense: 150, netProfit: 50, marginPct: 25 },
    ]

    expect(rankContribution(rows).map((r) => r.key)).toEqual(['b', 'c', 'a'])
  })
})
