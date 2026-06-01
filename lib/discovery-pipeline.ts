import { scrapeUrl } from './firecrawl'
import { extractProductData } from './product-extractor'
import { calculateMargin, calculateSniperScore, getRiskLevel } from './calculator'
import { createServiceClient } from './supabase/server'

const CONFIDENCE_THRESHOLD = 0.7

export type DiscoverySite = 'iherb' | 'amazon' | 'vitacost' | 'costco' | 'other'

export interface DiscoverySuccess {
  status: 'created' | 'duplicate'
  productId?: string
  rawCandidateId?: string
  sniperScore?: number
  marginRate?: number
}

export interface DiscoveryFailure {
  status: 'failed'
  reason: string
  rawCandidateId?: string
}

export type DiscoveryResult = DiscoverySuccess | DiscoveryFailure

export async function discoverUrl(
  url: string,
  site: DiscoverySite
): Promise<DiscoveryResult> {
  const supabase = createServiceClient()
  if (!supabase) {
    return { status: 'failed', reason: 'Supabase service role not configured' }
  }

  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('source_url', url)
    .maybeSingle()

  if (existing) {
    return { status: 'duplicate', productId: existing.id }
  }

  const scrapeResult = await scrapeUrl(url)
  if (!scrapeResult.success) {
    return { status: 'failed', reason: `Scrape failed: ${scrapeResult.error}` }
  }

  const extractResult = await extractProductData(scrapeResult.data.markdown, url)

  const { data: rawRow } = await supabase
    .from('raw_candidates')
    .insert({
      source_url: url,
      source_site: site,
      raw_markdown: scrapeResult.data.markdown.slice(0, 10000),
      extracted_data: extractResult.success ? extractResult.product : null,
      confidence: extractResult.success ? extractResult.product.confidence : 0,
      validation_status: extractResult.success ? 'pending' : 'failed',
      validation_errors: extractResult.success
        ? null
        : [{ error: extractResult.error }],
    })
    .select('id')
    .single()

  const rawCandidateId: string | undefined = rawRow?.id

  if (!extractResult.success) {
    return {
      status: 'failed',
      reason: `Extraction failed: ${extractResult.error}`,
      rawCandidateId,
    }
  }

  const p = extractResult.product

  if (p.confidence < CONFIDENCE_THRESHOLD) {
    await supabase
      .from('raw_candidates')
      .update({
        validation_status: 'failed',
        validation_errors: [
          {
            error: `confidence ${p.confidence} < threshold ${CONFIDENCE_THRESHOLD}`,
            reasons: p.confidenceReasons,
          },
        ],
      })
      .eq('id', rawCandidateId)

    return {
      status: 'failed',
      reason: `Confidence too low: ${p.confidence} (reasons: ${p.confidenceReasons.join(', ')})`,
      rawCandidateId,
    }
  }

  let exchangeRate = 1350
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const rateRes = await fetch(`${siteUrl}/api/exchange-rate`)
    if (rateRes.ok) {
      const rateJson = await rateRes.json()
      if (rateJson.rate) exchangeRate = rateJson.rate
    }
  } catch {
    // fallback
  }

  const localShippingCost = 3.0
  const internationalShippingCost = 5000
  const domesticShippingCost = 3000
  const paymentFee = Math.round(p.overseasPrice * exchangeRate * 0.025)
  const domesticExpectedPrice = Math.round(p.overseasPrice * exchangeRate * 1.8)

  const riskLevel = getRiskLevel(0, p.category === 'other' ? 'health' : p.category)

  const marginResult = calculateMargin({
    overseasPrice: p.overseasPrice,
    exchangeRate,
    localShippingCost,
    internationalShippingCost,
    customsDuty: 0,
    vat: 0,
    domesticShippingCost,
    paymentFee,
    otherCosts: 500,
    domesticExpectedPrice,
  })

  const sniperResult = calculateSniperScore({
    demandScore: p.demandScore,
    priceCompetitivenessScore: p.priceCompetitivenessScore,
    marginRate: marginResult.marginRate,
    shippingStabilityScore: p.shippingStabilityScore,
    riskLevel,
    competitionLevel: p.competitionLevel,
    pageConvincingScore: p.pageConvincingScore,
    automationScore: p.automationScore,
  })

  const productId = crypto.randomUUID()

  const { error: insertError } = await supabase.from('products').insert({
    id: productId,
    name: p.name,
    category: p.category === 'other' ? 'health' : p.category,
    description: p.description,
    overseas_price: p.overseasPrice,
    local_shipping_cost: localShippingCost,
    international_shipping_cost: internationalShippingCost,
    domestic_expected_price: domesticExpectedPrice,
    tax_estimate: 0,
    payment_fee: paymentFee,
    domestic_shipping_cost: domesticShippingCost,
    other_costs: 500,
    total_cost: marginResult.totalCost,
    expected_margin: marginResult.expectedMargin,
    margin_rate: marginResult.marginRate,
    sniper_score: sniperResult.total,
    risk_level: riskLevel,
    source_url: url,
    competitor_url: '',
    status: 'candidate',
    demand_score: p.demandScore,
    price_competitiveness_score: p.priceCompetitivenessScore,
    shipping_stability_score: p.shippingStabilityScore,
    competition_level: p.competitionLevel,
    page_convincing_score: p.pageConvincingScore,
    automation_score: p.automationScore,
    image_url: p.imageUrl || null,
    exchange_rate_snapshot: exchangeRate,
    ai_confidence: p.confidence,
    raw_candidate_id: rawCandidateId,
    source_site: site,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return { status: 'duplicate' }
    }
    return { status: 'failed', reason: `DB insert failed: ${insertError.message}`, rawCandidateId }
  }

  await supabase
    .from('raw_candidates')
    .update({ validation_status: 'passed' })
    .eq('id', rawCandidateId)

  await supabase.from('price_snapshots').insert({
    product_id: productId,
    exchange_rate: exchangeRate,
    overseas_price: p.overseasPrice,
    total_cost: marginResult.totalCost,
    margin_rate: marginResult.marginRate,
    sniper_score: sniperResult.total,
    trigger: 'discovery',
  })

  return {
    status: 'created',
    productId,
    rawCandidateId,
    sniperScore: sniperResult.total,
    marginRate: marginResult.marginRate,
  }
}
