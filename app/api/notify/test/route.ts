import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { notifyAdmin } from '@/lib/notify'

export async function POST() {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'SLACK_WEBHOOK_URL 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 추가해주세요.' },
      { status: 400 }
    )
  }

  try {
    await notifyAdmin(
      '✅ Slack 알림 연동 테스트 성공!\nSniper Dashboard에서 발송된 테스트 메시지입니다.',
      'info',
      { 시각: new Date().toLocaleString('ko-KR'), 발신: 'Sniper Dashboard Admin' }
    )
    return NextResponse.json({ ok: true, message: 'Slack 테스트 메시지가 발송되었습니다.' })
  } catch (err) {
    console.error('[POST /api/notify/test]', err)
    return NextResponse.json({ error: 'Slack 발송 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
