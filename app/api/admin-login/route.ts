import { NextResponse } from 'next/server'
import { createAdminSession } from '@/lib/admin-auth'
import { clientIpFrom, recordAudit } from '@/lib/audit'

export async function POST(request: Request) {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: '서버 설정 오류입니다.' }, { status: 500 })
  }

  let password: unknown
  try {
    ;({ password } = await request.json())
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  if (typeof password !== 'string') {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const ip = clientIpFrom(request)
  const userAgent = request.headers.get('user-agent')

  const result = await createAdminSession(password, { ip, userAgent })

  if (!result) {
    await recordAudit({
      actorType: 'anonymous',
      action: 'session.login_failed',
      reason: '관리자 암호 불일치 또는 세션 발급 실패',
      ip,
      userAgent,
    })
    return NextResponse.json({ error: '관리자 암호가 올바르지 않습니다.' }, { status: 401 })
  }

  await recordAudit({
    actorType: 'owner',
    actorId: result.session.userId,
    action: 'session.login',
    entityType: 'session',
    entityId: result.session.sessionId,
    ip,
    userAgent,
  })

  const response = NextResponse.json({ success: true })
  response.cookies.set(result.cookie.name, result.cookie.value, result.cookie.options)
  return response
}
