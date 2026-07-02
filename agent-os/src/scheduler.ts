// ============================================================================
// Scheduler — 24/7 상주 루프. tickInterval 마다 사이클을 돌리고,
// 매 틱 킬스위치를 선검사하며, 실패해도 죽지 않고 다음 틱으로 이어간다.
// ============================================================================

import { runCycle, type RuntimeDeps, type CycleResult } from './runtime'

export interface SchedulerOptions extends RuntimeDeps {
  tickIntervalSec: number
  /** 테스트/드라이 실행용: 이 횟수만큼 돌고 종료(미지정 시 무한) */
  maxTicks?: number
}

export async function startScheduler(opts: SchedulerOptions): Promise<void> {
  const { tickIntervalSec, log, maxTicks } = opts
  let tick = 0
  let running = true

  const stop = () => { running = false; log('종료 신호 수신 — 현재 틱 후 정지') }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  log(`스케줄러 시작 — tick=${tickIntervalSec}s, stage=${opts.env.autonomyStage}, dryRun=${opts.env.dryRun}, gateway=${opts.gateway.enabled ? 'on' : 'off'}`)

  while (running) {
    tick += 1
    const started = Date.now()
    try {
      const result: CycleResult = await runCycle(opts)
      log(`틱 #${tick} 완료`, { ...result, ms: Date.now() - started })
    } catch (err) {
      log(`틱 #${tick} 실패 — ${err instanceof Error ? err.message : String(err)}`)
    }
    if (maxTicks && tick >= maxTicks) { log(`maxTicks(${maxTicks}) 도달 — 종료`); break }
    await sleep(tickIntervalSec * 1000)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
