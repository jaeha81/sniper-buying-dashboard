// Make.com 웹훅 인증 — 지시서 §12.
//
// 기존 lib/automation-auth.ts는 정적 공유 시크릿을 헤더에서 꺼내 문자열
// 동등 비교만 했다. 시크릿이 한 번 로그·프록시에 노출되면 누구든 무제한
// 재사용할 수 있고, 같은 요청을 반복 전송하는 replay를 막을 방법이 없었다.
//
// 이제 요청 본문에 서명을 걸고, 타임스탬프로 유효창을 제한하고, nonce로
// 재사용을 막는다.
//
//   X-Sniper-Timestamp: <epoch 초>
//   X-Sniper-Nonce:     <임의 문자열>
//   X-Sniper-Signature: sha256=<HMAC(`${timestamp}.${nonce}.${body}`)>
//
// Web Crypto만 쓴다 — Edge·Node 런타임 공용.

export const SIGNATURE_HEADER = 'x-sniper-signature'
export const TIMESTAMP_HEADER = 'x-sniper-timestamp'
export const NONCE_HEADER = 'x-sniper-nonce'

/** 이 초를 벗어난 타임스탬프는 거부한다. 시계 오차와 전송 지연을 감안한 폭. */
export const TIMESTAMP_TOLERANCE_SECONDS = 300 // 5분

const encoder = new TextEncoder()

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 서명 대상 문자열. 순서와 구분자가 양쪽에서 정확히 같아야 한다. */
export function signaturePayload(timestamp: string, nonce: string, body: string): string {
  return `${timestamp}.${nonce}.${body}`
}

/** 서명을 만든다. Make.com 시나리오 설정과 테스트에서 쓴다. */
export async function signWebhook(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string
): Promise<string> {
  const hex = await hmacHex(secret, signaturePayload(timestamp, nonce, body))
  return `sha256=${hex}`
}

export type WebhookRejectReason =
  | 'secret_not_configured'
  | 'missing_headers'
  | 'timestamp_invalid'
  | 'timestamp_expired'
  | 'nonce_replayed'
  | 'signature_mismatch'

export type WebhookVerification =
  | { ok: true; nonce: string; timestamp: number }
  | { ok: false; reason: WebhookRejectReason; message: string }

/**
 * nonce 저장소. 이미 본 nonce면 true를 반환해야 한다.
 *
 * 인터페이스로 분리한 이유: 순수 검증 로직을 테스트할 때 인메모리 구현을
 * 쓰고, 운영에서는 DB나 KV를 쓴다.
 */
export interface NonceStore {
  /** 처음 본 nonce면 기록하고 false, 이미 있으면 true */
  seen(nonce: string, expiresAtEpochSeconds: number): Promise<boolean>
}

/** 테스트·단일 인스턴스용 인메모리 구현. 만료된 항목은 조회 시 정리한다. */
export class InMemoryNonceStore implements NonceStore {
  private readonly entries = new Map<string, number>()

  async seen(nonce: string, expiresAtEpochSeconds: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000)

    // Array.from으로 감싼다 — tsconfig 타깃에서 Map 직접 순회가 안 되고,
    // 순회 중 delete를 하므로 스냅샷을 뜨는 편이 안전하다.
    for (const [key, exp] of Array.from(this.entries.entries())) {
      if (exp <= now) this.entries.delete(key)
    }

    if (this.entries.has(nonce)) return true

    this.entries.set(nonce, expiresAtEpochSeconds)
    return false
  }
}

/**
 * 웹훅 요청을 검증한다.
 *
 * body는 호출부가 미리 읽어서 넘긴다 — Request 본문은 한 번만 읽을 수
 * 있어서, 검증 후 라우트가 다시 파싱해야 하기 때문이다.
 */
export async function verifyWebhook(
  headers: Headers,
  body: string,
  store: NonceStore,
  nowEpochSeconds: number = Math.floor(Date.now() / 1000)
): Promise<WebhookVerification> {
  const secret = process.env.AUTOMATION_WEBHOOK_SECRET
  if (!secret || secret.length < 16) {
    return {
      ok: false,
      reason: 'secret_not_configured',
      message: 'AUTOMATION_WEBHOOK_SECRET이 설정되지 않았거나 너무 짧습니다.',
    }
  }

  const signature = headers.get(SIGNATURE_HEADER)
  const timestampRaw = headers.get(TIMESTAMP_HEADER)
  const nonce = headers.get(NONCE_HEADER)

  if (!signature || !timestampRaw || !nonce) {
    return {
      ok: false,
      reason: 'missing_headers',
      message: `${SIGNATURE_HEADER}, ${TIMESTAMP_HEADER}, ${NONCE_HEADER} 헤더가 모두 필요합니다.`,
    }
  }

  const timestamp = Number(timestampRaw)
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    return { ok: false, reason: 'timestamp_invalid', message: '타임스탬프 형식이 잘못되었습니다.' }
  }

  // 과거·미래 양방향으로 제한한다. 미래를 허용하면 서명을 미리 만들어
  // 오래 보관해 두고 쓸 수 있다.
  if (Math.abs(nowEpochSeconds - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    return {
      ok: false,
      reason: 'timestamp_expired',
      message: `타임스탬프가 허용 범위(±${TIMESTAMP_TOLERANCE_SECONDS}초)를 벗어났습니다.`,
    }
  }

  // 서명을 먼저 확인한다. 서명이 틀린 요청의 nonce를 저장소에 남기면
  // 공격자가 임의 nonce로 저장소를 채울 수 있다.
  const expected = await signWebhook(secret, timestampRaw, nonce, body)
  if (!timingSafeEqual(signature, expected)) {
    return { ok: false, reason: 'signature_mismatch', message: '서명이 일치하지 않습니다.' }
  }

  const replayed = await store.seen(nonce, timestamp + TIMESTAMP_TOLERANCE_SECONDS)
  if (replayed) {
    return {
      ok: false,
      reason: 'nonce_replayed',
      message: '이미 처리된 요청입니다(nonce 중복).',
    }
  }

  return { ok: true, nonce, timestamp }
}
