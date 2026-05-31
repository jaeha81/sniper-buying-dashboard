import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'

type TaskMutationAction = 'approve' | 'reject' | 'complete' | 'fail' | 'cancel'

const ACTION_TO_STATUS: Record<TaskMutationAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  complete: 'completed',
  fail: 'failed',
  cancel: 'cancelled',
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

  return NextResponse.json({ task: data })
}
