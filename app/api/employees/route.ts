import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { employeeRows } from '@/lib/task-store'
import {
  EMPLOYEES,
  deriveEmployeeState,
  manualInterventionRate,
  successRate,
  type EmployeeCode,
  type EmployeeWorkload,
} from '@/lib/employees'

// GET /api/employees — 직원 현황판 (지시서 §6)
//
// "직원 상태, 현재 업무, 큐, 성공률, 비용, 오류가 보인다" — 지시서 §18
// 완료 기준. 부하는 tasks에서 실시간 집계한다. 정적 카드가 아니다
// (지시서 §19 "실제 Task와 연결되지 않은 정적 직원 카드" 금지).

export const dynamic = 'force-dynamic'

interface TaskAggregateRow {
  assigned_employee_id: string | null
  status: string
}

function emptyWorkload(): EmployeeWorkload {
  return {
    running: 0,
    queued: 0,
    waitingApproval: 0,
    retrying: 0,
    deadLetter: 0,
    paused: false,
    offline: false,
  }
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 구성되지 않았습니다.', employees: [] },
      { status: 503 }
    )
  }

  const rows = await employeeRows(supabase)

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error: '직원 레지스트리가 비어 있습니다. 010_employees.sql 적용 여부를 확인하세요.',
        employees: [],
      },
      { status: 503 }
    )
  }

  // 직원 UUID ↔ code 매핑. tasks는 UUID로 참조한다.
  const { data: idRows } = await supabase.from('employees').select('id, code')
  const codeById = new Map<string, EmployeeCode>(
    (idRows ?? []).map((r) => [r.id as string, r.code as EmployeeCode])
  )

  // 진행 중인 태스크만 집계한다. 종료된 것은 부하가 아니다.
  const { data: taskRows } = await supabase
    .from('tasks')
    .select('assigned_employee_id, status')
    .in('status', ['queued', 'scheduled', 'running', 'needs_approval', 'dead_letter'])

  const workloads = new Map<EmployeeCode, EmployeeWorkload>()
  let unassignedCount = 0

  for (const row of (taskRows ?? []) as TaskAggregateRow[]) {
    if (!row.assigned_employee_id) {
      unassignedCount += 1
      continue
    }

    const code = codeById.get(row.assigned_employee_id)
    if (!code) continue

    const w = workloads.get(code) ?? emptyWorkload()

    if (row.status === 'running') w.running += 1
    else if (row.status === 'queued') w.queued += 1
    // scheduled는 백오프 재시도 대기 상태다.
    else if (row.status === 'scheduled') w.retrying += 1
    else if (row.status === 'needs_approval') w.waitingApproval += 1
    else if (row.status === 'dead_letter') w.deadLetter += 1

    workloads.set(code, w)
  }

  const employees = rows.map((row) => {
    const workload: EmployeeWorkload = {
      ...(workloads.get(row.code) ?? emptyWorkload()),
      paused: row.paused,
      offline: row.offline,
    }

    const performance = {
      totalRuns: row.totalRuns,
      successRuns: row.successRuns,
      manualInterventions: row.manualInterventions,
      costUsd: row.costUsd,
    }

    return {
      code: row.code,
      name: row.name,
      responsibility: row.responsibility,
      state: deriveEmployeeState(workload),
      workload: {
        running: workload.running,
        queued: workload.queued,
        waitingApproval: workload.waitingApproval,
        retrying: workload.retrying,
        deadLetter: workload.deadLetter,
      },
      blockedReason: row.pausedReason,
      performance: {
        totalRuns: row.totalRuns,
        // 이력이 없으면 null. 0%로 보내면 화면에서 실패한 것처럼 보인다.
        successRate: successRate(performance),
        manualInterventionRate: manualInterventionRate(performance),
        costUsd: row.costUsd,
        contributedProfitKrw: row.contributedProfitKrw,
      },
      tools: EMPLOYEES[row.code]?.tools ?? [],
      lastActiveAt: row.lastActiveAt,
    }
  })

  return NextResponse.json({
    employees,
    unassignedTasks: unassignedCount,
    dataQuality: 'REAL',
    capturedAt: new Date().toISOString(),
  })
}
