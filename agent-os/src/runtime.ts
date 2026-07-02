// ============================================================================
// Runtime — 1회 자율 사이클: scan → (reason) → decide → execute → audit.
//
// 기존 app/api/agent-runs/route.ts 의 자율 실행 패스를 데몬판으로 옮긴 것.
// 검증 완료된 lib/ 순수 로직을 그대로 재사용하고, 데몬 컨텍스트(단계·게이트웨이·드라이런)를 더한다.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildAgentAutomationPlan, type ProductAutomationSnapshot } from '../../lib/agent-automation'
import { decideTaskAutonomy } from '../../lib/autonomy'
import { executeAgentTask, markTaskExecuted, type AgentTaskRow } from '../../lib/agent-executor'
import { loadAutonomyPolicy, countAutoActionsLast24h } from '../../lib/autonomy-store'
import type { AgentActionType, AgentTaskPriority } from '../../lib/agents'
import type { AgentOsEnv } from './config/env'
import { GatewayClient } from './model/gateway-client'
import { levelForStage } from './config/autonomy-stages'
import { isAutoActionEnabled } from './config/agents.config'

export interface CycleResult {
  scannedProducts: number
  plannedTasks: number
  autoExecuted: number
  autoFailed: number
  heldForApproval: number
  killSwitch: boolean
  stage: number
  dryRun: boolean
}

export interface RuntimeDeps {
  supabase: SupabaseClient
  env: AgentOsEnv
  gateway: GatewayClient
  log: (msg: string, extra?: Record<string, unknown>) => void
}

export async function runCycle(deps: RuntimeDeps): Promise<CycleResult> {
  const { supabase, env, log } = deps
  const stage = env.autonomyStage

  // 1) 상태 스캔
  const [{ data: products, error: pErr }, { data: orders }, { data: logs }] = await Promise.all([
    supabase.from('products')
      .select('id, name, category, status, margin_rate, sniper_score, risk_level, automation_score, total_cost, domestic_expected_price, created_at')
      .in('status', ['candidate', 'active', 'paused']).limit(500),
    supabase.from('orders')
      .select('id, order_ref, product_name, status, total_price, created_at')
      .in('status', ['pending', 'ordered']).limit(500),
    supabase.from('automation_logs')
      .select('id, scenario_name, status, error_message, started_at')
      .eq('status', 'failed').order('started_at', { ascending: false }).limit(50),
  ])
  if (pErr) throw pErr

  const nowIso = new Date().toISOString()
  const plan = buildAgentAutomationPlan({
    triggerType: 'scheduled',
    nowIso,
    products: (products ?? []).map((p): ProductAutomationSnapshot => ({
      id: p.id, name: p.name, category: p.category, status: p.status,
      marginRate: Number(p.margin_rate), sniperScore: Number(p.sniper_score),
      riskLevel: p.risk_level, automationScore: Number(p.automation_score),
      totalCost: p.total_cost == null ? null : Number(p.total_cost),
      domesticExpectedPrice: p.domestic_expected_price == null ? null : Number(p.domestic_expected_price),
      createdAt: p.created_at,
    })),
    orders: (orders ?? []).map((o) => ({
      id: o.id, orderRef: o.order_ref, productName: o.product_name,
      status: o.status, totalPrice: Number(o.total_price), createdAt: o.created_at,
    })),
    failedAutomationLogs: (logs ?? []).map((l) => ({
      id: l.id, scenarioName: l.scenario_name, status: l.status,
      errorMessage: l.error_message, startedAt: l.started_at,
    })),
  })

  // 2) 정책 로드 (Supabase autonomy_settings 우선, 단계는 레벨 하한으로 참고)
  const { policy } = await loadAutonomyPolicy(supabase as never)
  // 데몬 단계가 정책 레벨보다 보수적이면 데몬 단계를 따른다(안전측).
  const stageLevel = levelForStage(stage)
  const effectiveLevel = mostConservative(policy.autonomyLevel, stageLevel)
  const effectivePolicy = { ...policy, autonomyLevel: effectiveLevel }

  if (policy.killSwitch) {
    log('킬스위치 활성 — 이번 사이클 자율 실행 없음')
  }

  // 3) 결정 → 실행 (신규 태스크만; 중복은 기존 라우트가 담당하나 데몬은 매 틱 신규 계획을 처리)
  let autoActionsLast24h = await countAutoActionsLast24h(supabase as never)
  let autoExecuted = 0, autoFailed = 0, heldForApproval = 0

  for (const t of plan.tasks) {
    const action = t.actionType as AgentActionType
    // 구성 게이트: 이 에이전트/액션이 현재 단계에서 자율 실행 대상인가
    const configOpen = isAutoActionEnabled(t.agentType, action, stage)

    const decision = decideTaskAutonomy(
      { actionType: action, priority: t.priority as AgentTaskPriority, payload: t.payload },
      effectivePolicy,
      { autoActionsLast24h },
    )

    if (configOpen && decision.mode === 'auto_execute') {
      if (env.dryRun) {
        log(`[dryRun] 자율 실행 예정: ${t.title} — ${decision.reason}`)
        autoExecuted += 1
        continue
      }
      // 신규 태스크를 실제 큐에 남기고 실행 (감사 추적 위해 먼저 insert)
      const row = await insertTask(supabase, t)
      if (!row) { heldForApproval += 1; continue }
      const result = await executeAgentTask(supabase as never, row)
      await markTaskExecuted(supabase as never, row.id, 'autonomy', result, decision.reason)
      autoActionsLast24h += 1
      autoExecuted += 1
      if (!result.ok) autoFailed += 1
      log(`${result.ok ? '✅' : '❌'} ${t.title} — ${decision.reason}`)
    } else {
      heldForApproval += 1
    }
  }

  return {
    scannedProducts: products?.length ?? 0,
    plannedTasks: plan.tasks.length,
    autoExecuted, autoFailed, heldForApproval,
    killSwitch: policy.killSwitch, stage, dryRun: env.dryRun,
  }
}

// 정책 레벨 보수성 순위: manual > assisted > autopilot (manual 이 가장 보수적)
function mostConservative(a: string, b: string): 'manual' | 'assisted' | 'autopilot' {
  const order = ['autopilot', 'assisted', 'manual']
  const rank = (x: string) => order.indexOf(x)
  return (rank(a) > rank(b) ? a : b) as 'manual' | 'assisted' | 'autopilot'
}

async function insertTask(supabase: SupabaseClient, t: ReturnType<typeof buildAgentAutomationPlan>['tasks'][number]): Promise<AgentTaskRow | null> {
  const { data, error } = await supabase.from('agent_tasks').insert({
    agent_type: t.agentType, action_type: t.actionType, status: 'pending',
    priority: t.priority, title: t.title, recommendation: t.recommendation,
    target_type: t.targetType, target_id: t.targetId,
    requires_approval: t.requiresApproval, payload: t.payload,
  }).select('id, agent_type, action_type, priority, title, target_type, target_id, payload').single()
  if (error) return null
  return data as AgentTaskRow
}
