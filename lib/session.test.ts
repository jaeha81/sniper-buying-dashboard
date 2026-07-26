import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  signSessionToken,
  verifySessionToken,
  sessionExpiryFromNow,
  SESSION_TTL_SECONDS,
} from './session'

const SECRET = 'test-secret-value-at-least-16-chars-long'
const SESSION_ID = '11111111-2222-3333-4444-555555555555'

describe('세션 토큰', () => {
  const originalSecret = process.env.ADMIN_SESSION_SECRET

  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = SECRET
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.ADMIN_SESSION_SECRET
    else process.env.ADMIN_SESSION_SECRET = originalSecret
  })

  it('발급한 토큰을 검증하면 세션 ID와 만료가 나온다', async () => {
    const expiresAt = sessionExpiryFromNow()
    const token = await signSessionToken(SESSION_ID, expiresAt)
    expect(token).not.toBeNull()

    const claims = await verifySessionToken(token)
    expect(claims).toEqual({ sessionId: SESSION_ID, expiresAt })
  })

  it('쿠키 값에 시크릿이 담기지 않는다', async () => {
    // 이전 구현은 ADMIN_SESSION_SECRET을 그대로 쿠키에 넣었다.
    // 이 테스트가 그 회귀를 막는다.
    const token = await signSessionToken(SESSION_ID, sessionExpiryFromNow())
    expect(token).not.toBeNull()
    expect(token!).not.toContain(SECRET)
  })

  it('서명을 조작하면 거부한다', async () => {
    const token = await signSessionToken(SESSION_ID, sessionExpiryFromNow())
    const parts = token!.split('.')
    // 마지막 문자만 뒤집는다.
    const lastChar = parts[3].slice(-1)
    parts[3] = parts[3].slice(0, -1) + (lastChar === 'a' ? 'b' : 'a')

    expect(await verifySessionToken(parts.join('.'))).toBeNull()
  })

  it('세션 ID를 바꿔치기하면 거부한다', async () => {
    const token = await signSessionToken(SESSION_ID, sessionExpiryFromNow())
    const parts = token!.split('.')
    parts[1] = '99999999-9999-9999-9999-999999999999'

    expect(await verifySessionToken(parts.join('.'))).toBeNull()
  })

  it('만료 시각을 늘려 잡으면 서명이 깨져 거부한다', async () => {
    const expiresAt = sessionExpiryFromNow()
    const token = await signSessionToken(SESSION_ID, expiresAt)
    const parts = token!.split('.')
    parts[2] = String(expiresAt + 86400)

    expect(await verifySessionToken(parts.join('.'))).toBeNull()
  })

  it('만료된 토큰은 서명이 유효해도 거부한다', async () => {
    const now = 1_000_000
    const expiresAt = now + 10
    const token = await signSessionToken(SESSION_ID, expiresAt)

    expect(await verifySessionToken(token, now)).not.toBeNull()
    expect(await verifySessionToken(token, expiresAt)).toBeNull()
    expect(await verifySessionToken(token, expiresAt + 1)).toBeNull()
  })

  it('다른 시크릿으로 만든 토큰은 거부한다', async () => {
    process.env.ADMIN_SESSION_SECRET = 'a-completely-different-secret-value'
    const foreign = await signSessionToken(SESSION_ID, sessionExpiryFromNow())

    process.env.ADMIN_SESSION_SECRET = SECRET
    expect(await verifySessionToken(foreign)).toBeNull()
  })

  it('빈 값과 형식이 어긋난 토큰을 거부한다', async () => {
    expect(await verifySessionToken(undefined)).toBeNull()
    expect(await verifySessionToken(null)).toBeNull()
    expect(await verifySessionToken('')).toBeNull()
    expect(await verifySessionToken('garbage')).toBeNull()
    expect(await verifySessionToken('v1.a.b')).toBeNull()
    expect(await verifySessionToken(`v2.${SESSION_ID}.999.deadbeef`)).toBeNull()
    expect(await verifySessionToken(`v1.${SESSION_ID}.notanumber.deadbeef`)).toBeNull()
  })

  it('시크릿이 없거나 너무 짧으면 발급도 검증도 하지 않는다', async () => {
    const valid = await signSessionToken(SESSION_ID, sessionExpiryFromNow())

    delete process.env.ADMIN_SESSION_SECRET
    expect(await signSessionToken(SESSION_ID, sessionExpiryFromNow())).toBeNull()
    expect(await verifySessionToken(valid)).toBeNull()

    process.env.ADMIN_SESSION_SECRET = 'tooshort'
    expect(await signSessionToken(SESSION_ID, sessionExpiryFromNow())).toBeNull()
    expect(await verifySessionToken(valid)).toBeNull()
  })

  it('기본 수명은 8시간이다', () => {
    expect(SESSION_TTL_SECONDS).toBe(8 * 60 * 60)
    expect(sessionExpiryFromNow(SESSION_TTL_SECONDS, 1000)).toBe(1000 + 28800)
  })
})
