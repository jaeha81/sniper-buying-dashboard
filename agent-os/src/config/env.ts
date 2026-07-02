// ============================================================================
// 환경 변수 스키마 — 데몬 부팅 시 검증. 누락 시 명확히 실패하거나 안전 폴백.
// ============================================================================

export interface AgentOsEnv {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  /** 로컬 Model Gateway 의 터널 URL (예: https://gateway.<tail>.ts.net). 없으면 heuristic-only. */
  modelGatewayUrl: string | null
  /** 게이트웨이 호출 인증 토큰 */
  modelGatewayToken: string | null
  /** 게이트웨이 요청 타임아웃(ms) */
  modelGatewayTimeoutMs: number
  /** 현재 운영 단계(0~3). autonomy-stages 와 매핑. 정책 레벨은 Supabase autonomy_settings 가 우선. */
  autonomyStage: number
  /** 스케줄러 최소 틱 간격(초) — 모든 에이전트 cadence 의 공약수 역할 */
  tickIntervalSec: number
  /** 드라이런: 실제 DB 변경 없이 결정만 로그(초기 관찰용) */
  dryRun: boolean
  /** Slack 알림 webhook(선택) */
  slackWebhookUrl: string | null
}

function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`[agent-os] 필수 환경변수 누락: ${name}`)
  return v
}

function opt(name: string, fallback: string | null = null): string | null {
  return process.env[name] ?? fallback
}

function num(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name]
  if (v == null) return fallback
  return v === '1' || v.toLowerCase() === 'true'
}

export function loadEnv(): AgentOsEnv {
  return {
    supabaseUrl: req('SUPABASE_URL'),
    supabaseServiceRoleKey: req('SUPABASE_SERVICE_ROLE_KEY'),
    modelGatewayUrl: opt('MODEL_GATEWAY_URL'),
    modelGatewayToken: opt('MODEL_GATEWAY_TOKEN'),
    modelGatewayTimeoutMs: num('MODEL_GATEWAY_TIMEOUT_MS', 60_000),
    autonomyStage: num('AUTONOMY_STAGE', 0),
    tickIntervalSec: num('TICK_INTERVAL_SEC', 60),
    dryRun: bool('AGENT_OS_DRY_RUN', true), // 안전 기본값: 드라이런
    slackWebhookUrl: opt('SLACK_WEBHOOK_URL'),
  }
}
