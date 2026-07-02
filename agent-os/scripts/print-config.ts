// 구성 점검 유틸 — 역할별 에이전트 구성과 단계 매트릭스를 출력한다.
// 실행: npm run config:print
import { listAgentConfigs, isAutoActionEnabled } from '../src/config/agents.config'
import { AUTONOMY_STAGES } from '../src/config/autonomy-stages'
import { AGENT_ACTION_LABELS } from '../../lib/agents'

console.log('\n=== 역할별 에이전트 구성 ===\n')
for (const a of listAgentConfigs()) {
  console.log(`• ${a.label} (${a.id})`)
  console.log(`    미션 : ${a.mission}`)
  console.log(`    모델 : ${a.model.primary}  fallback=[${a.model.fallback.join(', ')}]`)
  console.log(`    주기 : ${Math.round(a.cadenceSec / 60)}분   보강판단: ${a.reasoning.join(', ') || '-'}`)
  const auto = Object.entries(a.autoActions).map(([k, v]) => `${k}(S${v!.minStage}+)`).join(', ') || '없음'
  console.log(`    자율 : ${auto}`)
  console.log(`    사람 : ${a.humanGated.map((x) => AGENT_ACTION_LABELS[x]).join(', ') || '-'}\n`)
}

console.log('=== 단계별 자율 개방 매트릭스 ===\n')
const actions = ['pause_product', 'update_price', 'inspect_risk', 'send_customer_notice', 'update_order_status', 'approve_product'] as const
const header = ['action'.padEnd(22), ...AUTONOMY_STAGES.map((s) => `S${s.stage}`)].join(' ')
console.log(header)
for (const act of actions) {
  const row = [AGENT_ACTION_LABELS[act].padEnd(22)]
  for (const s of AUTONOMY_STAGES) {
    // 어떤 에이전트든 이 액션을 이 단계에서 열면 ✓
    const open = listAgentConfigs().some((a) => isAutoActionEnabled(a.id, act, s.stage))
    row.push(open ? ' ✓' : ' ·')
  }
  console.log(row.join(' '))
}
console.log('')
