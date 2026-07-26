// 채널 등록 엔진 — 지시서 §7·§18.
//
// "승인 전 외부 등록이 실행되지 않는다"를 코드로 강제하는 지점이다.
//
// 상태 전이:
//   draft → pending_approval → approved → publishing → published
//                                              ↓
//                                           failed → publishing (재시도)
//   published → paused → published
//   published | paused → ended
//
// published로 가는 유일한 경로는 approved → publishing → published다.
// draft에서 곧바로 published로 갈 수 없다.
//
// 순수 함수다. 실제 채널 API 호출은 호출부가 한다.

export const LISTING_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'publishing',
  'published',
  'paused',
  'ended',
  'failed',
] as const

export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const SALES_CHANNELS = [
  'coupang',
  'naver',
  'eleven',
  'gmarket',
  'own_store',
  'other',
] as const

export type SalesChannel = (typeof SALES_CHANNELS)[number]

export const CHANNEL_LABELS: Record<SalesChannel, string> = {
  coupang: '쿠팡',
  naver: '네이버 스마트스토어',
  eleven: '11번가',
  gmarket: 'G마켓',
  own_store: '자체몰',
  other: '기타',
}

/**
 * 허용된 상태 전이.
 *
 * approved에서만 publishing으로 갈 수 있다는 점이 핵심이다.
 * draft·pending_approval에서 publishing으로 가는 경로는 없다.
 */
const ALLOWED: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ['pending_approval', 'ended'],
  pending_approval: ['approved', 'draft', 'ended'],
  // 승인을 받아도 바로 published가 아니다. publishing을 지나야 한다 —
  // 채널 API 호출이 실제로 성공했는지 확인하기 위해서다.
  approved: ['publishing', 'ended'],
  publishing: ['published', 'failed'],
  failed: ['publishing', 'ended'],
  published: ['paused', 'ended'],
  paused: ['published', 'ended'],
  ended: [],
}

export function canTransitionListing(from: ListingStatus, to: ListingStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false
}

export class ListingTransitionError extends Error {
  constructor(
    readonly from: ListingStatus,
    readonly to: ListingStatus
  ) {
    super(`허용되지 않은 등록 상태 전이입니다: ${from} → ${to}`)
    this.name = 'ListingTransitionError'
  }
}

export function assertListingTransition(from: ListingStatus, to: ListingStatus): void {
  if (!canTransitionListing(from, to)) throw new ListingTransitionError(from, to)
}

/** 외부 채널에 실제로 살아 있는 상태. */
export function isLiveOnChannel(status: ListingStatus): boolean {
  return status === 'published' || status === 'paused'
}

// ─── 등록 가능 조건 ───────────────────────────────────────────

export interface PublishPrerequisites {
  /** 소유자 승인이 완료됐는지 */
  approved: boolean
  /** 승인 레코드 ID. 없으면 승인 근거가 없다는 뜻이다. */
  approvalId: string | null
  /** Bucky 판정이 recommend였는지 */
  buckyRecommended: boolean
  /** 해소되지 않은 하드블록 수 */
  openHardBlocks: number
  /** 필수 콘텐츠(제목·설명)가 준비됐는지 */
  hasTitle: boolean
  hasDescription: boolean
  /** 콘텐츠를 사람이 검수했는지 */
  contentReviewed: boolean
  /** 등록가가 0보다 큰지 */
  listedPrice: number
  /** 등록 시점 예상 순마진율 */
  expectedNetMarginPct: number
  /** 최저 순마진 기준 */
  minNetMarginPct: number
}

export type PublishBlockCode =
  | 'NOT_APPROVED'
  | 'NO_APPROVAL_RECORD'
  | 'NOT_RECOMMENDED'
  | 'OPEN_HARD_BLOCKS'
  | 'MISSING_CONTENT'
  | 'CONTENT_NOT_REVIEWED'
  | 'INVALID_PRICE'
  | 'BELOW_MIN_MARGIN'

export interface PublishBlock {
  code: PublishBlockCode
  message: string
}

/**
 * 등록을 실행해도 되는지 확인한다.
 *
 * 승인 하나만 보지 않는다. 승인 후 소싱가가 올라 마진이 무너졌을 수도
 * 있고, 콘텐츠가 미검수일 수도 있다. 등록은 비가역이라 실행 직전에
 * 다시 전부 확인한다.
 */
export function checkPublishPrerequisites(p: PublishPrerequisites): PublishBlock[] {
  const blocks: PublishBlock[] = []

  if (!p.approved) {
    blocks.push({ code: 'NOT_APPROVED', message: '소유자 승인이 완료되지 않았습니다.' })
  }

  if (!p.approvalId) {
    blocks.push({
      code: 'NO_APPROVAL_RECORD',
      message: '승인 레코드가 없습니다. 감사 근거 없이 등록할 수 없습니다.',
    })
  }

  if (!p.buckyRecommended) {
    blocks.push({
      code: 'NOT_RECOMMENDED',
      message: 'Bucky 판정이 recommend가 아닙니다.',
    })
  }

  if (p.openHardBlocks > 0) {
    blocks.push({
      code: 'OPEN_HARD_BLOCKS',
      message: `해소되지 않은 하드블록 ${p.openHardBlocks}건이 있습니다.`,
    })
  }

  if (!p.hasTitle || !p.hasDescription) {
    blocks.push({
      code: 'MISSING_CONTENT',
      message: '등록에 필요한 제목·설명이 준비되지 않았습니다.',
    })
  }

  if (!p.contentReviewed) {
    blocks.push({
      code: 'CONTENT_NOT_REVIEWED',
      message: '콘텐츠가 검수되지 않았습니다. LLM 생성 문구를 그대로 등록하지 않습니다.',
    })
  }

  if (!Number.isFinite(p.listedPrice) || p.listedPrice <= 0) {
    blocks.push({ code: 'INVALID_PRICE', message: '등록가가 올바르지 않습니다.' })
  }

  if (p.expectedNetMarginPct < p.minNetMarginPct) {
    // 승인 시점 이후 원가가 올랐을 수 있다.
    blocks.push({
      code: 'BELOW_MIN_MARGIN',
      message: `등록 직전 순마진 ${p.expectedNetMarginPct.toFixed(1)}%가 기준 ${p.minNetMarginPct}% 미만입니다. 승인 이후 원가가 변했을 수 있습니다.`,
    })
  }

  return blocks
}

// ─── 가격 변경 ────────────────────────────────────────────────

export interface PriceChangeRequest {
  currentPrice: number
  newPrice: number
  /** 자동 변경 허용 폭 (%) */
  maxAutoChangePct: number
  /** 변경 후 예상 순마진율 */
  resultingNetMarginPct: number
  minNetMarginPct: number
}

export type PriceChangeDecision =
  | { allowed: true; auto: true; changePct: number; reason: string }
  | { allowed: true; auto: false; changePct: number; reason: string }
  | { allowed: false; reason: string }

/**
 * 가격 변경 판정.
 *
 * 지시서 §2: 대규모 가격 변경은 승인 게이트를 통과한다.
 * 한도 안의 방어적 인하는 자동, 그 밖은 승인 필요.
 */
export function decidePriceChange(req: PriceChangeRequest): PriceChangeDecision {
  if (!Number.isFinite(req.newPrice) || req.newPrice <= 0) {
    return { allowed: false, reason: '변경 가격이 올바르지 않습니다.' }
  }

  if (req.currentPrice <= 0) {
    return { allowed: false, reason: '현재 가격을 알 수 없어 변동 폭을 계산할 수 없습니다.' }
  }

  // 마진이 기준 밑으로 떨어지는 변경은 승인 여부와 무관하게 막는다.
  // 손실 방지가 최상위 원칙이다.
  if (req.resultingNetMarginPct < req.minNetMarginPct) {
    return {
      allowed: false,
      reason: `변경 후 순마진 ${req.resultingNetMarginPct.toFixed(1)}%가 기준 ${req.minNetMarginPct}% 미만이 됩니다.`,
    }
  }

  const changePct = ((req.newPrice - req.currentPrice) / req.currentPrice) * 100

  if (Math.abs(changePct) <= req.maxAutoChangePct) {
    return {
      allowed: true,
      auto: true,
      changePct,
      reason: `변동 폭 ${changePct.toFixed(1)}%가 자동 허용 범위(±${req.maxAutoChangePct}%) 안입니다.`,
    }
  }

  return {
    allowed: true,
    auto: false,
    changePct,
    reason: `변동 폭 ${changePct.toFixed(1)}%가 자동 허용 범위(±${req.maxAutoChangePct}%)를 넘어 승인이 필요합니다.`,
  }
}

// ─── 마진 감시 ────────────────────────────────────────────────

export interface MarginWatchInput {
  productId: string
  listedPrice: number
  /** 재계산된 현재 순마진율 */
  currentNetMarginPct: number
  /** 등록 시점 순마진율 */
  baselineNetMarginPct: number
  minNetMarginPct: number
  /** 재고가 있는지 */
  inStock: boolean
}

export type MarginWatchAction =
  | { action: 'none'; reason: string }
  | { action: 'alert'; severity: 'warning' | 'critical'; reason: string }
  | { action: 'pause'; reason: string }

/**
 * 가격·재고 감시 담당의 판단.
 *
 * 적자로 돌아섰거나 품절이면 방어적 일시중지는 자동으로 허용한다 —
 * 지시서 §7 "손실·규제 하드블록 시 안전한 자동 일시중지는 허용하고
 * 즉시 알린다."
 */
export function evaluateMarginWatch(input: MarginWatchInput): MarginWatchAction {
  if (!input.inStock) {
    return { action: 'pause', reason: '품절 — 판매를 계속하면 취소·환불이 발생합니다.' }
  }

  if (input.currentNetMarginPct < 0) {
    return {
      action: 'pause',
      reason: `순마진 ${input.currentNetMarginPct.toFixed(1)}% — 적자 상태입니다. 즉시 일시중지합니다.`,
    }
  }

  if (input.currentNetMarginPct < input.minNetMarginPct) {
    return {
      action: 'alert',
      severity: 'critical',
      reason: `순마진 ${input.currentNetMarginPct.toFixed(1)}%가 기준 ${input.minNetMarginPct}% 미만으로 떨어졌습니다.`,
    }
  }

  const drop = input.baselineNetMarginPct - input.currentNetMarginPct

  // 5%p 이상 하락은 원인을 봐야 한다.
  if (drop >= 5) {
    return {
      action: 'alert',
      severity: 'warning',
      reason: `순마진이 등록 시점 ${input.baselineNetMarginPct.toFixed(1)}%에서 ${input.currentNetMarginPct.toFixed(1)}%로 ${drop.toFixed(1)}%p 하락했습니다.`,
    }
  }

  return { action: 'none', reason: '마진·재고 정상' }
}
