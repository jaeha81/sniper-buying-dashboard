// ============================================================================
// 서비스롤 Supabase 클라이언트 — 데몬 전용(서버에서만 사용).
// lib/agent-executor 의 executeAgentTask 가 기대하는 표면과 호환된다.
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AgentOsEnv } from './config/env'

export function createServiceClient(env: AgentOsEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
