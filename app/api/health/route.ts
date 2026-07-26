import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { currentEnvironment } from '@/lib/safety-gate'

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

/** 테이블 하나로 마이그레이션 적용 여부를 대표 확인한다. */
async function checkTable(table: string, migration: string): Promise<CheckResult> {
  const supabase = createServiceClient()
  if (!supabase) return { ok: false, detail: 'service role 미구성' }

  const { error } = await supabase.from(table).select('id', { head: true, count: 'exact' })
  if (error) return { ok: false, detail: `${migration} 미적용으로 보임` }

  return { ok: true }
}

export async function GET() {
  const [database, identity, marginScore, taskEngine, employees] = await Promise.all([
    checkDatabase(),
    checkIdentityTables(),
    checkTable('scores', '008_margin_score_v2.sql'),
    checkTable('tasks', '009_task_engine.sql'),
    checkTable('employees', '010_employees.sql'),
  ])

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

  const migrations = { marginScore, taskEngine, employees }

  // ok는 '지금 운영 가능한가'를 뜻한다. 로그인과 DB가 되어야 한다.
  const ok = database.ok && identity.ok && authReady
  // 엔진 마이그레이션은 별도로 보고한다 — 미적용이면 파이프라인·승인·
  // 직원 현황판이 동작하지 않지만 로그인 자체는 된다.
  const enginesReady = marginScore.ok && taskEngine.ok && employees.ok

  return NextResponse.json(
    {
      ok,
      enginesReady,
      environment: currentEnvironment(),
      // 프로덕션이 아니면 외부 부작용 작업이 정책과 무관하게 막힌다.
      environmentBlocksSideEffects: currentEnvironment() !== 'production',
      checkedAt: new Date().toISOString(),
      checks: { database, identity, authReady: { ok: authReady }, ...migrations },
      config,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
