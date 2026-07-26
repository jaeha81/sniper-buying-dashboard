import { describe, it, expect } from 'vitest'
import { DEFAULT_COST_ASSUMPTIONS } from './orchestrator'
import { calculateMarginV2, type MarginInputV2 } from './margin-engine'
import { calculateSniperScoreV2, type ScoreEvidence } from './score-engine'
import { decide } from './bucky'

// 오케스트레이터의 DB 경로는 여기서 테스트하지 않는다(Supabase 필요).
// 대신 파이프라인이 의존하는 계약을 고정한다 — 신규 후보가 승인 없이
// 통과하지 못한다는 것이 핵심이다.

const NOW = new Date('2026-07-26T00:00:00Z').getTime()
const CAPTURED = '2026-07-26T00:00:00Z'

/** 오케스트레이터가 실제로 만드는 형태의 근거. LLM 추정이 섞여 있다. */
function pipelineEvidence(marginSource: 'measured' | 'manual'): ScoreEvidence {
  const inferred = { source: 'inferred' as const, capturedAt: CAPTURED, ref: 'url' }
  return {
    demand: inferred,
    priceCompetitiveness: inferred,
    competition: inferred,
    pageConvincing: { source: 'scraped', capturedAt: CAPTURED, ref: 'url' },
    automation: inferred,
    shippingStability: inferred,
    customsRisk: inferred,
    margin: { source: marginSource, capturedAt: CAPTURED, ref: 'fx' },
  }
}

const goodMarginInput: MarginInputV2 = {
  sellingPrice: 50000,
  sourcing: { productPrice: 10, optionCost: 0, localTax: 0, localShipping: 0, paymentFee: 0 },
  international: {
    shipping: DEFAULT_COST_ASSUMPTIONS.internationalShipping,
    volumetricSurcharge: DEFAULT_COST_ASSUMPTIONS.volumetricSurcharge,
    insurance: DEFAULT_COST_ASSUMPTIONS.insurance,
    customsDuty: 1080,
    importVat: 1350,
    customsFee: DEFAULT_COST_ASSUMPTIONS.customsFee,
  },
  selling: {
    marketplaceFeePct: DEFAULT_COST_ASSUMPTIONS.marketplaceFeePct,
    paymentFeePct: DEFAULT_COST_ASSUMPTIONS.paymentFeePct,
    adCost: DEFAULT_COST_ASSUMPTIONS.adCost,
    couponDiscount: 0,
    pointsCost: 0,
  },
  domesticOps: {
    shipping: DEFAULT_COST_ASSUMPTIONS.domesticShipping,
    packaging: DEFAULT_COST_ASSUMPTIONS.packaging,
    csCost: DEFAULT_COST_ASSUMPTIONS.csCost,
    returnReservePct: DEFAULT_COST_ASSUMPTIONS.returnReservePct,
  },
  financial: {
    exchangeRate: 1350,
    fxSpreadPct: DEFAULT_COST_ASSUMPTIONS.fxSpreadPct,
    taxReservePct: DEFAULT_COST_ASSUMPTIONS.taxReservePct,
    otherCosts: DEFAULT_COST_ASSUMPTIONS.otherCosts,
  },
}

describe('신규 후보는 승인 없이 통과하지 못한다 — 지시서 §7', () => {
  it('규제·IP 미검토 상태에서는 반드시 reject된다', () => {
    // 오케스트레이터는 regulatoryCleared/ipCleared를 false로 넘긴다.
    // 실제 검토를 하지 않았으므로 사실대로 적는 것이고, 그 결과 어떤
    // 신규 후보도 자동으로 등록 경로에 오르지 못한다.
    const margin = calculateMarginV2(goodMarginInput)

    const score = calculateSniperScoreV2(
      {
        metrics: {
          demandScore: 5,
          priceCompetitivenessScore: 5,
          netMarginPct: margin.expectedNetMarginPct,
          shippingStabilityScore: 5,
          riskLevel: 'LOW',
          competitionLevel: 'low',
          pageConvincingScore: 5,
          automationScore: 5,
        },
        evidence: pipelineEvidence('measured'),
        facts: {
          netMarginPct: margin.expectedNetMarginPct,
          unitProfit: margin.expectedNetProfit,
          roiPct: margin.roiPct,
          sellable: true,
          shippable: true,
          regulatoryCleared: false,
          ipCleared: false,
          supplierTrust: 0.9,
        },
      },
      NOW
    )

    expect(score.verdict).toBe('reject')
    expect(score.hardBlocks.map((b) => b.code)).toEqual(
      expect.arrayContaining(['REGULATORY_UNRESOLVED', 'IP_RISK_UNRESOLVED'])
    )
  })

  it('Bucky 판정도 reject이고 소유자 상신이 걸린다', () => {
    const margin = calculateMarginV2(goodMarginInput)
    const score = calculateSniperScoreV2(
      {
        metrics: {
          demandScore: 5, priceCompetitivenessScore: 5,
          netMarginPct: margin.expectedNetMarginPct, shippingStabilityScore: 5,
          riskLevel: 'LOW', competitionLevel: 'low',
          pageConvincingScore: 5, automationScore: 5,
        },
        evidence: pipelineEvidence('measured'),
        facts: {
          netMarginPct: margin.expectedNetMarginPct,
          unitProfit: margin.expectedNetProfit,
          roiPct: margin.roiPct,
          sellable: true, shippable: true,
          regulatoryCleared: false, ipCleared: false, supplierTrust: 0.9,
        },
      },
      NOW
    )

    const decision = decide({
      productId: 'p1',
      score,
      margin,
      reports: [
        {
          employee: 'compliance_risk',
          summary: '규제 실검토 미실시',
          confidence: 0.4,
          evidenceRefs: ['rules'],
          blockedReason: '규제·IP 실검토 미실시 — 사람 확인 필요',
        },
      ],
    })

    expect(decision.verdict).toBe('reject')
    expect(decision.requiresOwnerApproval).toBe(true)
    // 등록 작업이 자동 생성되지 않는다.
    expect(decision.nextActions.map((a) => a.taskType)).not.toContain('publish_listing')
  })

  it('규제·IP가 해소되면 recommend로 올라가고, 그래도 등록은 승인을 요구한다', () => {
    const margin = calculateMarginV2(goodMarginInput)
    const score = calculateSniperScoreV2(
      {
        metrics: {
          demandScore: 5, priceCompetitivenessScore: 5,
          netMarginPct: margin.expectedNetMarginPct, shippingStabilityScore: 5,
          riskLevel: 'LOW', competitionLevel: 'low',
          pageConvincingScore: 5, automationScore: 5,
        },
        evidence: pipelineEvidence('measured'),
        facts: {
          netMarginPct: margin.expectedNetMarginPct,
          unitProfit: margin.expectedNetProfit,
          roiPct: margin.roiPct,
          sellable: true, shippable: true,
          // 규제 담당이 검토를 마친 상태.
          regulatoryCleared: true, ipCleared: true, supplierTrust: 0.9,
        },
      },
      NOW
    )

    const decision = decide({ productId: 'p1', score, margin, reports: [] })

    expect(score.hardBlocks).toEqual([])
    expect(decision.verdict).toBe('recommend')

    const publish = decision.nextActions.find((a) => a.taskType === 'publish_listing')
    expect(publish).toBeDefined()
    // 지시서 §18: 승인 전 외부 등록이 실행되지 않는다.
    expect(publish?.requiresApproval).toBe(true)
  })
})

describe('환율 품질이 판정에 반영된다', () => {
  it('폴백 환율(ESTIMATE)을 쓰면 신뢰도가 떨어진다', () => {
    const margin = calculateMarginV2(goodMarginInput)

    const facts = {
      netMarginPct: margin.expectedNetMarginPct,
      unitProfit: margin.expectedNetProfit,
      roiPct: margin.roiPct,
      sellable: true, shippable: true,
      regulatoryCleared: true, ipCleared: true, supplierTrust: 0.9,
    }

    const metrics = {
      demandScore: 5, priceCompetitivenessScore: 5,
      netMarginPct: margin.expectedNetMarginPct, shippingStabilityScore: 5,
      riskLevel: 'LOW' as const, competitionLevel: 'low' as const,
      pageConvincingScore: 5, automationScore: 5,
    }

    const real = calculateSniperScoreV2(
      { metrics, evidence: pipelineEvidence('measured'), facts },
      NOW
    )
    const estimate = calculateSniperScoreV2(
      { metrics, evidence: pipelineEvidence('manual'), facts },
      NOW
    )

    expect(estimate.confidence).toBeLessThan(real.confidence)
    // 점수는 같다 — 환율은 신뢰도에만 영향을 준다.
    expect(estimate.score).toBe(real.score)
  })
})

describe('기본 비용 가정', () => {
  it('누락 없이 전 항목이 채워져 있다', () => {
    // 하나라도 0/undefined로 빠지면 마진이 부풀려진다.
    for (const [key, value] of Object.entries(DEFAULT_COST_ASSUMPTIONS)) {
      expect(typeof value, key).toBe('number')
      expect(Number.isFinite(value), key).toBe(true)
    }
  })

  it('판매가 배수가 1보다 크다', () => {
    expect(DEFAULT_COST_ASSUMPTIONS.targetMarkup).toBeGreaterThan(1)
  })

  it('가정값으로 계산해도 판매·운영 비용이 실제로 반영된다', () => {
    const margin = calculateMarginV2(goodMarginInput)
    expect(margin.sellingCost).toBeGreaterThan(0)
    expect(margin.domesticOpsCost).toBeGreaterThan(0)
    expect(margin.financialCost).toBeGreaterThan(0)
  })
})
