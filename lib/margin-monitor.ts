import { calculateMargin, calculateSniperScore } from './calculator'
import { createServiceClient } from './supabase/server'
import { notifyAdmin } from './notify'

const RATE_CHANGE_THRESHOLD = 0.03
const MARGIN_ALERT_THRESHOLD = 15

export interface MonitorResult {
  checkedProducts: number
  recalculated: number
  alerts: number
  currentRate: number
  previousRate: number | null
  rateChangePercent: number
}

export async function runMarginMonitor(currentRate: number): Promise<MonitorResult> {
  const supabase = createServiceClient()
  if (!supabase) throw new Error('Supabase not configured')

  const { data: lastSnapshot } = await supabase
    .from('price_snapshots')
    .select('exchange_rate, recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single()

  const previousRate = lastSnapshot?.exchange_rate ?? null
  const rateChangePercent = previousRate
    ? Math.abs((currentRate - previousRate) / previousRate)
    : 0

  if (previousRate && rateChangePercent < RATE_CHANGE_THRESHOLD) {
    return {
      checkedProducts: 0,
      recalculated: 0,
      alerts: 0,
      currentRate,
      previousRate,
      rateChangePercent,
    }
  }

  const { data: products, error } = await supabase
    .from('products')
    .select(
      'id, name, category, overseas_price, local_shipping_cost, international_shipping_cost, ' +
      'domestic_expected_price, tax_estimate, payment_fee, domestic_shipping_cost, other_costs, ' +
      'demand_score, price_competitiveness_score, shipping_stability_score, ' +
      'competition_level, page_convincing_score, automation_score, risk_level, margin_rate'
    )
    .in('status', ['active', 'candidate'])

  if (error || !products) throw error ?? new Error('No products')

  let recalculated = 0
  let alerts = 0
  const alertMessages: string[] = []

  for (const p of products) {
    const paymentFee = Math.round(p.overseas_price * currentRate * 0.025)

    const margin = calculateMargin({
      overseasPrice: p.overseas_price,
      exchangeRate: currentRate,
      localShippingCost: p.local_shipping_cost,
      internationalShippingCost: p.international_shipping_cost,
      customsDuty: 0,
      vat: 0,
      domesticShippingCost: p.domestic_shipping_cost,
      paymentFee,
      otherCosts: p.other_costs,
      domesticExpectedPrice: p.domestic_expected_price,
    })

    const sniper = calculateSniperScore({
      demandScore: p.demand_score,
      priceCompetitivenessScore: p.price_competitiveness_score,
      marginRate: margin.marginRate,
      shippingStabilityScore: p.shipping_stability_score,
      riskLevel: p.risk_level,
      competitionLevel: p.competition_level,
      pageConvincingScore: p.page_convincing_score,
      automationScore: p.automation_score,
    })

    await supabase.from('products').update({
      total_cost: margin.totalCost,
      expected_margin: margin.expectedMargin,
      margin_rate: margin.marginRate,
      sniper_score: sniper.total,
      exchange_rate_snapshot: currentRate,
      payment_fee: paymentFee,
    }).eq('id', p.id)

    await supabase.from('price_snapshots').insert({
      product_id: p.id,
      exchange_rate: currentRate,
      overseas_price: p.overseas_price,
      total_cost: margin.totalCost,
      margin_rate: margin.marginRate,
      sniper_score: sniper.total,
      trigger: 'rate_change',
    })

    recalculated++

    if (margin.marginRate < MARGIN_ALERT_THRESHOLD) {
      alerts++
      alertMessages.push(`${p.name}: 마진 ${margin.marginRate.toFixed(1)}%`)

      await supabase.from('agent_findings').insert({
        agent_type: 'margin_pricing',
        severity: 'critical',
        title: `마진 위험: ${p.name}`,
        summary: `환율 변동(${previousRate?.toFixed(0)} → ${currentRate})으로 마진율이 ${margin.marginRate.toFixed(1)}%로 하락. 즉시 가격 검토 필요.`,
        target_type: 'product',
        target_id: p.id,
        confidence: 0.95,
        payload: {
          previousMarginRate: p.margin_rate,
          newMarginRate: margin.marginRate,
          exchangeRate: currentRate,
        },
      })
    }
  }

  if (alerts > 0) {
    await notifyAdmin(
      `환율 변동 마진 경보\n환율: ${previousRate?.toFixed(0)} → ${currentRate} (+${(rateChangePercent * 100).toFixed(1)}%)\n\n위험 상품 ${alerts}개:\n${alertMessages.join('\n')}`,
      'critical',
      { rateChange: `${(rateChangePercent * 100).toFixed(1)}%`, alertCount: alerts }
    )
  } else if (recalculated > 0) {
    await notifyAdmin(
      `환율 변동 마진 재계산 완료 (${recalculated}개 상품). 위험 상품 없음.`,
      'warning',
      { currentRate, previousRate, recalculated }
    )
  }

  return {
    checkedProducts: products.length,
    recalculated,
    alerts,
    currentRate,
    previousRate,
    rateChangePercent,
  }
}
