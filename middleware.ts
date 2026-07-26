import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

// 지시서 §16: 모든 /app·/api는 인증을 통과해야 한다.
//
// 이전에는 matcher가 `/admin/:path*` 하나뿐이라 API 라우트가 엣지에서
// 전혀 보호되지 않았고, 각 라우트가 개별 검사를 빠뜨리면 그대로 열렸다.
// 이제 미들웨어가 기본 차단하고 아래 허용 목록만 통과시킨다.
//
// 미들웨어는 DB를 왕복하지 않는다. 서명·만료만 상태 없이 검증하고,
// 폐기 여부는 라우트가 lib/admin-auth.ts에서 확인한다.

/** 인증 없이 열어 두는 API 경로 (정확히 일치). */
const PUBLIC_API_EXACT = new Set([
  '/api/admin-login',
  '/api/admin-logout',
  '/api/health',
  '/api/exchange-rate',
])

/**
 * 자동화 시크릿(Make.com 등)으로 호출되는 경로.
 * 쿠키가 없어도 통과시키되, 시크릿 검증은 각 라우트가 책임진다
 * (lib/automation-auth.ts). 미들웨어에서 시크릿을 비교하지 않는 이유는
 * 검증 로직이 한 곳에만 있어야 나중에 HMAC 서명으로 바꾸기 쉽기 때문이다.
 */
const AUTOMATION_PREFIXES = [
  '/api/agent-runs',
  '/api/automation-logs',
  '/api/discover/process',
]

/**
 * 레거시 스토어(고객용)가 쓰는 경로.
 * ENABLE_LEGACY_STORE=false면 이 예외가 사라져 인증이 필요해진다.
 *
 * 기본값을 true로 둔 것은 의도적이다 — 지시서는 최종적으로 스토어를
 * 차단하라고 하지만, 진행 중인 실주문·고객 유무를 확인받기 전에
 * 공개 URL을 끊으면 실제 매출이 사라질 수 있다. 확인되면 false로 바꾼다.
 */
function legacyStoreEnabled(): boolean {
  return process.env.ENABLE_LEGACY_STORE !== 'false'
}

const LEGACY_STORE_API_PREFIXES = ['/api/orders', '/api/products']

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_API_EXACT.has(pathname)) return true
  if (AUTOMATION_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true

  if (legacyStoreEnabled()) {
    if (LEGACY_STORE_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return true
    }
  }

  return false
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const claims = await verifySessionToken(token)

  if (claims) {
    return NextResponse.next()
  }

  // API는 리다이렉트하면 클라이언트가 HTML을 JSON으로 파싱하려 든다.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: '인증이 필요합니다.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  url.searchParams.set('redirectTo', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/admin/:path*', '/app/:path*', '/api/:path*'],
}
