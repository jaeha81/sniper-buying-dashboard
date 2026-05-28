import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { password } = await request.json()
  const adminPass = process.env.ADMIN_PASSWORD ?? 'sniper2026'

  if (password !== adminPass) {
    return NextResponse.json({ error: '관리자 암호가 올바르지 않습니다.' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('admin_session', adminPass, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
    sameSite: 'strict',
  })
  return response
}
