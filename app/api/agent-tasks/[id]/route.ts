import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { notifyAdmin } from '@/lib/notify'
import { RISKY_AGENT_ACTIONS } from '@/lib/agents'
import { executeAgentTask, markTaskExecuted } from '@/lib/agent-executor'

type TaskMutationAction = 'approve' | 'reject' | 'complete' | 'fail' | 'cancel'

const ACTION_TO_STATUS: Record<TaskMutationAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  complete: 'completed',
  fail: 'failed',
  cancel: 'cancelled',
}

const RISKY_SET = new Set(RISKY_AGENT_ACTIONS)

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

  // approve 시 공용 실행기로 실제 DB 반영 + 실행 감사 기록
  let executionResult = null
  if (body.action === 'approve') {
    executionResult = await executeAgentTask(supabase, data)
    await markTaskExecuted(supabase, id, 'admin', executionResult, '관리자 승인')

    if (RISKY_SET.has(data.action_type)) {
      notifyAdmin(
        `⚡ 위험 액션 승인됨: ${data.title}${executionResult.ok ? '' : ` (실행 실패: ${executionResult.error})`}`,
        executionResult.ok ? 'warning' : 'critical',
        { actionType: data.action_type, agentType: data.agent_type, priority: data.priority }
      ).catch(() => {})
    }
  }

  return NextResponse.json({ task: data, executionResult })
}
