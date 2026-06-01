# Sniper Buying Dashboard — 세션 메모리

최종 업데이트: 2026-06-02
최신 커밋: `66ad485` feat: Phase 2-5 구현 완료

---

## 브랜치 상태
`master` — origin/master 동기화 완료

---

## 완료된 전체 작업

### Agent OS 기반 (7878c58)
- `supabase/migrations/003_agent_operating_system.sql`
- `lib/agents.ts` — 5 AgentType, 타입, 유틸
- `app/api/agent-command/route.ts` — GET 운영현황 집계
- `app/api/agent-tasks/route.ts` — GET/POST
- `app/api/agent-tasks/[id]/route.ts` — PUT approve/reject/complete/fail/cancel + 위험액션 notifyAdmin
- `app/api/automation-logs/route.ts` — GET(service_role) / POST(webhook)
- `app/admin/agent-command/page.tsx` — 5에이전트 상태판 + 승인 UI
- `app/admin/layout.tsx` — Agent Command 네비 링크

### Build Hang 수정 (6492f99)
- `components/stats-counter.tsx` — 외부 fetch 제거
- `.env.local.example` — 키 이름 정비

### Agent Automation Scan (fe60d4d)
- `app/api/agent-runs/route.ts` — POST 5에이전트 일괄 스캔 (Make.com + admin 양쪽 인증)
- `lib/agent-automation.ts` — buildAgentAutomationPlan 로직
- `lib/automation-auth.ts` — webhook secret 공용 유틸
- `lib/agent-automation.typecheck.ts`
- `docs/AGENT_OS_AUTOMATION.md`

### Phase 2-5 (66ad485)
- `lib/notify.ts` — Slack webhook fire-and-forget
- `app/admin/margins/page.tsx` — 가격 검토 agent_task 생성 버튼
- `app/admin/orders/page.tsx` — 취소 시 update_order_status task 자동 생성
- `components/stats-counter.tsx` — 정적 초기값 + useEffect 실시간 갱신
- `app/admin/product-candidates/page.tsx` — /api/products?status=candidate fetch
- `app/admin/products/page.tsx` — /api/products fetch + 새로고침
- `app/products/page.tsx` — 마운트 후 /api/products 갱신
- `app/api/agent-runs/route.ts` — critical findings → notifyAdmin
- `app/api/agent-tasks/[id]/route.ts` — 위험액션 approve → notifyAdmin

---

## 사용자 직접 조치 필요 (미완료)

### .env.local + Vercel 대시보드
```
SUPABASE_SERVICE_ROLE_KEY=<실제값>   # SUPABASE_SECRET_KEY → 키 이름 변경
AUTOMATION_WEBHOOK_SECRET=<생성값>   # node -e "require('crypto').randomBytes(32).toString('hex')"
SLACK_WEBHOOK_URL=<Slack webhook>    # Phase 5 알림용 (선택)
```

### Supabase 마이그레이션 (미실행 가능성)
- Supabase 대시보드 → SQL Editor → `003_agent_operating_system.sql` 내용 실행
- 미실행 시 agent API = schema_missing / 빈 데이터

### Make.com 시나리오 설정
```
POST https://your-domain.vercel.app/api/agent-runs
Authorization: Bearer <AUTOMATION_WEBHOOK_SECRET>
스케줄: 매일 or 6시간마다
```

---

## 다음 세션 후보 작업

| 항목 | 설명 |
|------|------|
| admin/products 수정/삭제 | TODO alert → 실제 PATCH/DELETE API 연결 |
| 고객 알림 발송 | send_customer_notice task → 이메일 실제 발송 (Resend/SendGrid) |
| approve_product 자동 실행 | approve → products.status = 'active' 자동 변경 |
| update_price 자동 실행 | approve → products.domestic_expected_price 업데이트 |
| pause_product 자동 실행 | approve → products.status = 'paused' 업데이트 |
| admin/page.tsx (대시보드) | sampleProducts 의존 제거 → API 연결 |

---

## 아키텍처 요약

| 레이어 | 기술 | 비고 |
|--------|------|------|
| 인증 | 쿠키 admin_session + ADMIN_SESSION_SECRET | Supabase Auth 미사용 |
| DB 클라이언트 | createServiceClient() | SUPABASE_SERVICE_ROLE_KEY 필요 |
| agent 테이블 RLS | service_role 전용 | anon key 조회 불가 |
| Make.com 인증 | AUTOMATION_WEBHOOK_SECRET | Bearer or x-automation-secret |
| 알림 | SLACK_WEBHOOK_URL | lib/notify.ts, fire-and-forget |
| 빌드 | 외부 fetch 의존 없음 | 모든 fetch는 클라이언트 useEffect |
