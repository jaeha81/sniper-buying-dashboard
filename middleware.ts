import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  const sessionToken = request.cookies.get('admin_session')?.value
  if (sessionToken === secret) {
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
