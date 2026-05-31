import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import {
  AGENT_TYPES,
  getAgentTaskPriority,
  requiresApproval,
  type AgentActionType,
  type AgentTaskPriority,
  type AgentTaskStatus,
  type AgentType,
} from '@/lib/agents'

type AgentTaskRow = {
  id: string
  agent_type: AgentType
  action_type: AgentActionType
  status: AgentTaskStatus
  priority: AgentTaskPriority
  title: string
  recommendation: string | null
  target_type: string | null
  target_id: string | null
  requires_approval: boolean
  payload: Record<string, unknown> | null
  reviewer_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string | null
}

type CreateAgentTaskBody = {
  agentType: AgentType
  actionType: AgentActionType
  title: string
  recommendation?: string
  targetType?: string
  targetId?: string
  priority?: AgentTaskPriority
  severity?: 'info' | 'warning' | 'critical'
  confidence?: number
  payload?: Record<string, unknown>
}

function rowToTask(row: AgentTaskRow) {
  return {
    id: row.id,
    agentType: row.agent_type,
    actionType: row.action_type,
    status: row.status,
    priority: row.priority,
    title: row.title,
    recommendation: row.recommendation,
    targetType: row.target_type,
    targetId: row.target_id,
    requiresApproval: row.requires_approval,
    payload: row.payload,
    reviewerNote: row.reviewer_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function requireAdmin() {
  const cookieStore = await cookies()
  return isAdminAuthenticated(cookieStore)
}

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ tasks: [] })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const agentType = searchParams.get('agentType')
  const priority = searchParams.get('priority')

  let query = supabase
    .from('agent_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)
  if (agentType) query = query.eq('agent_type', agentType)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ tasks: [] })
    console.error('[GET /api/agent-tasks]', error)
    return NextResponse.json({ error: 'Failed to load agent tasks.' }, { status: 500 })
  }

  return NextResponse.json({ tasks: (data ?? []).map((row) => rowToTask(row as AgentTaskRow)) })
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  const body: CreateAgentTaskBody = await request.json()

  if (!AGENT_TYPES.includes(body.agentType) || !body.actionType || !body.title) {
    return NextResponse.json(
      { error: 'agentType, actionType, and title are required.' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 503 })
  }

  const priority =
    body.priority ??
    getAgentTaskPriority({
      severity: body.severity,
      confidence: body.confidence,
      isCustomerFacing: body.actionType === 'send_customer_notice',
    })

  const row = {
    agent_type: body.agentType,
    action_type: body.actionType,
    title: body.title,
    recommendation: body.recommendation ?? null,
    target_type: body.targetType ?? null,
    target_id: body.targetId ?? null,
    priority,
    requires_approval: requiresApproval(body.actionType),
    status: 'pending' satisfies AgentTaskStatus,
    payload: body.payload ?? null,
  }

  const { data, error } = await supabase.from('agent_tasks').insert(row).select().single()

  if (error) {
    console.error('[POST /api/agent-tasks]', error)
    return NextResponse.json({ error: 'Failed to create agent task.' }, { status: 500 })
  }

  return NextResponse.json({ task: rowToTask(data as AgentTaskRow) }, { status: 201 })
}
