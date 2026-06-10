// 에이전트 태스크 실행기 — 승인(관리자/자율)된 태스크를 실제 DB 변경으로 반영한다.
// 관리자 승인 라우트와 자율 실행 루프가 공유하는 단일 실행 경로.

import type { createServiceClient } from './supabase/server'
import { notifyAdmin } from './notify'

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>

export interface AgentTaskRow {
  id: string
  agent_type: string
  action_type: string
  priority: string
  title: string
  target_type: string | null
  target_id: string | null
  payload: Record<string, unknown> | null
}

export interface ExecutionResult {
  ok: boolean
  action: string
  detail?: Record<string, unknown>
  error?: string
}

const ORDER_STATUSES = ['pending', 'ordered', 'shipping', 'delivered', 'cancelled'] as const

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function executeAgentTask(
  supabase: ServiceClient,
  task: AgentTaskRow
): Promise<ExecutionResult> {
  const { action_type, target_type, target_id } = task
  const payload = task.payload ?? {}

  try {
    switch (action_type) {
      case 'approve_product': {
        if (target_type !== 'product' || !target_id) {
          return { ok: false, action: action_type, error: '상품 타깃이 없습니다.' }
        }
        const { error } = await supabase
          .from('products')
          .update({ status: 'active' })
          .eq('id', target_id)
        if (error) throw error
        return { ok: true, action: action_type, detail: { productId: target_id, status: 'active' } }
      }

      case 'pause_product': {
        if (target_type !== 'product' || !target_id) {
          return { ok: false, action: action_type, error: '상품 타깃이 없습니다.' }
        }
        const { error } = await supabase
          .from('products')
          .update({ status: 'paused' })
          .eq('id', target_id)
        if (error) throw error
        return { ok: true, action: action_type, detail: { productId: target_id, status: 'paused' } }
      }

      case 'update_price': {
        if (target_type !== 'product' || !target_id) {
          return { ok: false, action: action_type, error: '상품 타깃이 없습니다.' }
        }
        const updates: Record<string, unknown> = {}
        const domesticExpectedPrice = asNumber(payload.domesticExpectedPrice)
        const overseasPrice = asNumber(payload.overseasPrice)
        const totalCost = asNumber(payload.totalCost)
        const expectedMargin = asNumber(payload.expectedMargin)
        const marginRate = asNumber(payload.marginRate)
        if (domesticExpectedPrice !== null) updates.domestic_expected_price = domesticExpectedPrice
        if (overseasPrice !== null) updates.overseas_price = overseasPrice
        if (totalCost !== null) updates.total_cost = totalCost
        if (expectedMargin !== null) updates.expected_margin = expectedMargin
        if (marginRate !== null) updates.margin_rate = marginRate
        if (Object.keys(updates).length === 0) {
          return { ok: false, action: action_type, error: '적용할 가격 필드가 payload에 없습니다.' }
        }
        const { error } = await supabase.from('products').update(updates).eq('id', target_id)
        if (error) throw error
        return { ok: true, action: action_type, detail: { productId: target_id, updates } }
      }

      case 'update_order_status': {
        if (target_type !== 'order' || !target_id) {
          return { ok: false, action: action_type, error: '주문 타깃이 없습니다.' }
        }
        const nextStatus = payload.nextStatus ?? payload.status
        if (typeof nextStatus !== 'string' || !ORDER_STATUSES.includes(nextStatus as never)) {
          return { ok: false, action: action_type, error: '유효한 주문 상태가 payload에 없습니다.' }
        }
        const { error } = await supabase
          .from('orders')
          .update({ status: nextStatus })
          .eq('id', target_id)
        if (error) throw error
        return { ok: true, action: action_type, detail: { orderId: target_id, status: nextStatus } }
      }

      case 'send_customer_notice': {
        // 발송 채널(SMS/카카오) 미연동 — Slack 기록 + 자동화 로그로 발송 요청을 남긴다.
        const message = typeof payload.message === 'string' ? payload.message : task.title
        await supabase.from('automation_logs').insert({
          scenario_name: 'customer_notice_dispatch',
          trigger_type: 'agent_task',
          status: 'success',
          records_processed: 1,
          payload: { taskId: task.id, targetType: target_type, targetId: target_id, message },
          completed_at: new Date().toISOString(),
        })
        await notifyAdmin(`📨 고객 알림 발송: ${message}`, 'info', {
          targetType: target_type ?? '-',
          targetId: target_id ?? '-',
        })
        return { ok: true, action: action_type, detail: { message } }
      }

      // 점검·검토성 액션: DB 변경 없이 확인 처리로 종결
      case 'review_candidate':
      case 'inspect_risk':
      case 'review_automation_failure':
        return { ok: true, action: action_type, detail: { acknowledged: true } }

      default:
        return { ok: false, action: action_type, error: `지원하지 않는 액션: ${action_type}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, action: action_type, error: message }
  }
}

/** 실행 결과를 agent_tasks 감사 컬럼에 기록한다. */
export async function markTaskExecuted(
  supabase: ServiceClient,
  taskId: string,
  executedBy: 'admin' | 'autonomy',
  result: ExecutionResult,
  decisionReason?: string
): Promise<void> {
  const { error } = await supabase
    .from('agent_tasks')
    .update({
      status: result.ok ? 'completed' : 'failed',
      auto_approved: executedBy === 'autonomy',
      decision_reason: decisionReason ?? null,
      executed_by: executedBy,
      executed_at: new Date().toISOString(),
      execution_result: result,
    })
    .eq('id', taskId)
  if (error) {
    console.error(`[markTaskExecuted] task=${taskId}`, error)
  }
}
