// E2E 오케스트레이터 — 지시서 §18 완료 기준:
// "URL 하나로 후보 → Bucky 판정 → 승인 대기까지 실행·기록된다."
//
// 흐름:
//   URL → 안전게이트 → 스크랩 → LLM 추출 → 마진 v2 → Score 2.0
//       → 직원 산출물 수집 → Bucky 판정 → 저장 → 승인 요청 생성
//
// 각 단계는 Task/Run으로 기록되고, 판정은 bucky_decisions에 남는다.
// 승인 없이 외부 등록이 일어나지 않는다 — 이 함수는 승인 요청까지만 만든다.

import { createServiceClient } from './supabase/server'
import { scrapeUrl } from './firecrawl'
import { extractProductData, type ExtractedProduct } from './product-extractor'
import { getRiskLevel } from './calculator'
import {
  calculateMarginV2,
  simulateMargin,
  type MarginInputV2,
  type MarginResultV2,
} from './margin-engine'
import {
  calculateSniperScoreV2,
  DEFAULT_THRESHOLDS,
  type ScoreEvidence,
  type ScoreResultV2,
} from './score-engine'
import { decide, type BuckyDecision, type EmployeeReport } from './bucky'
import { checkGate, type SafetyPolicy } from './safety-gate'
import { createApproval, createTask } from './task-store'
import { recordAudit } from './audit'
import { notifyAdmin } from './notify'

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>

/** 파이프라인 단계. 어디서 멈췄는지 알려주기 위해 이름을 붙인다. */
export type PipelineStage =
  | 'gate'
  | 'duplicate_check'
  | 'scrape'
  | 'extract'
  | 'margin'
  | 'score'
  | 'bucky'
  | 'persist'
  | 'approval'

export interface PipelineSuccess {
  ok: true
  productId: string
  decision: BuckyDecision
  scoreId: string | null
  marginCalculationId: string | null
  decisionId: string | null
  approvalId: string | null
  taskIds: string[]
}

export interface PipelineFailure {
  ok: false
  stage: PipelineStage
  reason: string
}

export type PipelineResult = PipelineSuccess | PipelineFailure

// ─── 기본 비용 가정 ───────────────────────────────────────────
//
// 실제 운영값은 설정에서 읽어야 하지만, 아직 설정 UI가 없다.
// 여기 값은 '가정'이고 evidence의 source를 manual로 표시해 신뢰도에
// 반영된다 — 즉 근거 없는 값이 recommend로 통과하지 못한다.

export interface CostAssumptions {
  internationalShipping: number
  volumetricSurcharge: number
  insurance: number
  customsFee: number
  marketplaceFeePct: number
  paymentFeePct: number
  adCost: number
  domesticShipping: number
  packaging: number
  csCost: number
  returnReservePct: number
  fxSpreadPct: number
  taxReservePct: number
  otherCosts: number
  /** 판매가 산정 배수 (소싱 원가 대비) */
  targetMarkup: number
}

export const DEFAULT_COST_ASSUMPTIONS: CostAssumptions = {
  internationalShipping: 5000,
  volumetricSurcharge: 1000,
  insurance: 500,
  customsFee: 800,
  marketplaceFeePct: 10,
  paymentFeePct: 3,
  adCost: 2000,
  domesticShipping: 3000,
  packaging: 500,
  csCost: 300,
  returnReservePct: 2,
  fxSpreadPct: 1.5,
  taxReservePct: 20,
  otherCosts: 300,
  targetMarkup: 2.2,
}

export interface RunPipelineOptions {
  url: string
  sourceSite: string
  exchangeRate: number
  /** 환율 출처. ESTIMATE면 신뢰도가 떨어진다. */
  exchangeRateQuality: 'REAL' | 'ESTIMATE' | 'MANUAL'
  fxSnapshotId?: string | null
  assumptions?: CostAssumptions
  policy?: SafetyPolicy
  actorId?: string | null
}

function buildMarginInput(
  product: ExtractedProduct,
  exchangeRate: number,
  a: CostAssumptions
): MarginInputV2 {
  // 판매가는 소싱 원가에 목표 배수를 적용해 잡는다. 시장 조사 데이터가
  // 붙으면 시장분석 담당이 이 값을 대체한다.
  const sourcingKrw = product.overseasPrice * exchangeRate
  const sellingPrice = Math.round((sourcingKrw * a.targetMarkup) / 100) * 100

  return {
    sellingPrice,
    sourcing: {
      productPrice: product.overseasPrice,
      optionCost: 0,
      localTax: 0,
      localShipping: 0,
      paymentFee: 0,
    },
    international: {
      shipping: a.internationalShipping,
      volumetricSurcharge: a.volumetricSurcharge,
      insurance: a.insurance,
      // 관세·부가세는 규제 담당이 카테고리별로 산출한다. 여기서는
      // 통관 기준액 기반 근사치를 쓰고 evidence를 inferred로 표시한다.
      customsDuty: Math.round(sourcingKrw * 0.08),
      importVat: Math.round(sourcingKrw * 0.1),
      customsFee: a.customsFee,
    },
    selling: {
      marketplaceFeePct: a.marketplaceFeePct,
      paymentFeePct: a.paymentFeePct,
      adCost: a.adCost,
      couponDiscount: 0,
      pointsCost: 0,
    },
    domesticOps: {
      shipping: a.domesticShipping,
      packaging: a.packaging,
      csCost: a.csCost,
      returnReservePct: a.returnReservePct,
    },
    financial: {
      exchangeRate,
      fxSpreadPct: a.fxSpreadPct,
      taxReservePct: a.taxReservePct,
      otherCosts: a.otherCosts,
    },
  }
}

/**
 * 지표별 근거를 만든다.
 *
 * 여기가 정직성의 핵심이다. LLM이 추정한 값은 inferred, 우리가 가정한
 * 값은 manual로 표시한다. 전부 measured라고 적으면 신뢰도가 1이 되어
 * 하드블록을 우회하게 된다.
 */
function buildEvidence(
  url: string,
  capturedAt: string,
  exchangeRateQuality: RunPipelineOptions['exchangeRateQuality']
): ScoreEvidence {
  const scraped = { source: 'scraped' as const, capturedAt, ref: url }
  const inferred = { source: 'inferred' as const, capturedAt, ref: url }

  return {
    // 수요·경쟁·설득력은 LLM이 페이지를 보고 추정한 값이다.
    demand: inferred,
    priceCompetitiveness: inferred,
    competition: inferred,
    pageConvincing: scraped,
    automation: inferred,
    // 배송 안정성은 사이트 특성 기반 추정.
    shippingStability: inferred,
    // 마진은 서버 계산이지만 환율 품질을 따라간다.
    margin:
      exchangeRateQuality === 'REAL'
        ? { source: 'measured', capturedAt, ref: 'fx_snapshots' }
        : { source: 'manual', capturedAt, ref: 'fallback-rate' },
    // 통관 위험은 카테고리 규칙 기반. 규제 담당이 검토하기 전에는 추정이다.
    customsRisk: inferred,
  }
}

export async function runDiscoveryPipeline(
  options: RunPipelineOptions
): Promise<PipelineResult> {
  const supabase = createServiceClient()
  if (!supabase) {
    return { ok: false, stage: 'persist', reason: 'Supabase service role이 구성되지 않았습니다.' }
  }

  const assumptions = options.assumptions ?? DEFAULT_COST_ASSUMPTIONS
  const capturedAt = new Date().toISOString()
  const taskIds: string[] = []

  // ── 1. 안전 게이트 ──────────────────────────────────────────
  // 스크랩·LLM은 비용이 발생하므로 예산·비상정지를 먼저 본다.
  const gate = checkGate('external_fetch', options.policy)
  if (!gate.allowed) {
    return { ok: false, stage: 'gate', reason: gate.message }
  }

  // ── 2. 중복 확인 ────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('source_url', options.url)
    .maybeSingle()

  if (existing) {
    return { ok: false, stage: 'duplicate_check', reason: `이미 등록된 URL입니다 (${existing.id}).` }
  }

  // ── 3. 소싱 담당: 스크랩 ────────────────────────────────────
  const sourcingTask = await createTask(supabase, {
    type: 'collect_candidate',
    entityType: 'url',
    entityId: options.url,
    employeeCode: 'sourcing',
    priority: 3,
    input: { url: options.url, sourceSite: options.sourceSite },
    idempotencyScope: { url: options.url },
    actorType: 'system',
    reason: 'URL 단건 발굴 요청',
  })

  if (sourcingTask.created) taskIds.push(sourcingTask.task.id)
  else if (sourcingTask.reason === 'duplicate') {
    return {
      ok: false,
      stage: 'duplicate_check',
      reason: '같은 URL에 대한 발굴 작업이 이미 진행 중입니다.',
    }
  }

  const scrape = await scrapeUrl(options.url)
  if (!scrape.success) {
    return { ok: false, stage: 'scrape', reason: `스크랩 실패: ${scrape.error}` }
  }

  // ── 4. LLM 추출 ─────────────────────────────────────────────
  const extracted = await extractProductData(scrape.data.markdown, options.url)
  if (!extracted.success) {
    return { ok: false, stage: 'extract', reason: `추출 실패: ${extracted.error}` }
  }

  const product = extracted.product

  // ── 5. 마진·가격 담당: 마진 v2 ──────────────────────────────
  const marginInput = buildMarginInput(product, options.exchangeRate, assumptions)
  const margin = calculateMarginV2(marginInput)
  const simulation = simulateMargin(marginInput)

  // ── 6. Score 2.0 ────────────────────────────────────────────
  const evidence = buildEvidence(options.url, capturedAt, options.exchangeRateQuality)

  const category = product.category === 'other' ? 'health' : product.category
  const riskLevel = getRiskLevel(0, category)

  const score = calculateSniperScoreV2({
    metrics: {
      demandScore: product.demandScore,
      priceCompetitivenessScore: product.priceCompetitivenessScore,
      netMarginPct: margin.expectedNetMarginPct,
      shippingStabilityScore: product.shippingStabilityScore,
      riskLevel,
      competitionLevel: product.competitionLevel,
      pageConvincingScore: product.pageConvincingScore,
      automationScore: product.automationScore,
    },
    evidence,
    facts: {
      netMarginPct: margin.expectedNetMarginPct,
      unitProfit: margin.expectedNetProfit,
      roiPct: margin.roiPct,
      // 스크랩 시점에 재고를 확인했다고 전제한다. 재고 감시 담당이
      // 주기적으로 갱신한다.
      sellable: true,
      shippable: riskLevel !== 'HIGH',
      // 규제·IP 검토는 아직 수행되지 않았다. 사실대로 false로 둔다 —
      // 이 때문에 신규 후보는 항상 하드블록에 걸려 사람 검토로 간다.
      // 지시서 §7 "신규 등록은 승인 없이 실행하지 않는다"와 일치한다.
      regulatoryCleared: false,
      ipCleared: false,
      supplierTrust: extracted.product.confidence,
    },
    thresholds: DEFAULT_THRESHOLDS,
  })

  // ── 7. 직원 산출물 ──────────────────────────────────────────
  const reports = buildEmployeeReports(product, margin, options.url, riskLevel)

  // ── 8. Bucky 판정 ───────────────────────────────────────────
  const decision = decide({
    productId: options.url, // 아직 상품 ID가 없다. 저장 후 교체한다.
    score,
    margin,
    reports,
    emergencyStop: options.policy?.emergencyStop,
    dailyBudgetUsd: options.policy?.dailyBudgetUsd,
    spentTodayUsd: options.policy?.spentTodayUsd,
  })

  // ── 9. 저장 ─────────────────────────────────────────────────
  const persisted = await persistPipelineResult(supabase, {
    url: options.url,
    sourceSite: options.sourceSite,
    product,
    category,
    riskLevel,
    marginInput,
    margin,
    simulation,
    score,
    evidence,
    decision,
    reports,
    exchangeRate: options.exchangeRate,
    fxSnapshotId: options.fxSnapshotId ?? null,
  })

  if (!persisted) {
    return { ok: false, stage: 'persist', reason: '결과 저장에 실패했습니다.' }
  }

  const finalDecision: BuckyDecision = { ...decision, productId: persisted.productId }

  // ── 10. 승인 요청 ───────────────────────────────────────────
  // 지시서 §7·§18: 신규 등록은 승인 없이 실행되지 않는다.
  let approvalId: string | null = null

  if (finalDecision.requiresOwnerApproval) {
    const approval = await createApproval(supabase, {
      entityType: 'product',
      entityId: persisted.productId,
      kind: finalDecision.verdict === 'recommend' ? 'listing' : 'risk_release',
      title: `[${finalDecision.priority}] ${product.name}`,
      summary: finalDecision.reasons.join(' / '),
      payload: {
        verdict: finalDecision.verdict,
        sniperScore: finalDecision.sniperScore,
        confidence: finalDecision.confidence,
        expectedNetMarginPct: finalDecision.expectedNetMarginPct,
        expectedProfitKrw: finalDecision.expectedProfitKrw,
        hardBlocks: finalDecision.hardBlocks,
        conflicts: finalDecision.conflicts,
        nextActions: finalDecision.nextActions,
        evidenceRefs: finalDecision.evidenceRefs,
        simulation,
      },
      irreversible: finalDecision.verdict === 'recommend',
      requestedBy: 'bucky',
    })

    approvalId = approval?.id ?? null
  }

  // ── 11. 다음 작업 생성 ──────────────────────────────────────
  for (const action of finalDecision.nextActions) {
    const created = await createTask(supabase, {
      type: action.taskType,
      entityType: 'product',
      entityId: persisted.productId,
      employeeCode: action.assignedEmployee,
      priority: finalDecision.priority === 'P0' ? 1 : finalDecision.priority === 'P1' ? 3 : 5,
      input: { reason: action.reason, decisionId: persisted.decisionId },
      requiresApproval: action.requiresApproval,
      idempotencyScope: { decisionId: persisted.decisionId ?? '' },
      actorType: 'system',
      reason: action.reason,
    })

    if (created.created) taskIds.push(created.task.id)
  }

  await recordAudit({
    actorType: 'system',
    actorId: options.actorId ?? 'bucky',
    action: 'pipeline.discover_url',
    entityType: 'product',
    entityId: persisted.productId,
    after: {
      verdict: finalDecision.verdict,
      priority: finalDecision.priority,
      sniperScore: finalDecision.sniperScore,
      confidence: finalDecision.confidence,
      expectedNetMarginPct: finalDecision.expectedNetMarginPct,
      hardBlockCodes: finalDecision.hardBlocks.map((b) => b.code),
      approvalId,
    },
    reason: `URL 발굴 → Bucky ${finalDecision.verdict}`,
  })

  if (finalDecision.verdict === 'recommend' || finalDecision.priority === 'P0') {
    await notifyAdmin(
      `Bucky 판정: ${finalDecision.verdict} — ${product.name}`,
      finalDecision.priority === 'P0' ? 'critical' : 'info',
      {
        스코어: finalDecision.sniperScore,
        신뢰도: `${(finalDecision.confidence * 100).toFixed(0)}%`,
        순마진: `${finalDecision.expectedNetMarginPct.toFixed(1)}%`,
        승인대기: approvalId ? '생성됨' : '없음',
      }
    )
  }

  return {
    ok: true,
    productId: persisted.productId,
    decision: finalDecision,
    scoreId: persisted.scoreId,
    marginCalculationId: persisted.marginCalculationId,
    decisionId: persisted.decisionId,
    approvalId,
    taskIds,
  }
}

/**
 * 직원 산출물을 만든다.
 *
 * 현재는 한 번의 스크랩·추출 결과를 각 직원 관점으로 나눈 형태다.
 * 직원별 독립 실행(각자 별도 Task/Run)은 P1 후반에 붙는다. 지금도
 * 산출물 구조는 동일하므로 Bucky의 상충 검출이 그대로 동작한다.
 */
function buildEmployeeReports(
  product: ExtractedProduct,
  margin: MarginResultV2,
  url: string,
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
): EmployeeReport[] {
  return [
    {
      employee: 'sourcing',
      summary: `${product.brand || '브랜드 미확인'} · ${product.name}`,
      confidence: product.confidence,
      evidenceRefs: [url],
      claims: { overseasPrice: product.overseasPrice },
    },
    {
      employee: 'market_research',
      summary: `수요 ${product.demandScore}/5, 경쟁 ${product.competitionLevel}`,
      // LLM 추정이라 원 신뢰도보다 낮춰 잡는다.
      confidence: product.confidence * 0.8,
      evidenceRefs: [url],
      claims: { demandScore: product.demandScore },
    },
    {
      employee: 'margin_pricing',
      summary: `순마진 ${margin.expectedNetMarginPct.toFixed(1)}%, ROI ${margin.roiPct.toFixed(1)}%`,
      // 서버 계산이라 신뢰도가 높다.
      confidence: 0.95,
      evidenceRefs: ['margin_calculations'],
      claims: { netMarginPct: Number(margin.expectedNetMarginPct.toFixed(1)) },
    },
    {
      employee: 'compliance_risk',
      // 아직 실제 검토를 하지 않았다. 그 사실을 blockedReason으로 남긴다.
      summary: `카테고리 기반 통관 위험도 ${riskLevel} (규정 대조 미실시)`,
      confidence: 0.4,
      evidenceRefs: ['calculator:CUSTOMS_CATEGORY_RULES'],
      blockedReason: '규제·IP 실검토 미실시 — 사람 확인 필요',
      claims: { riskLevel },
    },
  ]
}

interface PersistInput {
  url: string
  sourceSite: string
  product: ExtractedProduct
  category: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  marginInput: MarginInputV2
  margin: MarginResultV2
  simulation: ReturnType<typeof simulateMargin>
  score: ScoreResultV2
  evidence: ScoreEvidence
  decision: BuckyDecision
  reports: EmployeeReport[]
  exchangeRate: number
  fxSnapshotId: string | null
}

interface PersistOutput {
  productId: string
  marginCalculationId: string | null
  scoreId: string | null
  decisionId: string | null
}

async function persistPipelineResult(
  supabase: ServiceClient,
  p: PersistInput
): Promise<PersistOutput | null> {
  const productId = `disc-${crypto.randomUUID().slice(0, 12)}`

  // products는 최신값 캐시다. 정본은 margin_calculations / scores다.
  const { error: productError } = await supabase.from('products').insert({
    id: productId,
    name: p.product.name,
    category: p.category,
    description: p.product.description,
    overseas_price: p.product.overseasPrice,
    local_shipping_cost: 0,
    international_shipping_cost: p.marginInput.international.shipping,
    domestic_expected_price: p.marginInput.sellingPrice,
    tax_estimate: p.marginInput.international.customsDuty + p.marginInput.international.importVat,
    payment_fee: 0,
    domestic_shipping_cost: p.marginInput.domesticOps.shipping,
    other_costs: p.marginInput.financial.otherCosts,
    total_cost: p.margin.totalCost,
    expected_margin: p.margin.expectedNetProfit,
    margin_rate: p.margin.expectedNetMarginPct,
    sniper_score: p.score.score,
    risk_level: p.riskLevel,
    source_url: p.url,
    competitor_url: '',
    // 판정과 무관하게 candidate로 시작한다. active 전환은 승인을 통과해야 한다.
    status: 'candidate',
    demand_score: Math.round(p.product.demandScore),
    price_competitiveness_score: Math.round(p.product.priceCompetitivenessScore),
    shipping_stability_score: Math.round(p.product.shippingStabilityScore),
    competition_level: p.product.competitionLevel,
    page_convincing_score: Math.round(p.product.pageConvincingScore),
    automation_score: Math.round(p.product.automationScore),
    image_url: p.product.imageUrl || null,
    exchange_rate_snapshot: p.exchangeRate,
    ai_confidence: p.product.confidence,
    source_site: p.sourceSite,
  })

  if (productError) {
    console.error('[orchestrator] 상품 저장 실패:', productError.message)
    return null
  }

  const { data: marginRow } = await supabase
    .from('margin_calculations')
    .insert({
      product_id: productId,
      fx_snapshot_id: p.fxSnapshotId,
      engine_version: 'v2',
      selling_price: p.marginInput.sellingPrice,
      sourcing_cost: p.margin.sourcingCost,
      international_cost: p.margin.internationalCost,
      selling_cost: p.margin.sellingCost,
      domestic_ops_cost: p.margin.domesticOpsCost,
      financial_cost: p.margin.financialCost,
      total_cost: p.margin.totalCost,
      expected_net_profit: p.margin.expectedNetProfit,
      expected_net_margin_pct: p.margin.expectedNetMarginPct,
      upfront_cost: p.margin.upfrontCost,
      roi_pct: p.margin.roiPct,
      input: p.marginInput,
      result: p.margin,
      simulation: p.simulation,
      calculated_by: 'orchestrator',
    })
    .select('id')
    .single()

  const { data: scoreRow } = await supabase
    .from('scores')
    .insert({
      product_id: productId,
      margin_calculation_id: marginRow?.id ?? null,
      engine_version: 'v2',
      score: p.score.score,
      confidence: p.score.confidence,
      verdict: p.score.verdict,
      breakdown: p.score.breakdown,
      confidence_breakdown: p.score.confidenceBreakdown,
      evidence: p.evidence,
      hard_blocks: p.score.hardBlocks,
      reasons: p.score.reasons,
    })
    .select('id')
    .single()

  // 규제·IP 검토가 필요하다는 사실을 risk_checks에 남긴다.
  await supabase.from('risk_checks').insert([
    {
      product_id: productId,
      check_type: 'customs',
      status: 'needs_review',
      severity: p.riskLevel === 'HIGH' ? 'critical' : p.riskLevel === 'MEDIUM' ? 'warning' : 'info',
      summary: `카테고리(${p.category}) 기반 추정 위험도 ${p.riskLevel}. 실제 규정 대조 미실시.`,
      confidence: 0.4,
      checked_by: 'orchestrator',
    },
    {
      product_id: productId,
      check_type: 'ip',
      status: 'pending',
      severity: 'warning',
      summary: '상표·IP 검토 미실시.',
      confidence: 0,
      checked_by: 'orchestrator',
    },
  ])

  const { data: decisionRow } = await supabase
    .from('bucky_decisions')
    .insert({
      product_id: productId,
      score_id: scoreRow?.id ?? null,
      margin_calculation_id: marginRow?.id ?? null,
      verdict: p.decision.verdict,
      priority: p.decision.priority,
      sniper_score: p.decision.sniperScore,
      confidence: p.decision.confidence,
      expected_net_margin_pct: p.decision.expectedNetMarginPct,
      expected_profit_krw: p.decision.expectedProfitKrw,
      hard_blocks: p.decision.hardBlocks,
      reasons: p.decision.reasons,
      conflicts: p.decision.conflicts,
      next_actions: p.decision.nextActions,
      evidence_refs: p.decision.evidenceRefs,
      employee_reports: p.reports,
      requires_owner_approval: p.decision.requiresOwnerApproval,
    })
    .select('id')
    .single()

  return {
    productId,
    marginCalculationId: marginRow?.id ?? null,
    scoreId: scoreRow?.id ?? null,
    decisionId: decisionRow?.id ?? null,
  }
}
