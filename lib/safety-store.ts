// 안전 정책 로드/저장 — autonomy_settings의 emergency_stop /
// disabled_channels / daily_budget_usd 를 읽고 쓴다.
//
// 010 마이그레이션 미적용 시에는 "가장 보수적인" 값으로 폴백한다.
// 정책을 못 읽었는데 통과시키면 비상정지가 무력화되기 때문이다.

import { createServiceClient } from './supabase/server'
import {
  SIDE_EFFECT_CHANNELS,
  type SafetyPolicy,
  type SideEffectChannel,
} from './safety-gate'

function isChannel(value: unknown): value is SideEffectChannel {
  return typeof value === 'string' && (SIDE_EFFECT_CHANNELS as readonly string[]).includes(value)
}

/**
 * 정책을 읽을 수 없을 때 쓰는 값.
 *
 * emergencyStop을 true로 둔다 — 정책을 모르는 상태에서 외부 부작용을
 * 허용하면 킬스위치가 의미를 잃는다. 마이그레이션이 적용되면 DB 값을 따른다.
 */
export const FAIL_CLOSED_POLICY: SafetyPolicy = {
  emergencyStop: true,
  disabledChannels: SIDE_EFFECT_CHANNELS,
  dailyBudgetUsd: 0,
  spentTodayUsd: 0,
}

export interface LoadedSafetyPolicy {
  policy: SafetyPolicy
  /** 010 마이그레이션이 적용되어 실제 정책을 읽었는지 */
  loaded: boolean
  reason?: string
}

/** 오늘 자율 실행에 쓴 비용을 task_runs에서 합산한다. */
async function spentTodayUsd(
  supabase: NonNullable<ReturnType<typeof createServiceClient>>
): Promise<number> {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('task_runs')
    .select('cost_usd')
    .gte('started_at', since.toISOString())
    .not('cost_usd', 'is', null)

  if (error) return 0

  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0)
}

export async function loadSafetyPolicy(): Promise<LoadedSafetyPolicy> {
  const supabase = createServiceClient()
  if (!supabase) {
    return {
      policy: FAIL_CLOSED_POLICY,
      loaded: false,
      reason: 'Supabase service role이 구성되지 않았습니다.',
    }
  }

  const { data, error } = await supabase
    .from('autonomy_settings')
    .select('emergency_stop, disabled_channels, daily_budget_usd')
    .eq('id', 1)
    .maybeSingle()

  if (error || !data) {
    return {
      policy: FAIL_CLOSED_POLICY,
      loaded: false,
      reason: '010_employees.sql 미적용으로 보입니다. 안전을 위해 모든 부작용 작업을 차단합니다.',
    }
  }

  const raw = Array.isArray(data.disabled_channels) ? data.disabled_channels : []

  return {
    policy: {
      emergencyStop: Boolean(data.emergency_stop),
      disabledChannels: raw.filter(isChannel),
      dailyBudgetUsd: Number(data.daily_budget_usd ?? 0),
      spentTodayUsd: await spentTodayUsd(supabase),
    },
    loaded: true,
  }
}

export interface SafetyPolicyUpdate {
  emergencyStop?: boolean
  disabledChannels?: SideEffectChannel[]
  dailyBudgetUsd?: number
}

export async function saveSafetyPolicy(
  update: SafetyPolicyUpdate
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient()
  if (!supabase) return { ok: false, message: 'Supabase service role이 구성되지 않았습니다.' }

  const patch: Record<string, unknown> = {}

  if (update.emergencyStop !== undefined) patch.emergency_stop = update.emergencyStop

  if (update.disabledChannels !== undefined) {
    const invalid = update.disabledChannels.filter((c) => !isChannel(c))
    if (invalid.length > 0) {
      return { ok: false, message: `알 수 없는 채널: ${invalid.join(', ')}` }
    }
    patch.disabled_channels = update.disabledChannels
  }

  if (update.dailyBudgetUsd !== undefined) {
    if (!Number.isFinite(update.dailyBudgetUsd) || update.dailyBudgetUsd < 0) {
      return { ok: false, message: '일일 비용 한도는 0 이상이어야 합니다.' }
    }
    patch.daily_budget_usd = update.dailyBudgetUsd
  }

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase.from('autonomy_settings').update(patch).eq('id', 1)
  if (error) return { ok: false, message: error.message }

  return { ok: true }
}
