import { NextResponse } from 'next/server'
import { getAdminSession, revokeCurrentSession } from '@/lib/admin-auth'
import { clientIpFrom, recordAudit } from '@/lib/audit'

export async function POST(request: Request) {
  // 폐기 전에 주체를 확보한다 — 폐기 후에는 누가 로그아웃했는지 알 수 없다.
  const session = await getAdminSession()
  const cookie = await revokeCurrentSession()

  if (session) {
    await recordAudit({
      actorType: session.role,
      actorId: session.userId,
      action: 'session.logout',
      entityType: 'session',
      entityId: session.sessionId,
      ip: clientIpFrom(request),
      userAgent: request.headers.get('user-agent'),
    })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(cookie.name, cookie.value, cookie.options)
  return response
}
