import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/approvals — 승인 대기함 (지시서 §6·§14)
//
// 지시서 §2: 결제·환불·법적 판단·대규모 가격 변경 등 비가역 작업은
// 승인 게이트를 통과한다. 이 목록이 그 게이트다.

const VALID_STATUS = ['pending', 'approved', 'rejected', 'expired', 'cancelled'] as const

export async function GET(request: Request) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status') ?? 'pending'
  const limitRaw = Number(searchParams.get('limit') ?? 50)
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50

  if (!(VALID_STATUS as readonly string[]).includes(statusFilter)) {
    return NextResponse.json({ error: 'status 값이 올바르지 않습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 구성되지 않았습니다.', approvals: [] },
      { status: 503 }
    )
  }

  const { data, error } = await supabase
    .from('approvals')
    .select('*')
    .eq('status', statusFilter)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    // 009 미적용이면 여기로 온다. 빈 목록이 아니라 사유를 밝힌다.
    return NextResponse.json(
      {
        error: '승인 목록을 조회할 수 없습니다. 009_task_engine.sql 적용 여부를 확인하세요.',
        detail: error.message,
        approvals: [],
      },
      { status: 503 }
    )
  }

  const approvals = (data ?? []).map((row) => ({
    id: row.id,
    taskId: row.task_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    summary: row.summary,
    payload: row.payload,
    irreversible: Boolean(row.irreversible),
    requestedBy: row.requested_by,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  }))

  return NextResponse.json({
    approvals,
    count: approvals.length,
    dataQuality: 'REAL',
    capturedAt: new Date().toISOString(),
  })
}
