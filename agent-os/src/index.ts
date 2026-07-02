// ============================================================================
// Sniper Agent OS — 엔트리포인트.
// 환경 로드 → 클라이언트 구성 → 스케줄러 기동.
// ============================================================================

import { loadEnv } from './config/env'
import { createServiceClient } from './supabase'
import { GatewayClient } from './model/gateway-client'
import { startScheduler } from './scheduler'
import { listAgentConfigs } from './config/agents.config'
import { stageByNumber } from './config/autonomy-stages'

function log(msg: string, extra?: Record<string, unknown>) {
  const line = extra ? `${msg} ${JSON.stringify(extra)}` : msg
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${line}`)
}

async function main() {
  const env = loadEnv()
  const supabase = createServiceClient(env)
  const gateway = new GatewayClient({
    url: env.modelGatewayUrl,
    token: env.modelGatewayToken,
    timeoutMs: env.modelGatewayTimeoutMs,
  })

  const stage = stageByNumber(env.autonomyStage)
  log(`Sniper Agent OS 부팅 — 단계 S${stage.stage}(${stage.label}) → level=${stage.level}`)
  log(`구성된 에이전트: ${listAgentConfigs().map((a) => `${a.label}[${a.model.primary}]`).join(', ')}`)

  await startScheduler({
    supabase,
    env,
    gateway,
    log,
    tickIntervalSec: env.tickIntervalSec,
  })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[agent-os] fatal:', err)
  process.exit(1)
})
