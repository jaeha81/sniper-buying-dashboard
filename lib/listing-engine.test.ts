import { describe, it, expect } from 'vitest'
import {
  LISTING_STATUSES,
  canTransitionListing,
  assertListingTransition,
  ListingTransitionError,
  isLiveOnChannel,
  checkPublishPrerequisites,
  decidePriceChange,
  evaluateMarginWatch,
  type ListingStatus,
  type PublishPrerequisites,
} from './listing-engine'

const readyToPublish: PublishPrerequisites = {
  approved: true,
  approvalId: 'appr-1',
  buckyRecommended: true,
  openHardBlocks: 0,
  hasTitle: true,
  hasDescription: true,
  contentReviewed: true,
  listedPrice: 50000,
  expectedNetMarginPct: 25,
  minNetMarginPct: 15,
}

describe('등록 상태 전이 — 지시서 §18', () => {
  it('draft에서 곧바로 published로 갈 수 없다', () => {
    // 승인 전 외부 등록이 실행되지 않는다.
    expect(canTransitionListing('draft', 'published')).toBe(false)
    expect(canTransitionListing('draft', 'publishing')).toBe(false)
  })

  it('승인 대기에서 곧바로 등록할 수 없다', () => {
    expect(canTransitionListing('pending_approval', 'publishing')).toBe(false)
    expect(canTransitionListing('pending_approval', 'published')).toBe(false)
  })

  it('published로 가는 유일한 경로는 approved → publishing → published다', () => {
    const paths = LISTING_STATUSES.filter((s) => canTransitionListing(s, 'published'))
    expect(paths.sort()).toEqual(['paused', 'publishing'])

    const toPublishing = LISTING_STATUSES.filter((s) => canTransitionListing(s, 'publishing'))
    expect(toPublishing.sort()).toEqual(['approved', 'failed'])
  })

  it('승인을 받아도 바로 published가 아니다', () => {
    // publishing을 지나야 한다 — 채널 API가 실제로 성공했는지 확인하려고.
    expect(canTransitionListing('approved', 'published')).toBe(false)
    expect(canTransitionListing('approved', 'publishing')).toBe(true)
  })

  it('ended는 종료 상태다', () => {
    for (const to of LISTING_STATUSES) {
      expect(canTransitionListing('ended', to)).toBe(false)
    }
  })

  it('실패한 등록은 재시도할 수 있다', () => {
    expect(canTransitionListing('publishing', 'failed')).toBe(true)
    expect(canTransitionListing('failed', 'publishing')).toBe(true)
  })

  it('일시중지와 재개가 가능하다', () => {
    expect(canTransitionListing('published', 'paused')).toBe(true)
    expect(canTransitionListing('paused', 'published')).toBe(true)
  })

  it('허용되지 않은 전이는 예외를 던진다', () => {
    expect(() => assertListingTransition('draft', 'published')).toThrow(ListingTransitionError)
    expect(() => assertListingTransition('approved', 'publishing')).not.toThrow()
  })

  it('채널에 살아 있는 상태를 구분한다', () => {
    expect(isLiveOnChannel('published')).toBe(true)
    expect(isLiveOnChannel('paused')).toBe(true)
    expect(isLiveOnChannel('approved')).toBe(false)
    expect(isLiveOnChannel('ended')).toBe(false)
  })
})

describe('등록 사전 조건', () => {
  it('모든 조건이 갖춰지면 통과한다', () => {
    expect(checkPublishPrerequisites(readyToPublish)).toEqual([])
  })

  it('승인 없이 등록할 수 없다', () => {
    const blocks = checkPublishPrerequisites({ ...readyToPublish, approved: false })
    expect(blocks.map((b) => b.code)).toContain('NOT_APPROVED')
  })

  it('승인 레코드가 없으면 막는다 — 감사 근거가 필요하다', () => {
    const blocks = checkPublishPrerequisites({ ...readyToPublish, approvalId: null })
    expect(blocks.map((b) => b.code)).toContain('NO_APPROVAL_RECORD')
  })

  it('Bucky가 추천하지 않았으면 막는다', () => {
    const blocks = checkPublishPrerequisites({ ...readyToPublish, buckyRecommended: false })
    expect(blocks.map((b) => b.code)).toContain('NOT_RECOMMENDED')
  })

  it('하드블록이 남아 있으면 막는다', () => {
    const blocks = checkPublishPrerequisites({ ...readyToPublish, openHardBlocks: 1 })
    expect(blocks.map((b) => b.code)).toContain('OPEN_HARD_BLOCKS')
  })

  it('제목·설명이 없으면 막는다', () => {
    expect(
      checkPublishPrerequisites({ ...readyToPublish, hasTitle: false }).map((b) => b.code)
    ).toContain('MISSING_CONTENT')
  })

  it('미검수 콘텐츠로 등록하지 않는다', () => {
    // LLM 생성 문구를 그대로 채널에 올리면 안 된다.
    const blocks = checkPublishPrerequisites({ ...readyToPublish, contentReviewed: false })
    expect(blocks.map((b) => b.code)).toContain('CONTENT_NOT_REVIEWED')
  })

  it('승인 이후 마진이 무너졌으면 막는다', () => {
    // 승인 하나만 보고 등록하면 안 되는 이유다.
    const blocks = checkPublishPrerequisites({ ...readyToPublish, expectedNetMarginPct: 5 })
    expect(blocks.map((b) => b.code)).toContain('BELOW_MIN_MARGIN')
    expect(blocks.find((b) => b.code === 'BELOW_MIN_MARGIN')?.message).toContain('승인 이후')
  })

  it('가격이 0이면 막는다', () => {
    expect(
      checkPublishPrerequisites({ ...readyToPublish, listedPrice: 0 }).map((b) => b.code)
    ).toContain('INVALID_PRICE')
  })

  it('여러 조건이 동시에 잡힌다', () => {
    const blocks = checkPublishPrerequisites({
      approved: false,
      approvalId: null,
      buckyRecommended: false,
      openHardBlocks: 2,
      hasTitle: false,
      hasDescription: false,
      contentReviewed: false,
      listedPrice: 0,
      expectedNetMarginPct: -5,
      minNetMarginPct: 15,
    })
    expect(blocks.length).toBeGreaterThanOrEqual(7)
  })
})

describe('가격 변경 판정', () => {
  const base = {
    currentPrice: 50000,
    maxAutoChangePct: 10,
    resultingNetMarginPct: 20,
    minNetMarginPct: 15,
  }

  it('한도 안의 변경은 자동 허용한다', () => {
    const d = decidePriceChange({ ...base, newPrice: 52000 })
    expect(d.allowed).toBe(true)
    if (d.allowed) expect(d.auto).toBe(true)
  })

  it('한도를 넘는 변경은 승인을 요구한다', () => {
    const d = decidePriceChange({ ...base, newPrice: 40000 })
    expect(d.allowed).toBe(true)
    if (d.allowed) {
      expect(d.auto).toBe(false)
      expect(d.reason).toContain('승인이 필요')
    }
  })

  it('마진 기준을 깨는 변경은 승인 여부와 무관하게 막는다', () => {
    // 손실 방지가 최상위 원칙이다.
    const d = decidePriceChange({ ...base, newPrice: 45000, resultingNetMarginPct: 5 })
    expect(d.allowed).toBe(false)
  })

  it('경계값(정확히 한도)은 자동 허용한다', () => {
    const d = decidePriceChange({ ...base, newPrice: 55000 })
    expect(d.allowed).toBe(true)
    if (d.allowed) expect(d.auto).toBe(true)
  })

  it('인상과 인하 모두 같은 폭 기준을 적용한다', () => {
    const up = decidePriceChange({ ...base, newPrice: 57500 })
    const down = decidePriceChange({ ...base, newPrice: 42500 })

    expect(up.allowed && up.auto).toBe(false)
    expect(down.allowed && down.auto).toBe(false)
  })

  it('잘못된 가격을 거부한다', () => {
    expect(decidePriceChange({ ...base, newPrice: 0 }).allowed).toBe(false)
    expect(decidePriceChange({ ...base, newPrice: -1 }).allowed).toBe(false)
    expect(decidePriceChange({ ...base, currentPrice: 0, newPrice: 100 }).allowed).toBe(false)
  })
})

describe('마진 감시', () => {
  const base = {
    productId: 'p1',
    listedPrice: 50000,
    currentNetMarginPct: 22,
    baselineNetMarginPct: 25,
    minNetMarginPct: 15,
    inStock: true,
  }

  it('정상이면 아무 조치도 하지 않는다', () => {
    expect(evaluateMarginWatch(base).action).toBe('none')
  })

  it('품절이면 즉시 일시중지한다', () => {
    const r = evaluateMarginWatch({ ...base, inStock: false })
    expect(r.action).toBe('pause')
    expect(r.reason).toContain('품절')
  })

  it('적자로 돌아서면 즉시 일시중지한다', () => {
    // 지시서 §7: 손실 하드블록 시 안전한 자동 일시중지는 허용한다.
    const r = evaluateMarginWatch({ ...base, currentNetMarginPct: -3 })
    expect(r.action).toBe('pause')
    expect(r.reason).toContain('적자')
  })

  it('기준 미만이면 critical 경고를 낸다', () => {
    const r = evaluateMarginWatch({ ...base, currentNetMarginPct: 10 })
    expect(r.action).toBe('alert')
    if (r.action === 'alert') expect(r.severity).toBe('critical')
  })

  it('5%p 이상 하락하면 warning을 낸다', () => {
    const r = evaluateMarginWatch({ ...base, currentNetMarginPct: 19, baselineNetMarginPct: 25 })
    expect(r.action).toBe('alert')
    if (r.action === 'alert') expect(r.severity).toBe('warning')
  })

  it('품절이 적자보다 먼저 걸린다', () => {
    const r = evaluateMarginWatch({ ...base, inStock: false, currentNetMarginPct: -10 })
    expect(r.action).toBe('pause')
    expect(r.reason).toContain('품절')
  })
})
