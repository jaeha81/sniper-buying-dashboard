// ============================================================================
// 역할별 시스템 프롬프트 + JSON 스키마 — LLM 보강 판단용.
//
// heuristic 이 만든 태스크/파인딩에 "정밀 판단"을 덧입힌다. 게이트웨이가 없으면
// 이 판단은 스킵되고 결정론적 로직만으로도 방어가 유지된다(안전).
// ============================================================================

import type { ReasoningTask } from '../config/agents.config'

export interface ReasoningSpec {
  system: string
  /** JSON 응답 스키마(게이트웨이가 강제) */
  schema: Record<string, unknown>
}

const BASE_RULES =
  'You are a specialist agent in a Korean cross-border dropshipping operation (Sniper). ' +
  'Be precise and conservative: when uncertain, prefer holding for human review over acting. ' +
  'Respond ONLY with the requested JSON.'

export const REASONING_SPECS: Record<ReasoningTask, ReasoningSpec> = {
  candidate_fit: {
    system: `${BASE_RULES} Evaluate whether an overseas product candidate is a good fit given its Sniper Score, margin, and risk. Justify the score.`,
    schema: {
      type: 'object',
      required: ['recommend', 'confidence', 'reasons'],
      properties: {
        recommend: { type: 'boolean' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        adjustedScore: { type: 'number', minimum: 0, maximum: 100 },
        reasons: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  listing_copy: {
    system: `${BASE_RULES} Draft a persuasive but honest Korean product listing (title + 3 bullet benefits). No false claims.`,
    schema: {
      type: 'object',
      required: ['title', 'bullets'],
      properties: {
        title: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
      },
    },
  },
  repricing_review: {
    system: `${BASE_RULES} Given cost breakdown and a proposed price, verify the margin math and whether the price is competitive. Flag if the proposed change is unsafe.`,
    schema: {
      type: 'object',
      required: ['approve', 'marginRateCheck'],
      properties: {
        approve: { type: 'boolean' },
        marginRateCheck: { type: 'number' },
        competitivenessNote: { type: 'string' },
        suggestedPrice: { type: 'number' },
      },
    },
  },
  order_triage: {
    system: `${BASE_RULES} Classify why an order is delayed and draft a short, reassuring Korean customer message. Never promise dates you cannot guarantee.`,
    schema: {
      type: 'object',
      required: ['cause', 'customerMessage'],
      properties: {
        cause: { type: 'string', enum: ['sourcing', 'customs', 'shipping', 'payment', 'unknown'] },
        customerMessage: { type: 'string' },
        needsHuman: { type: 'boolean' },
      },
    },
  },
  compliance_verdict: {
    system: `${BASE_RULES} Assess Korean import/compliance risk (금지품목, 인증 필요, 통관 리스크). Be strict; escalate anything uncertain.`,
    schema: {
      type: 'object',
      required: ['risk', 'blocked', 'rationale'],
      properties: {
        risk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
        blocked: { type: 'boolean' },
        certificationsNeeded: { type: 'array', items: { type: 'string' } },
        rationale: { type: 'string' },
      },
    },
  },
  daily_brief: {
    system: `${BASE_RULES} Summarize the day's open tasks, findings, and anomalies into a prioritized Korean brief for a solo operator.`,
    schema: {
      type: 'object',
      required: ['headline', 'priorities'],
      properties: {
        headline: { type: 'string' },
        priorities: { type: 'array', items: { type: 'string' } },
        anomalies: { type: 'array', items: { type: 'string' } },
      },
    },
  },
}
