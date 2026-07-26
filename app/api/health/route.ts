import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 지시서 §14: GET /api/health
//
// 인증 없이 열려 있다(미들웨어 허용 목록). 그래서 어떤 값이 설정됐는지는
// 절대 노출하지 않고, 설정 여부(boolean)와 DB 도달 가능 여부만 알린다.

export const dynamic = 'force-dynamic'

interface CheckResult {
  ok: boolean
  detail?: string
}

async function checkDatabase(): Promise<CheckResult> {
  const supabase = createServiceClient()
  if (!supabase) return { ok: false, detail: 'service role 미구성' }

  const { error } = await supabase.from('products').select('id', { head: true, count: 'exact' })
  if (error) return { ok: false, detail: error.message }

  return { ok: true }
}

/** 006 마이그레이션 적용 여부 — 미적용이면 로그인이 동작하지 않는다. */
async function checkIdentityTables(): Promise<CheckResult> {
  const supabase = createServiceClient()
  if (!supabase) return { ok: false, detail: 'service role 미구성' }

  const { error } = await supabase.from('sessions').select('id', { head: true, count: 'exact' })
  if (error) return { ok: false, detail: '006_identity.sql 미적용으로 보임' }

  return { ok: true }
}

export async function GET() {
  const [database, identity] = await Promise.all([checkDatabase(), checkIdentityTables()])

  const config = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    adminPassword: Boolean(process.env.ADMIN_PASSWORD),
    adminSessionSecret: Boolean(process.env.ADMIN_SESSION_SECRET),
    firecrawl: Boolean(process.env.FIRECRAWL_API_KEY),
    openRouter: Boolean(process.env.OPENROUTER_API_KEY),
    automationSecret: Boolean(process.env.AUTOMATION_WEBHOOK_SECRET),
    slackWebhook: Boolean(process.env.SLACK_WEBHOOK_URL),
  }

  // 로그인이 성립하려면 반드시 있어야 하는 것들.
  const authReady =
    config.supabaseUrl && config.supabaseServiceRole && config.adminPassword && config.adminSessionSecret

  const ok = database.ok && identity.ok && authReady

  return NextResponse.json(
    {
      ok,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
      checkedAt: new Date().toISOString(),
      checks: { database, identity, authReady: { ok: authReady } },
      config,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
