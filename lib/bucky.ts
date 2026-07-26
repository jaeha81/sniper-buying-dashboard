// Bucky OS — 총괄 본부장. 지시서 §4.
//
// Bucky는 챗봇이 아니다. 직원들의 산출물을 받아 근거·신뢰도·상충을 검수하고
// 구조화된 판정을 내리는 오케스트레이션 레이어다.
//
// 하는 일:
//   1. 우선순위·의존성을 반영해 Task를 계획한다
//   2. 권한·부하·성공률을 보고 직원에게 배정한다
//   3. 직원 결과의 상충을 잡아낸다
//   4. recommend | review | reject | pause 판정을 낸다
//   5. 하드블록·예산 초과·데이터 부족을 재하님에게 상신한다
//
// 순수 함수다. DB도 LLM도 호출하지 않는다 — 판정 규칙이 테스트 가능해야
// 하고, 같은 입력이면 항상 같은 판정이 나와야 하기 때문이다.

import {
  EMPLOYEES,
  employeeForTaskType,
  successRate,
  type EmployeeCode,
  type EmployeeDefinition,
  type EmployeePerformance,
  type EmployeeWorkload,
} from './employees'
import type { HardBlock, ScoreResultV2 } from './score-engine'
import type { MarginResultV2 } from './margin-engine'

// ─── 판정 (지시서 §4 JSON 스키마) ─────────────────────────────

export type BuckyVerdict = 'recommend' | 'review' | 'reject' | 'pause'
export type BuckyPriority = 'P0' | 'P1' | 'P2' | 'P3'

export interface BuckyConflict {
  /** 상충한 직원들 */
  employees: EmployeeCode[]
  field: string
  detail: string
}

export interface BuckyNextAction {
  taskType: string
  assignedEmployee: EmployeeCode | null
  reason: string
  requiresApproval: boolean
}

export interface BuckyDecision {
  productId: string
  verdict: BuckyVerdict
  priority: BuckyPriority
  sniperScore: number
  confidence: number
  expectedNetMarginPct: number
  expectedProfitKrw: number
  hardBlocks: HardBlock[]
  reasons: string[]
  conflicts: BuckyConflict[]
  nextActions: BuckyNextAction[]
  requiresOwnerApproval: boolean
  evidenceRefs: string[]
}

// ─── 직원 산출물 ──────────────────────────────────────────────

export interface EmployeeReport {
  employee: EmployeeCode
  /** 이 직원이 낸 결론 요약 */
  summary: string
  /** 0-1 */
  confidence: number
  /** 근거 참조 (URL, 레코드 ID 등) */
  evidenceRefs: string[]
  /**
   * 직원이 판단한 필드값.
   * 서로 다른 직원이 같은 필드에 다른 값을 내면 상충으로 잡는다.
   */
  claims?: Record<string, number | string | boolean>
  /** 직원이 작업을 완료하지 못했으면 이유 */
  blockedReason?: string | null
}

export interface BuckyInput {
  productId: string
  score: ScoreResultV2
  margin: MarginResultV2
  reports: EmployeeReport[]
  /** 오늘 이미 쓴 실행 비용 (USD) */
  spentTodayUsd?: number
  /** 일일 실행 비용 한도 (USD). 0 이하면 한도 없음. */
  dailyBudgetUsd?: number
  /** 전역 비상정지 상태 */
  emergencyStop?: boolean
}

// ─── 상충 검출 ────────────────────────────────────────────────

/**
 * 여러 직원이 같은 필드에 다른 값을 주장하면 상충으로 본다.
 *
 * 숫자는 상대 오차 10%까지 같은 값으로 본다 — 시장분석과 마진 담당이
 * 수요 점수를 3.0과 3.2로 낸 걸 상충이라 부르면 노이즈만 늘어난다.
 */
export const NUMERIC_CONFLICT_TOLERANCE = 0.1

export function detectConflicts(reports: EmployeeReport[]): BuckyConflict[] {
  type Claim = { employee: EmployeeCode; value: number | string | boolean }
  const byField = new Map<string, Claim[]>()

  for (const report of reports) {
    for (const [field, value] of Object.entries(report.claims ?? {})) {
      const list = byField.get(field) ?? []
      list.push({ employee: report.employee, value })
      byField.set(field, list)
    }
  }

  const conflicts: BuckyConflict[] = []

  // Array.from으로 감싼다 — 이 프로젝트 tsconfig 타깃에서는 Map을 직접
  // 순회할 수 없다(downlevelIteration 미설정).
  for (const [field, entries] of Array.from(byField.entries())) {
    if (entries.length < 2) continue

    const numeric = entries.every((e) => typeof e.value === 'number')

    if (numeric) {
      const values = entries.map((e) => e.value as number)
      const min = Math.min(...values)
      const max = Math.max(...values)
      const scale = Math.max(Math.abs(min), Math.abs(max))

      // 둘 다 0이면 상충이 아니다.
      if (scale === 0) continue
      if ((max - min) / scale <= NUMERIC_CONFLICT_TOLERANCE) continue

      conflicts.push({
        employees: entries.map((e) => e.employee),
        field,
        detail: `${field} 값이 어긋납니다: ${entries
          .map((e) => `${EMPLOYEES[e.employee].name}=${e.value}`)
          .join(', ')}`,
      })
      continue
    }

    const distinct = new Set(entries.map((e) => String(e.value)))
    if (distinct.size <= 1) continue

    conflicts.push({
      employees: entries.map((e) => e.employee),
      field,
      detail: `${field} 판단이 갈립니다: ${entries
        .map((e) => `${EMPLOYEES[e.employee].name}=${e.value}`)
        .join(', ')}`,
    })
  }

  return conflicts
}

// ─── 우선순위 ─────────────────────────────────────────────────

export function derivePriority(input: {
  hardBlockCount: number
  expectedProfitKrw: number
  netMarginPct: number
  score: number
}): BuckyPriority {
  // 손실이 나는 건 최우선으로 막는다.
  if (input.expectedProfitKrw < 0) return 'P0'
  // 하드블록은 사람이 빨리 봐야 한다.
  if (input.hardBlockCount > 0) return 'P1'
  if (input.score >= 85 && input.netMarginPct >= 25) return 'P1'
  if (input.score >= 70) return 'P2'
  return 'P3'
}

// ─── 판정 ─────────────────────────────────────────────────────

/**
 * 지시서 §4의 판정을 낸다.
 *
 * 판정 우선순위:
 *   1. 비상정지 → pause (모든 것 위에)
 *   2. 예산 초과 → pause
 *   3. 하드블록 → reject (점수 무관)
 *   4. 직원이 막힘 / 상충 → review
 *   5. 점수 기준 충족 → recommend
 *   6. 그 외 → review
 */
export function decide(input: BuckyInput): BuckyDecision {
  const { productId, score, margin, reports } = input

  const conflicts = detectConflicts(reports)
  const blockedReports = reports.filter((r) => r.blockedReason)

  // 직원 신뢰도의 최솟값을 함께 본다. 한 직원이라도 근거가 약하면
  // 전체 판단을 그만큼만 믿는다.
  const reportConfidences = reports.map((r) => r.confidence)
  const minReportConfidence = reportConfidences.length > 0 ? Math.min(...reportConfidences) : 0
  const confidence = reports.length > 0 ? Math.min(score.confidence, minReportConfidence) : score.confidence

  const evidenceRefs = Array.from(new Set(reports.flatMap((r) => r.evidenceRefs)))

  const reasons: string[] = []
  let verdict: BuckyVerdict

  const budgetExceeded =
    (input.dailyBudgetUsd ?? 0) > 0 && (input.spentTodayUsd ?? 0) >= (input.dailyBudgetUsd ?? 0)

  if (input.emergencyStop) {
    verdict = 'pause'
    reasons.push('전역 비상정지가 켜져 있어 모든 판정을 보류합니다.')
  } else if (budgetExceeded) {
    verdict = 'pause'
    reasons.push(
      `일일 실행 비용 한도 $${input.dailyBudgetUsd}를 초과했습니다(사용 $${input.spentTodayUsd}). 재하님 확인이 필요합니다.`
    )
  } else if (score.hardBlocks.length > 0) {
    // 점수와 무관하게 차단한다.
    verdict = 'reject'
    reasons.push(`하드블록 ${score.hardBlocks.length}건 — 점수 ${score.score}점과 무관하게 차단합니다.`)
    reasons.push(...score.hardBlocks.map((b) => b.message))
  } else if (blockedReports.length > 0) {
    verdict = 'review'
    reasons.push(
      `직원 ${blockedReports.length}명이 작업을 완료하지 못했습니다: ${blockedReports
        .map((r) => `${EMPLOYEES[r.employee].name}(${r.blockedReason})`)
        .join(', ')}`
    )
  } else if (conflicts.length > 0) {
    verdict = 'review'
    reasons.push(`직원 판단이 ${conflicts.length}건 상충합니다. 사람 검토가 필요합니다.`)
    reasons.push(...conflicts.map((c) => c.detail))
  } else if (score.verdict === 'recommend') {
    verdict = 'recommend'
    reasons.push(
      `점수 ${score.score}점, 신뢰도 ${(confidence * 100).toFixed(0)}%, 순마진 ${margin.expectedNetMarginPct.toFixed(1)}%, ROI ${margin.roiPct.toFixed(1)}% — 하드블록 없음.`
    )
  } else {
    verdict = 'review'
    reasons.push(...score.reasons)
  }

  const priority = derivePriority({
    hardBlockCount: score.hardBlocks.length,
    expectedProfitKrw: margin.expectedNetProfit,
    netMarginPct: margin.expectedNetMarginPct,
    score: score.score,
  })

  return {
    productId,
    verdict,
    priority,
    sniperScore: score.score,
    confidence,
    expectedNetMarginPct: margin.expectedNetMarginPct,
    expectedProfitKrw: margin.expectedNetProfit,
    hardBlocks: score.hardBlocks,
    reasons,
    conflicts,
    nextActions: planNextActions(verdict, score.hardBlocks),
    // 등록·결제 같은 비가역 작업으로 넘어가려면 언제나 승인이 필요하다.
    // reject/pause도 사람이 알아야 하므로 상신한다.
    requiresOwnerApproval: verdict !== 'review' || score.hardBlocks.length > 0,
    evidenceRefs,
  }
}

/** 판정에 따라 다음에 만들 Task를 정한다. */
export function planNextActions(verdict: BuckyVerdict, hardBlocks: HardBlock[]): BuckyNextAction[] {
  if (verdict === 'pause') {
    return [
      {
        taskType: 'health_check',
        assignedEmployee: 'automation_watch',
        reason: '비상정지 또는 예산 초과 상태를 점검합니다.',
        requiresApproval: false,
      },
    ]
  }

  if (verdict === 'reject') {
    // 규제·IP 문제는 재검토 여지가 있다. 나머지는 그냥 버린다.
    const reviewable = hardBlocks.some(
      (b) => b.code === 'REGULATORY_UNRESOLVED' || b.code === 'IP_RISK_UNRESOLVED'
    )

    return reviewable
      ? [
          {
            taskType: 'regulatory_check',
            assignedEmployee: 'compliance_risk',
            reason: '규제·IP 위험이 해소 가능한지 재확인합니다.',
            requiresApproval: false,
          },
        ]
      : []
  }

  if (verdict === 'recommend') {
    return [
      {
        taskType: 'generate_content',
        assignedEmployee: 'content',
        reason: '추천 판정을 받았으므로 등록용 콘텐츠를 준비합니다.',
        requiresApproval: false,
      },
      {
        taskType: 'publish_listing',
        assignedEmployee: 'listing',
        // 지시서 §7·§18: 승인 전 외부 등록은 실행되지 않는다.
        reason: '채널 등록은 비가역이라 재하님 승인 후에만 실행합니다.',
        requiresApproval: true,
      },
    ]
  }

  // review — 무엇이 부족한지에 따라 보강 작업을 만든다.
  return [
    {
      taskType: 'market_analysis',
      assignedEmployee: 'market_research',
      reason: '점수·근거가 부족해 시장 데이터를 보강합니다.',
      requiresApproval: false,
    },
  ]
}

// ─── 배정 ─────────────────────────────────────────────────────

export interface AssignmentCandidate {
  employee: EmployeeDefinition
  workload: EmployeeWorkload
  performance: EmployeePerformance
}

export interface AssignmentResult {
  employee: EmployeeCode | null
  reason: string
}

/**
 * Task를 직원에게 배정한다.
 *
 * 지시서 §4: 권한·부하·성공률을 고려한다.
 *   1. 해당 Task 종류를 담당하는 직원인지 (권한)
 *   2. 일할 수 있는 상태인지 (offline/paused 제외)
 *   3. 부하가 적고 성공률이 높은 쪽 우선
 *
 * 성공률 이력이 없는 직원(totalRuns 0)은 0.5로 취급한다. 0으로 두면
 * 신입이 영원히 배정을 못 받고, 1로 두면 검증 없이 몰린다.
 */
export const NO_HISTORY_SUCCESS_RATE = 0.5

export function assign(taskType: string, candidates: AssignmentCandidate[]): AssignmentResult {
  const owner = employeeForTaskType(taskType)

  if (!owner) {
    return { employee: null, reason: `'${taskType}' 담당 직원이 정의되지 않았습니다.` }
  }

  const eligible = candidates.filter(
    (c) =>
      c.employee.code === owner.code &&
      !c.workload.offline &&
      !c.workload.paused
  )

  if (eligible.length === 0) {
    const found = candidates.find((c) => c.employee.code === owner.code)
    const why = !found
      ? '후보 목록에 없습니다'
      : found.workload.offline
        ? '오프라인입니다'
        : '일시중지 상태입니다'

    return { employee: null, reason: `${owner.name}에게 배정할 수 없습니다 — ${why}.` }
  }

  const scored = eligible
    .map((c) => {
      const load = c.workload.running + c.workload.queued + c.workload.retrying
      const rate = successRate(c.performance) ?? NO_HISTORY_SUCCESS_RATE
      // 부하가 낮고 성공률이 높을수록 점수가 높다.
      return { candidate: c, rank: rate - load * 0.1 }
    })
    .sort((a, b) => b.rank - a.rank)

  const best = scored[0].candidate
  const rate = successRate(best.performance)

  return {
    employee: best.employee.code,
    reason: `${best.employee.name}에게 배정 (성공률 ${
      rate === null ? '이력 없음' : `${(rate * 100).toFixed(0)}%`
    }, 부하 ${best.workload.running + best.workload.queued}건)`,
  }
}

// ─── 브리핑 ───────────────────────────────────────────────────

export interface BuckyBriefing {
  /** 오늘의 목표 */
  goals: string[]
  /** 병목 */
  bottlenecks: string[]
  /** 위험 */
  risks: string[]
  /** 최우선 승인 대기 */
  topApprovals: string[]
}

export interface BriefingInput {
  pendingApprovals: { title: string; priority: BuckyPriority }[]
  deadLetterCount: number
  blockedProductCount: number
  negativeMarginProductCount: number
  emergencyStop: boolean
}

/** 지휘실 상단 브리핑. 실데이터가 없으면 빈 배열을 반환한다 — 문장을 만들어내지 않는다. */
export function buildBriefing(input: BriefingInput): BuckyBriefing {
  const goals: string[] = []
  const bottlenecks: string[] = []
  const risks: string[] = []

  if (input.emergencyStop) {
    risks.push('전역 비상정지가 켜져 있습니다. 자율 실행이 전면 중단된 상태입니다.')
  }

  if (input.negativeMarginProductCount > 0) {
    risks.push(`적자 상품 ${input.negativeMarginProductCount}건 — 즉시 조치가 필요합니다.`)
    goals.push('적자 상품 일시중지 또는 가격 조정')
  }

  if (input.deadLetterCount > 0) {
    bottlenecks.push(`재시도를 소진한 작업 ${input.deadLetterCount}건이 dead letter에 있습니다.`)
  }

  if (input.blockedProductCount > 0) {
    bottlenecks.push(`하드블록으로 막힌 상품 ${input.blockedProductCount}건`)
  }

  if (input.pendingApprovals.length > 0) {
    goals.push(`승인 대기 ${input.pendingApprovals.length}건 처리`)
  }

  const order: BuckyPriority[] = ['P0', 'P1', 'P2', 'P3']
  const topApprovals = [...input.pendingApprovals]
    .sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority))
    .slice(0, 5)
    .map((a) => `[${a.priority}] ${a.title}`)

  return { goals, bottlenecks, risks, topApprovals }
}
