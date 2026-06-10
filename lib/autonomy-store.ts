// 자율성 정책 저장소 — autonomy_settings 싱글톤 행을 읽고 쓴다.
// 마이그레이션(005) 미적용 시 안전하게 수동 모드로 폴백한다.

import type { createServiceClient } from './supabase/server'
import {
  AUTONOMY_LEVELS,
  DEFAULT_AUTONOMY_POLICY,
  type AutonomyLevel,
  type AutonomyPolicy,
} from './autonomy'

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>

export type AutonomyPolicySource = 'supabase' | 'default_manual'

export interface LoadedAutonomyPolicy {
  policy: AutonomyPolicy
  source: AutonomyPolicySource
}

type SettingsRow = {
  autonomy_level: string
  kill_switch: boolean
  max_daily_auto_actions: number
  max_price_change_pct: number | string
  min_margin_rate: number | string
  min_approve_sniper_score: number
  allow_customer_notice: boolean
}

function isAutonomyLevel(value: unknown): value is AutonomyLevel {
  return AUTONOMY_LEVELS.includes(value as AutonomyLevel)
}

export async function loadAutonomyPolicy(supabase: ServiceClient): Promise<LoadedAutonomyPolicy> {
  const { data, error } = await supabase
    .from('autonomy_settings')
    .select('autonomy_level, kill_switch, max_daily_auto_actions, max_price_change_pct, min_margin_rate, min_approve_sniper_score, allow_customer_notice')
    .eq('id', 1)
    .maybeSingle()

  if (error || !data) {
    // 테이블 미생성 등 — 자율 실행이 일어나지 않도록 수동 모드 폴백
    return {
      policy: { ...DEFAULT_AUTONOMY_POLICY, autonomyLevel: 'manual' },
      source: 'default_manual',
    }
  }

  const row = data as SettingsRow
  return {
    policy: {
      autonomyLevel: isAutonomyLevel(row.autonomy_level) ? row.autonomy_level : 'manual',
      killSwitch: Boolean(row.kill_switch),
      maxDailyAutoActions: Number(row.max_daily_auto_actions),
      maxPriceChangePct: Number(row.max_price_change_pct),
      minMarginRate: Number(row.min_margin_rate),
      minApproveSniperScore: Number(row.min_approve_sniper_score),
      allowCustomerNotice: Boolean(row.allow_customer_notice),
    },
    source: 'supabase',
  }
}

export async function saveAutonomyPolicy(
  supabase: ServiceClient,
  updates: Partial<AutonomyPolicy>
): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = {}
  if (updates.autonomyLevel !== undefined) row.autonomy_level = updates.autonomyLevel
  if (updates.killSwitch !== undefined) row.kill_switch = updates.killSwitch
  if (updates.maxDailyAutoActions !== undefined) row.max_daily_auto_actions = updates.maxDailyAutoActions
  if (updates.maxPriceChangePct !== undefined) row.max_price_change_pct = updates.maxPriceChangePct
  if (updates.minMarginRate !== undefined) row.min_margin_rate = updates.minMarginRate
  if (updates.minApproveSniperScore !== undefined) row.min_approve_sniper_score = updates.minApproveSniperScore
  if (updates.allowCustomerNotice !== undefined) row.allow_customer_notice = updates.allowCustomerNotice

  if (Object.keys(row).length === 0) return { error: null }

  const { error } = await supabase
    .from('autonomy_settings')
    .upsert({ id: 1, ...row }, { onConflict: 'id' })
  return { error: error ? error.message : null }
}

/** 최근 24시간 동안 autonomy가 실행한 액션 수 (일일 한도 가드레일용) */
export async function countAutoActionsLast24h(supabase: ServiceClient): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('agent_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('executed_by', 'autonomy')
    .gte('executed_at', since)

  if (error) return 0
  return count ?? 0
}
