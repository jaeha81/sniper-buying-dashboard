import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  verifyWebhook,
  signWebhook,
  InMemoryNonceStore,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  NONCE_HEADER,
  TIMESTAMP_TOLERANCE_SECONDS,
} from './webhook-auth'

const SECRET = 'automation-secret-at-least-16-chars'
const NOW = 1_800_000_000
const BODY = JSON.stringify({ scenario: 'price_watch', productId: 'prod-001' })

async function headersFor(
  opts: { timestamp?: number; nonce?: string; body?: string; secret?: string } = {}
): Promise<Headers> {
  const timestamp = String(opts.timestamp ?? NOW)
  const nonce = opts.nonce ?? 'nonce-1'
  const body = opts.body ?? BODY
  const signature = await signWebhook(opts.secret ?? SECRET, timestamp, nonce, body)

  return new Headers({
    [SIGNATURE_HEADER]: signature,
    [TIMESTAMP_HEADER]: timestamp,
    [NONCE_HEADER]: nonce,
  })
}

describe('Make.com 웹훅 서명 검증 — 지시서 §12', () => {
  const original = process.env.AUTOMATION_WEBHOOK_SECRET

  beforeEach(() => {
    process.env.AUTOMATION_WEBHOOK_SECRET = SECRET
  })

  afterEach(() => {
    if (original === undefined) delete process.env.AUTOMATION_WEBHOOK_SECRET
    else process.env.AUTOMATION_WEBHOOK_SECRET = original
  })

  it('올바른 서명을 통과시킨다', async () => {
    const r = await verifyWebhook(await headersFor(), BODY, new InMemoryNonceStore(), NOW)
    expect(r.ok).toBe(true)
  })

  it('시크릿이 없으면 거부한다', async () => {
    delete process.env.AUTOMATION_WEBHOOK_SECRET
    const r = await verifyWebhook(await headersFor(), BODY, new InMemoryNonceStore(), NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('secret_not_configured')
  })

  it('시크릿이 너무 짧으면 거부한다', async () => {
    process.env.AUTOMATION_WEBHOOK_SECRET = 'short'
    const r = await verifyWebhook(await headersFor(), BODY, new InMemoryNonceStore(), NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('secret_not_configured')
  })

  it('헤더가 빠지면 거부한다', async () => {
    for (const missing of [SIGNATURE_HEADER, TIMESTAMP_HEADER, NONCE_HEADER]) {
      const h = await headersFor()
      h.delete(missing)
      const r = await verifyWebhook(h, BODY, new InMemoryNonceStore(), NOW)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('missing_headers')
    }
  })

  it('본문이 조작되면 거부한다', async () => {
    const h = await headersFor({ body: BODY })
    const tampered = JSON.stringify({ scenario: 'price_watch', productId: 'prod-999' })

    const r = await verifyWebhook(h, tampered, new InMemoryNonceStore(), NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('signature_mismatch')
  })

  it('다른 시크릿으로 만든 서명을 거부한다', async () => {
    const h = await headersFor({ secret: 'a-completely-different-secret-1' })
    const r = await verifyWebhook(h, BODY, new InMemoryNonceStore(), NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('signature_mismatch')
  })

  it('오래된 타임스탬프를 거부한다', async () => {
    const old = NOW - TIMESTAMP_TOLERANCE_SECONDS - 1
    const r = await verifyWebhook(
      await headersFor({ timestamp: old }),
      BODY,
      new InMemoryNonceStore(),
      NOW
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('timestamp_expired')
  })

  it('미래 타임스탬프도 거부한다', async () => {
    // 미래를 허용하면 서명을 미리 만들어 보관해 두고 쓸 수 있다.
    const future = NOW + TIMESTAMP_TOLERANCE_SECONDS + 1
    const r = await verifyWebhook(
      await headersFor({ timestamp: future }),
      BODY,
      new InMemoryNonceStore(),
      NOW
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('timestamp_expired')
  })

  it('허용 범위 경계는 통과시킨다', async () => {
    const edge = NOW - TIMESTAMP_TOLERANCE_SECONDS
    const r = await verifyWebhook(
      await headersFor({ timestamp: edge }),
      BODY,
      new InMemoryNonceStore(),
      NOW
    )
    expect(r.ok).toBe(true)
  })

  it('숫자가 아닌 타임스탬프를 거부한다', async () => {
    const h = await headersFor()
    h.set(TIMESTAMP_HEADER, 'not-a-number')
    const r = await verifyWebhook(h, BODY, new InMemoryNonceStore(), NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('timestamp_invalid')
  })

  it('같은 요청을 두 번 보내면 두 번째를 거부한다 — replay 방지', async () => {
    const store = new InMemoryNonceStore()
    const h = await headersFor({ nonce: 'nonce-replay' })

    const first = await verifyWebhook(h, BODY, store, NOW)
    expect(first.ok).toBe(true)

    const second = await verifyWebhook(h, BODY, store, NOW)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.reason).toBe('nonce_replayed')
  })

  it('서명이 틀린 요청의 nonce는 저장소에 남기지 않는다', async () => {
    // 남기면 공격자가 임의 nonce로 저장소를 채워 정상 요청을 막을 수 있다.
    const store = new InMemoryNonceStore()
    const bad = await headersFor({ nonce: 'victim-nonce', secret: 'wrong-secret-1234567890' })

    const rejected = await verifyWebhook(bad, BODY, store, NOW)
    expect(rejected.ok).toBe(false)

    // 같은 nonce로 정상 요청이 들어오면 통과해야 한다.
    const good = await headersFor({ nonce: 'victim-nonce' })
    const accepted = await verifyWebhook(good, BODY, store, NOW)
    expect(accepted.ok).toBe(true)
  })

  it('nonce가 다르면 같은 본문도 통과한다', async () => {
    const store = new InMemoryNonceStore()

    const a = await verifyWebhook(await headersFor({ nonce: 'n-a' }), BODY, store, NOW)
    const b = await verifyWebhook(await headersFor({ nonce: 'n-b' }), BODY, store, NOW)

    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
  })
})

describe('서명 생성', () => {
  it('같은 입력이면 같은 서명이 나온다', async () => {
    const a = await signWebhook(SECRET, '100', 'n', 'body')
    const b = await signWebhook(SECRET, '100', 'n', 'body')
    expect(a).toBe(b)
  })

  it('sha256= 접두사를 붙인다', async () => {
    const sig = await signWebhook(SECRET, '100', 'n', 'body')
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('타임스탬프나 nonce가 달라지면 서명도 달라진다', async () => {
    const base = await signWebhook(SECRET, '100', 'n', 'body')
    expect(await signWebhook(SECRET, '101', 'n', 'body')).not.toBe(base)
    expect(await signWebhook(SECRET, '100', 'm', 'body')).not.toBe(base)
  })
})

describe('InMemoryNonceStore', () => {
  it('만료된 nonce는 재사용 가능하다', async () => {
    const store = new InMemoryNonceStore()
    const past = Math.floor(Date.now() / 1000) - 10

    expect(await store.seen('n1', past)).toBe(false)
    // 만료 시각이 지났으므로 정리되고 다시 처음 본 것으로 취급한다.
    expect(await store.seen('n1', past)).toBe(false)
  })

  it('만료 전에는 중복을 잡는다', async () => {
    const store = new InMemoryNonceStore()
    const future = Math.floor(Date.now() / 1000) + 600

    expect(await store.seen('n2', future)).toBe(false)
    expect(await store.seen('n2', future)).toBe(true)
  })
})
