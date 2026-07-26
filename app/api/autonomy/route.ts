import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyAdmin } from '@/lib/notify'
import { AUTONOMY_LEVELS, AUTONOMY_LEVEL_LABELS, type AutonomyPolicy } from '@/lib/autonomy'
import { loadAutonomyPolicy, saveAutonomyPolicy, countAutoActionsLast24h } from '@/lib/autonomy-store'

async function requireAdmin() {
  return isAdminAuthenticated()
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 503 })
  }

  const [{ policy, source }, autoActionsLast24h, recentResult] = await Promise.all([
    loadAutonomyPolicy(supabase),
    countAutoActionsLast24h(supabase),
    supabase
      .from('agent_tasks')
      .select('id, title, action_type, status, decision_reason, executed_at, execution_result')
      .eq('executed_by', 'autonomy')
      .order('executed_at', { ascending: false })
      .limit(10),
  ])

  return NextResponse.json({
    policy,
    source,
    autoActionsLast24h,
    recentAutoActions: recentResult.error ? [] : (recentResult.data ?? []),
  })
}

function parsePolicyUpdates(body: Record<string, unknown>): { updates: Partial<AutonomyPolicy>; error: string | null } {
  const updates: Partial<AutonomyPolicy> = {}

  if (body.autonomyLevel !== undefined) {
    if (!AUTONOMY_LEVELS.includes(body.autonomyLevel as never)) {
      return { updates, error: 'autonomyLevel은 manual | assisted | autopilot 중 하나여야 합니다.' }
    }
    updates.autonomyLevel = body.autonomyLevel as AutonomyPolicy['autonomyLevel']
  }
  if (body.killSwitch !== undefined) {
    if (typeof body.killSwitch !== 'boolean') return { updates, error: 'killSwitch는 boolean이어야 합니다.' }
    updates.killSwitch = body.killSwitch
  }
  if (body.allowCustomerNotice !== undefined) {
    if (typeof body.allowCustomerNotice !== 'boolean') return { updates, error: 'allowCustomerNotice는 boolean이어야 합니다.' }
    updates.allowCustomerNotice = body.allowCustomerNotice
  }

  const numericFields = [
    ['maxDailyAutoActions', 0, 1000],
    ['maxPriceChangePct', 0, 100],
    ['minMarginRate', 0, 100],
    ['minApproveSniperScore', 0, 100],
  ] as const

  for (const [field, min, max] of numericFields) {
    const value = body[field]
    if (value === undefined) continue
    const n = Number(value)
    if (!Number.isFinite(n) || n < min || n > max) {
      return { updates, error: `${field}은(는) ${min}~${max} 범위의 숫자여야 합니다.` }
    }
    updates[field] = n
  }

  return { updates, error: null }
}

export async function PUT(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'JSON body가 필요합니다.' }, { status: 400 })
  }

  const { updates, error: validationError } = parsePolicyUpdates(body as Record<string, unknown>)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const { error: saveError } = await saveAutonomyPolicy(supabase, updates)
  if (saveError) {
    console.error('[PUT /api/autonomy]', saveError)
    return NextResponse.json(
      { error: '설정 저장에 실패했습니다. 005_autonomy_engine.sql 마이그레이션이 적용됐는지 확인하세요.' },
      { status: 500 }
    )
  }

  // 자율 레벨 변경/킬스위치는 운영에 중대한 변화 — Slack 알림
  if (updates.killSwitch === true) {
    notifyAdmin('🛑 자율 실행 킬스위치 활성화 — 모든 자율 액션이 중단됩니다.', 'critical').catch(() => {})
  } else if (updates.autonomyLevel !== undefined) {
    notifyAdmin(
      `🤖 자율 레벨 변경: ${AUTONOMY_LEVEL_LABELS[updates.autonomyLevel]}`,
      updates.autonomyLevel === 'autopilot' ? 'warning' : 'info'
    ).catch(() => {})
  }

  const { policy, source } = await loadAutonomyPolicy(supabase)
  return NextResponse.json({ policy, source })
}
