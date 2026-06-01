import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { notifyAdmin } from '@/lib/notify'
import { RISKY_AGENT_ACTIONS } from '@/lib/agents'

type TaskMutationAction = 'approve' | 'reject' | 'complete' | 'fail' | 'cancel'

const ACTION_TO_STATUS: Record<TaskMutationAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  complete: 'completed',
  fail: 'failed',
  cancel: 'cancelled',
}

const RISKY_SET = new Set(RISKY_AGENT_ACTIONS)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeApprovedAction(supabase: ReturnType<typeof createServiceClient>, task: Record<string, any>) {
  const { action_type, target_type, target_id, payload } = task
  if (!target_id) return

  if (action_type === 'approve_product' && target_type === 'product') {
    await supabase!.from('products').update({ status: 'active' }).eq('id', target_id)
  } else if (action_type === 'pause_product' && target_type === 'product') {
    await supabase!.from('products').update({ status: 'paused' }).eq('id', target_id)
  } else if (action_type === 'update_price' && target_type === 'product' && payload) {
    const updates: Record<string, unknown> = {}
    if (payload.domesticExpectedPrice !== undefined) updates.domestic_expected_price = payload.domesticExpectedPrice
    if (payload.overseasPrice !== undefined) updates.overseas_price = payload.overseasPrice
    if (payload.totalCost !== undefined) updates.total_cost = payload.totalCost
    if (payload.expectedMargin !== undefined) updates.expected_margin = payload.expectedMargin
    if (payload.marginRate !== undefined) updates.margin_rate = payload.marginRate
    if (Object.keys(updates).length > 0) {
      await supabase!.from('products').update(updates).eq('id', target_id)
    }
  } else if (action_type === 'update_order_status' && target_type === 'order' && payload?.status) {
    await supabase!.from('orders').update({ status: payload.status }).eq('id', target_id)
  }
}

async function requireAdmin() {
  const cookieStore = await cookies()
  return isAdminAuthenticated(cookieStore)
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  const { id } = await params
  const body: { action?: TaskMutationAction; reviewerNote?: string } = await request.json()

  if (!body.action || !(body.action in ACTION_TO_STATUS)) {
    return NextResponse.json({ error: 'A valid action is required.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('agent_tasks')
    .update({
      status: ACTION_TO_STATUS[body.action],
      reviewer_note: body.reviewerNote ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Agent task not found.' }, { status: 404 })
    }
    console.error(`[PUT /api/agent-tasks/${id}]`, error)
    return NextResponse.json({ error: 'Failed to update agent task.' }, { status: 500 })
  }

  // approve 시 action_type에 따라 DB 실제 실행
  if (body.action === 'approve') {
    await executeApprovedAction(supabase, data).catch((err) => {
      console.error(`[approve execution] task=${id}`, err)
    })

    if (RISKY_SET.has(data.action_type)) {
      notifyAdmin(
        `⚡ 위험 액션 승인됨: ${data.title}`,
        'warning',
        { actionType: data.action_type, agentType: data.agent_type, priority: data.priority }
      ).catch(() => {})
    }
  }

  return NextResponse.json({ task: data })
}
