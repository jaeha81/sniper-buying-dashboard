import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const adminPass = process.env.ADMIN_PASSWORD ?? 'sniper2026'
  const sessionCookie = request.cookies.get('admin_session')

  if (sessionCookie?.value === adminPass) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('redirectTo', request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/admin/:path*'],
}
