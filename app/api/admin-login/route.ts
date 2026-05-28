import { NextResponse } from 'next/server'
import { getAdminSessionToken } from '@/lib/admin-auth'

export async function POST(request: Request) {
  const { password } = await request.json()
  const adminPass = process.env.ADMIN_PASSWORD

  if (!adminPass) {
    return NextResponse.json({ error: '서버 설정 오류입니다.' }, { status: 500 })
  }

  if (password !== adminPass) {
    return NextResponse.json({ error: '관리자 암호가 올바르지 않습니다.' }, { status: 401 })
  }

  let sessionToken: string
  try {
    sessionToken = getAdminSessionToken()
  } catch {
    return NextResponse.json({ error: '서버 설정 오류입니다.' }, { status: 500 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('admin_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
    sameSite: 'strict',
  })
  return response
}
