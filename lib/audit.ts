// 감사 로그 — 지시서 §16·§18: 모든 중요 조작이 audit_logs에 남아야 한다.
//
// 기록 실패가 본 작업을 막아서는 안 되므로 전부 삼키고 로그만 남긴다.
// 다만 조용히 사라지면 안 되니 서버 콘솔에는 반드시 찍는다.

import { createServiceClient } from './supabase/server'

export type AuditActorType =
  | 'owner'
  | 'operator'
  | 'viewer'
  | 'autonomy'
  | 'automation'
  | 'system'
  | 'anonymous'

export interface AuditEntry {
  actorType: AuditActorType
  /** 사용자 ID, 세션 ID, 자동화 시나리오 이름 등 주체 식별자 */
  actorId?: string | null
  /** 점 표기 동사. 예: `order.create`, `session.login`, `product.update` */
  action: string
  entityType?: string | null
  entityId?: string | null
  /** 변경 전 상태 (부분만 담아도 된다) */
  before?: Record<string, unknown> | null
  /** 변경 후 상태 */
  after?: Record<string, unknown> | null
  /** 왜 이 조작이 일어났는지 */
  reason?: string | null
  ip?: string | null
  userAgent?: string | null
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  const supabase = createServiceClient()
  if (!supabase) {
    console.warn('[audit] Supabase service client 미구성 — 기록 생략:', entry.action)
    return
  }

  const { error } = await supabase.from('audit_logs').insert({
    actor_type: entry.actorType,
    actor_id: entry.actorId ?? null,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    ip: entry.ip ?? null,
    user_agent: entry.userAgent ?? null,
  })

  if (error) {
    // 006 마이그레이션 미적용 시 여기로 온다. 본 작업은 계속 진행한다.
    console.error('[audit] 기록 실패:', entry.action, error.message)
  }
}

/** 프록시 뒤에서 클라이언트 IP를 추출한다. */
export function clientIpFrom(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip')
}
