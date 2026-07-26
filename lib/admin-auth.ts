// 관리자 인증 — 세션 발급·검증·폐기.
//
// 이전 구조: 쿠키 값 === ADMIN_SESSION_SECRET. 쿠키 유출이 곧 시크릿
// 유출이었고 세션 폐기가 불가능했다.
//
// 현재 구조: 쿠키에는 서명된 토큰만 담기고(lib/session.ts), 세션 실체는
// sessions 테이블에 있다. 서명 검증은 미들웨어가 상태 없이 처리하고,
// 서버 라우트는 여기서 DB까지 확인해 폐기·만료를 잡는다.
//
// 비밀번호는 여전히 ADMIN_PASSWORD 환경변수 하나다(1인 운영). 다중
// 사용자로 확장할 때 users 테이블에 password_hash를 추가하면 된다.

import { cookies } from 'next/headers'
import { createServiceClient } from './supabase/server'
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionExpiryFromNow,
  signSessionToken,
  verifySessionToken,
} from './session'

/** 006 마이그레이션이 시드하는 부트스트랩 소유자. */
export const OWNER_USER_ID = '00000000-0000-0000-0000-000000000001'

export interface AdminSession {
  sessionId: string
  userId: string
  role: 'owner' | 'operator' | 'viewer'
  expiresAt: number
}

export interface CookieToSet {
  name: string
  value: string
  options: {
    httpOnly: boolean
    secure: boolean
    sameSite: 'strict'
    path: string
    maxAge: number
  }
}

function cookieOptions(maxAge: number): CookieToSet['options'] {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  }
}

/**
 * 비밀번호를 검증하고 세션을 발급한다.
 * 성공하면 설정할 쿠키를, 실패하면 null을 돌려준다.
 */
export async function createAdminSession(
  password: string,
  meta: { ip?: string | null; userAgent?: string | null } = {}
): Promise<{ cookie: CookieToSet; session: AdminSession } | null> {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return null
  if (password !== expected) return null

  const expiresAt = sessionExpiryFromNow(SESSION_TTL_SECONDS)

  const supabase = createServiceClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: OWNER_USER_ID,
      expires_at: new Date(expiresAt * 1000).toISOString(),
      ip: meta.ip ?? null,
      user_agent: meta.userAgent ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[auth] 세션 생성 실패:', error?.message)
    return null
  }

  const token = await signSessionToken(data.id, expiresAt)
  if (!token) return null

  await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', OWNER_USER_ID)

  return {
    cookie: {
      name: SESSION_COOKIE,
      value: token,
      options: cookieOptions(SESSION_TTL_SECONDS),
    },
    session: {
      sessionId: data.id,
      userId: OWNER_USER_ID,
      role: 'owner',
      expiresAt,
    },
  }
}

/**
 * 현재 요청의 세션을 확인한다. 서명·만료·폐기까지 전부 본다.
 * 인증되지 않았으면 null.
 *
 * 서버 라우트와 서버 컴포넌트에서 쓴다. 미들웨어는 DB를 왕복하지 않으므로
 * 서명 검증만 하는 verifySessionToken()을 직접 쓴다.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  const claims = await verifySessionToken(token)
  if (!claims) return null

  const supabase = createServiceClient()
  if (!supabase) {
    // DB가 없으면 폐기 여부를 확인할 수 없다. 서명만 믿고 통과시키면
    // 폐기된 세션이 살아나므로 거부한다.
    console.error('[auth] Supabase service client 미구성 — 세션 검증 불가')
    return null
  }

  const { data, error } = await supabase
    .from('sessions')
    .select('id, user_id, revoked_at, expires_at, users!inner(role, is_active)')
    .eq('id', claims.sessionId)
    .maybeSingle()

  if (error || !data) return null
  if (data.revoked_at) return null
  if (new Date(data.expires_at).getTime() <= Date.now()) return null

  // Supabase 조인 결과는 배열 또는 단일 객체로 온다.
  const joined = data.users as unknown
  const user = (Array.isArray(joined) ? joined[0] : joined) as
    | { role: AdminSession['role']; is_active: boolean }
    | undefined

  if (!user || !user.is_active) return null

  // 마지막 활동 시각 갱신은 실패해도 무방하다.
  void supabase
    .from('sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', claims.sessionId)
    .then(undefined, () => {})

  return {
    sessionId: data.id,
    userId: data.user_id,
    role: user.role,
    expiresAt: claims.expiresAt,
  }
}

/** 인증 여부만 필요할 때 쓰는 축약형. */
export async function isAdminAuthenticated(): Promise<boolean> {
  return (await getAdminSession()) !== null
}

/** 현재 세션을 폐기하고, 지울 쿠키를 돌려준다. */
export async function revokeCurrentSession(): Promise<CookieToSet> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  const claims = await verifySessionToken(token)

  if (claims) {
    const supabase = createServiceClient()
    if (supabase) {
      const { error } = await supabase
        .from('sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', claims.sessionId)
        .is('revoked_at', null)

      if (error) console.error('[auth] 세션 폐기 실패:', error.message)
    }
  }

  return {
    name: SESSION_COOKIE,
    value: '',
    options: cookieOptions(0),
  }
}
