// 관리자 세션 토큰 — 서명 발급과 검증.
//
// 기존 구조는 ADMIN_SESSION_SECRET 값을 그대로 쿠키에 담았다. 쿠키가
// 유출되면 서버 시크릿이 유출되는 것과 같았고, 개별 세션을 만료·폐기할
// 방법도 없었다. 이제 쿠키에는 서명된 토큰만 담기고 시크릿은 서버를
// 떠나지 않는다.
//
//   v1.<session id>.<만료 epoch 초>.<HMAC-SHA256>
//
// 서명 검증은 상태가 없어서 미들웨어가 DB 왕복 없이 처리하고,
// 폐기 여부는 라우트가 sessions 테이블을 조회해 확인한다(lib/admin-auth.ts).
//
// Web Crypto만 사용한다 — Edge(미들웨어)와 Node(라우트) 런타임 모두에서
// 같은 코드가 돌아야 하기 때문이다.

export const SESSION_COOKIE = 'sniper_session'

/** 세션 수명. 8시간. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8

const TOKEN_VERSION = 'v1'

export interface SessionClaims {
  sessionId: string
  /** 만료 시각 (epoch 초) */
  expiresAt: number
}

function getSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < 16) return null
  return secret
}

const encoder = new TextEncoder()

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 길이와 무관하게 일정 시간이 걸리는 비교.
 * `===`는 첫 불일치 바이트에서 빠져나오므로 서명 비교에 쓰면 안 된다.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** 세션 ID와 만료 시각으로 서명된 쿠키 값을 만든다. */
export async function signSessionToken(
  sessionId: string,
  expiresAtEpochSeconds: number
): Promise<string | null> {
  const secret = getSecret()
  if (!secret) return null

  const payload = `${TOKEN_VERSION}.${sessionId}.${expiresAtEpochSeconds}`
  const signature = await hmacHex(secret, payload)
  return `${payload}.${signature}`
}

/**
 * 서명과 만료만 검증한다. 폐기 여부는 확인하지 않는다 —
 * 그건 DB를 봐야 알 수 있고, 미들웨어는 DB를 왕복하지 않는다.
 *
 * 위조·변조·만료 토큰은 null.
 */
export async function verifySessionToken(
  token: string | undefined | null,
  nowEpochSeconds: number = Math.floor(Date.now() / 1000)
): Promise<SessionClaims | null> {
  if (!token) return null

  const secret = getSecret()
  if (!secret) return null

  const parts = token.split('.')
  if (parts.length !== 4) return null

  const [version, sessionId, expiresRaw, signature] = parts
  if (version !== TOKEN_VERSION) return null
  if (!sessionId || !signature) return null

  const expiresAt = Number(expiresRaw)
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) return null

  const expected = await hmacHex(secret, `${version}.${sessionId}.${expiresRaw}`)
  if (!timingSafeEqual(signature, expected)) return null

  // 서명이 유효해도 만료된 토큰은 거부한다.
  if (expiresAt <= nowEpochSeconds) return null

  return { sessionId, expiresAt }
}

/** 지금부터 TTL 뒤의 만료 시각(epoch 초). */
export function sessionExpiryFromNow(
  ttlSeconds: number = SESSION_TTL_SECONDS,
  nowEpochSeconds: number = Math.floor(Date.now() / 1000)
): number {
  return nowEpochSeconds + ttlSeconds
}
