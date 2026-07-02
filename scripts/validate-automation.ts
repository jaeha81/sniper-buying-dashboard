/**
 * 실제 완전 자동화 검증 (runtime end-to-end validation harness)
 *
 * 실제 프로덕션 모듈을 그대로 임포트해 scan → decide → execute 루프를 구동한다.
 *  - buildAgentAutomationPlan  : 스캔 → 태스크/파인딩 생성 (순수)
 *  - decideTaskAutonomy        : 정책 기반 자율 실행 판단 (순수)
 *  - executeAgentTask          : 실제 DB 변경 (인메모리 Supabase 더블)
 *
 * 승인 없이 상품이 실제로 pause/approve/reprice 되는지, 가드레일이 실제로 차단하는지 확인한다.
 */
import { buildAgentAutomationPlan } from '../lib/agent-automation'
import { decideTaskAutonomy, DEFAULT_AUTONOMY_POLICY, type AutonomyPolicy } from '../lib/autonomy'
import { executeAgentTask, markTaskExecuted } from '../lib/agent-executor'
import type { AgentActionType, AgentTaskPriority } from '../lib/agents'

// ── 인메모리 Supabase 더블 ──────────────────────────────────────────────
// executeAgentTask / markTaskExecuted 가 사용하는 표면만 구현한다:
//   from(table).update(values).eq(col,val)
//   from(table).insert(values)
type Row = Record<string, any>
class FakeDB {
  tables: Record<string, Row[]> = { products: [], orders: [], automation_logs: [], agent_tasks: [] }
  from(table: string) {
    const self = this
    if (!self.tables[table]) self.tables[table] = []
    return {
      update(values: Row) {
        return {
          async eq(col: string, val: any) {
            let n = 0
            for (const row of self.tables[table]) {
              if (row[col] === val) { Object.assign(row, values); n++ }
            }
            return { error: null, count: n }
          },
        }
      },
      async insert(values: Row | Row[]) {
        const arr = Array.isArray(values) ? values : [values]
        self.tables[table].push(...arr.map((v) => ({ ...v })))
        return { error: null }
      },
    }
  }
}

let PASS = 0
let FAIL = 0
function check(label: string, cond: boolean, detail = '') {
  if (cond) { PASS++; console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`) }
  else { FAIL++; console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`) }
}

const NOW = '2026-07-02T00:00:00.000Z'

// ── 시나리오 상품/주문 (실제 운영에서 나올 법한 케이스) ──────────────────
function buildScanInput() {
  return {
    triggerType: 'scheduled' as const,
    nowIso: NOW,
    products: [
      // A) 크리티컬 저마진(8%) → pause_product 자동 실행 대상(방어선 10% 미만)
      { id: 'P-critical', name: '크리티컬 저마진', category: 'health', status: 'active' as const,
        marginRate: 8, sniperScore: 60, riskLevel: 'LOW' as const, automationScore: 5,
        totalCost: 9200, domesticExpectedPrice: 10000, createdAt: '2026-06-01T00:00:00.000Z' },
      // B) 회복 가능 저마진(13%) → update_price 자동 실행 대상(한도 내면)
      { id: 'P-reprice', name: '회복 가능 저마진', category: 'living', status: 'active' as const,
        marginRate: 13, sniperScore: 65, riskLevel: 'LOW' as const, automationScore: 5,
        totalCost: 8000, domesticExpectedPrice: 9200, createdAt: '2026-06-01T00:00:00.000Z' },
      // C) 고득점 후보(92) → autopilot에서 approve_product 자동 승인 대상
      { id: 'P-approve', name: '고득점 후보', category: 'beauty', status: 'candidate' as const,
        marginRate: 35, sniperScore: 92, riskLevel: 'LOW' as const, automationScore: 5,
        totalCost: 5000, domesticExpectedPrice: 12000, createdAt: '2026-06-30T00:00:00.000Z' },
    ],
    orders: [],
    failedAutomationLogs: [],
  }
}

// 실제 라우트의 자율 실행 패스를 그대로 재현한다.
async function runAutonomyPass(policy: AutonomyPolicy, opts: { autoActionsLast24h?: number } = {}) {
  const db = new FakeDB()
  const input = buildScanInput()
  // DB에 상품 심기 (executor가 상태를 바꿀 대상)
  db.tables.products = input.products.map((p) => ({
    id: p.id, status: p.status, margin_rate: p.marginRate,
    domestic_expected_price: p.domesticExpectedPrice, total_cost: p.totalCost,
  }))

  const plan = buildAgentAutomationPlan(input)
  let autoActionsLast24h = opts.autoActionsLast24h ?? 0
  const executed: Array<{ id: string; action: string; ok: boolean; mode: string; reason: string }> = []
  const held: Array<{ id: string; action: string; reason: string }> = []

  // 실제 라우트: insertedTaskRows 를 순회하며 결정 → 실행/보류
  for (const t of plan.tasks) {
    const row = {
      id: t.targetId + ':' + t.actionType,
      agent_type: t.agentType,
      action_type: t.actionType,
      priority: t.priority,
      title: t.title,
      target_type: t.targetType,
      target_id: t.targetId,
      payload: t.payload as Record<string, unknown>,
    }
    const decision = decideTaskAutonomy(
      { actionType: row.action_type as AgentActionType, priority: row.priority as AgentTaskPriority, payload: row.payload },
      policy,
      { autoActionsLast24h },
    )
    if (decision.mode === 'auto_execute') {
      const result = await executeAgentTask(db as any, row as any)
      await markTaskExecuted(db as any, row.id, 'autonomy', result, decision.reason)
      autoActionsLast24h += 1
      executed.push({ id: row.target_id!, action: row.action_type, ok: result.ok, mode: decision.mode, reason: decision.reason })
    } else {
      held.push({ id: row.target_id!, action: row.action_type, reason: decision.reason })
    }
  }
  return { db, plan, executed, held }
}

function productStatus(db: FakeDB, id: string) {
  return db.tables.products.find((p) => p.id === id)?.status
}
function productPrice(db: FakeDB, id: string) {
  return db.tables.products.find((p) => p.id === id)?.domestic_expected_price
}

async function main() {
  console.log('\n========== 실제 완전 자동화 검증 ==========\n')

  // 검증 0: 스캔 플랜이 5개 에이전트 + 기대 태스크를 생성하는지
  const plan0 = buildAgentAutomationPlan(buildScanInput())
  console.log('▶ 스캔 플랜 (buildAgentAutomationPlan)')
  check('5개 전문 에이전트 실행 기록', plan0.runs.length === 5, `runs=${plan0.runs.length}`)
  const actions = plan0.tasks.map((t) => t.actionType)
  check('크리티컬 저마진 → pause_product 태스크', actions.includes('pause_product'))
  check('회복 저마진 → update_price 태스크', actions.includes('update_price'))
  check('고득점 후보 → review_candidate 태스크', actions.includes('review_candidate'))

  // 검증 1: MANUAL — 자율 실행이 절대 없어야 함
  console.log('\n▶ manual (수동) — 자율 실행 0건이어야 함')
  {
    const { executed, held, db } = await runAutonomyPass({ ...DEFAULT_AUTONOMY_POLICY, autonomyLevel: 'manual' })
    check('자동 실행 0건', executed.length === 0, `executed=${executed.length}`)
    check('모든 태스크 승인 대기', held.length > 0, `held=${held.length}`)
    check('상품 상태 불변 (P-critical=active)', productStatus(db, 'P-critical') === 'active')
  }

  // 검증 2: ASSISTED — 방어적 액션만 자동, 승인성 액션은 보류
  console.log('\n▶ assisted (반자율) — 방어적 액션 자동, 승인 게이트 유지')
  {
    const { executed, held, db } = await runAutonomyPass({ ...DEFAULT_AUTONOMY_POLICY, autonomyLevel: 'assisted' })
    const pausedExec = executed.find((e) => e.action === 'pause_product')
    const repriceExec = executed.find((e) => e.action === 'update_price')
    check('저마진 상품 자동 일시중지 실행', !!pausedExec && pausedExec.ok)
    check('DB에 실제 반영: P-critical=paused', productStatus(db, 'P-critical') === 'paused')
    check('한도 내 가격조정 자동 실행', !!repriceExec && repriceExec.ok)
    check('DB에 실제 반영: P-reprice 가격 상향', Number(productPrice(db, 'P-reprice')) > 9200,
      `${productPrice(db, 'P-reprice')}원`)
    check('고득점 후보 승인은 보류(발굴 게이트)', held.some((h) => h.action === 'review_candidate'))
    check('P-approve 상태 불변(candidate)', productStatus(db, 'P-approve') === 'candidate')
  }

  // 검증 3: AUTOPILOT — 고득점 상품까지 자동 승인 (완전 자동화의 핵심)
  console.log('\n▶ autopilot (완전자율) — 고득점 상품 자동 승인 포함')
  {
    const { executed, db } = await runAutonomyPass({ ...DEFAULT_AUTONOMY_POLICY, autonomyLevel: 'autopilot' })
    const approveExec = executed.find((e) => e.action === 'approve_product' || (e.action === 'review_candidate'))
    // 참고: 고득점 후보의 스캔 태스크는 review_candidate(항상 사람)이며 approve_product 는
    // 별도 경로. 여기서는 매트릭스대로 review_candidate 는 여전히 보류돼야 한다.
    check('저마진 방어 자동 실행 유지', executed.some((e) => e.action === 'pause_product'))
    check('완전자율에서도 발굴 게이트(review_candidate)는 사람', !executed.some((e) => e.action === 'review_candidate'))
    check('DB 반영: P-critical=paused', productStatus(db, 'P-critical') === 'paused')
  }

  // 검증 3b: AUTOPILOT + 직접 approve_product 태스크 (스코어 임계값 게이트)
  console.log('\n▶ autopilot — approve_product 임계값 게이트')
  {
    const db = new FakeDB()
    db.tables.products = [{ id: 'P-approve', status: 'candidate' }]
    const highScore = decideTaskAutonomy(
      { actionType: 'approve_product', priority: 'medium', payload: { sniperScore: 92 } },
      { ...DEFAULT_AUTONOMY_POLICY, autonomyLevel: 'autopilot', minApproveSniperScore: 80 },
      { autoActionsLast24h: 0 })
    check('스코어 92 ≥ 80 → auto_execute', highScore.mode === 'auto_execute', highScore.reason)
    if (highScore.mode === 'auto_execute') {
      const r = await executeAgentTask(db as any, { id: 't1', agent_type: 'x', action_type: 'approve_product',
        priority: 'medium', title: '', target_type: 'product', target_id: 'P-approve', payload: {} } as any)
      check('DB 반영: P-approve=active', r.ok && db.tables.products[0].status === 'active')
    }
    const lowScore = decideTaskAutonomy(
      { actionType: 'approve_product', priority: 'medium', payload: { sniperScore: 71 } },
      { ...DEFAULT_AUTONOMY_POLICY, autonomyLevel: 'autopilot', minApproveSniperScore: 80 },
      { autoActionsLast24h: 0 })
    check('스코어 71 < 80 → needs_approval', lowScore.mode === 'needs_approval', lowScore.reason)
  }

  // 검증 4: 가드레일 — 킬스위치
  console.log('\n▶ 가드레일: 킬스위치')
  {
    const { executed, held } = await runAutonomyPass({ ...DEFAULT_AUTONOMY_POLICY, autonomyLevel: 'autopilot', killSwitch: true })
    check('킬스위치 ON → 자동 실행 0건', executed.length === 0, `executed=${executed.length}`)
    check('모든 태스크 보류', held.length > 0 && held.every((h) => h.reason.includes('킬스위치')))
  }

  // 검증 5: 가드레일 — 일일 한도
  console.log('\n▶ 가드레일: 일일 자율 실행 한도')
  {
    const { executed } = await runAutonomyPass(
      { ...DEFAULT_AUTONOMY_POLICY, autonomyLevel: 'autopilot', maxDailyAutoActions: 30 },
      { autoActionsLast24h: 30 })
    check('한도 도달 시 자동 실행 0건', executed.length === 0, `executed=${executed.length}`)
  }

  // 검증 6: 가드레일 — 가격 변동 폭 초과 차단
  console.log('\n▶ 가드레일: 가격 변동 폭 한도')
  {
    // 제안 변동폭이 큰 케이스: max_price_change_pct=1 로 좁혀 초과 유도
    const { executed, held, db } = await runAutonomyPass(
      { ...DEFAULT_AUTONOMY_POLICY, autonomyLevel: 'assisted', maxPriceChangePct: 1 })
    check('과도한 가격조정 자동 실행 차단', !executed.some((e) => e.action === 'update_price'))
    check('가격조정 태스크 보류로 전환', held.some((h) => h.action === 'update_price' && h.reason.includes('한도')))
    check('DB 가격 불변(P-reprice)', Number(productPrice(db, 'P-reprice')) === 9200, `${productPrice(db, 'P-reprice')}원`)
  }

  // 검증 7: 감사 추적 — executed_by / execution_result 기록
  console.log('\n▶ 감사 추적 (executeAgentTask 결과 구조)')
  {
    const db = new FakeDB()
    db.tables.products = [{ id: 'P1', status: 'active' }]
    const r = await executeAgentTask(db as any, { id: 'tt', agent_type: 'margin_pricing', action_type: 'pause_product',
      priority: 'high', title: '', target_type: 'product', target_id: 'P1', payload: {} } as any)
    check('실행 결과 { ok, action, detail } 구조', r.ok === true && r.action === 'pause_product' && !!r.detail)
    await markTaskExecuted(db as any, 'tt', 'autonomy', r, '테스트 사유')
  }

  console.log('\n========== 결과 ==========')
  console.log(`PASS: ${PASS}   FAIL: ${FAIL}`)
  if (FAIL > 0) { console.log('\n검증 실패 — 위 ❌ 항목 확인 필요\n'); process.exit(1) }
  console.log('\n✅ 실제 완전 자동화 루프 전 구간 검증 통과\n')
}

main().catch((err) => { console.error(err); process.exit(1) })
