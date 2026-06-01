# Sniper Buying Dashboard — 세션 메모리

## 최신 커밋
- `6492f99` fix: build hang 제거 및 env 예시 파일 정합성 수정
- `7878c58` Checkpoint Sniper agent operating system work

## 현재 브랜치
`master` — origin/master와 동기화 완료

---

## 완료된 작업

### Agent Operating System (7878c58)
- `supabase/migrations/003_agent_operating_system.sql` — automation_logs, agent_runs, agent_tasks, agent_findings 테이블 + RLS (service_role 전용)
- `lib/agents.ts` — AgentType, AgentTask, AgentFinding, AgentRun 타입 + requiresApproval, getAgentTaskPriority 로직
- `app/api/agent-command/route.ts` — GET: 5개 에이전트 운영 현황 집계
- `app/api/agent-tasks/route.ts` — GET/POST
- `app/api/agent-tasks/[id]/route.ts` — PUT: approve/reject/complete/fail/cancel
- `app/api/automation-logs/route.ts` — GET(service_role), POST(webhook secret 검증)
- `app/admin/agent-command/page.tsx` — Agent Command Center UI
- `app/admin/layout.tsx` — "Agent Command" 네비 링크 추가
- `app/admin/product-candidates/page.tsx` — 승인/거절 → POST /api/agent-tasks 연결

### Build Hang 수정 (6492f99)
- `components/stats-counter.tsx` — 외부 fetch 제거, sampleProducts 기반 동기 계산
- `.env.local.example` — SUPABASE_SERVICE_ROLE_KEY, AUTOMATION_WEBHOOK_SECRET 항목 정비

---

## 미완료 / 다음 세션 필수 작업

### 사용자 직접 조치 필요 (코드 변경 아님)
1. **`.env.local` 수정** (사무실 PC 및 Vercel 대시보드)
   - `SUPABASE_SECRET_KEY` → `SUPABASE_SERVICE_ROLE_KEY` 로 키 이름 변경 (값 그대로)
   - `AUTOMATION_WEBHOOK_SECRET` 신규 추가
     ```
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
2. **Vercel 환경변수 갱신 후 Redeploy** — 위 2개 키 반영 필요

### Supabase 마이그레이션 미실행
- `003_agent_operating_system.sql` 파일은 존재하나 실제 Supabase 프로젝트에 적용 여부 불명
- 적용 전에는 agent API가 `schema_missing` 또는 빈 데이터 반환
- Supabase 대시보드 SQL Editor 또는 `supabase db push` 로 실행 필요

### 향후 기능 확장 후보
- `/admin/margins` 결과 → 가격 검토 agent_task 자동 생성 연결
- `/admin/orders` 상태 변경 → agent_task 또는 automation_log 연결
- 실시간 운영 통계 (StatsCounter) → Client Component + useEffect 별도 분리

---

## 아키텍처 요약

| 레이어 | 기술 | 역할 |
|--------|------|------|
| 인증 | 쿠키 `admin_session` + `ADMIN_SESSION_SECRET` | 관리자 전용, Supabase Auth 미사용 |
| DB 클라이언트 | `createServiceClient()` | SUPABASE_SERVICE_ROLE_KEY 필요, 없으면 null 반환 |
| agent 테이블 RLS | service_role 전용 | anon key로는 조회 불가 |
| Make.com 연동 | `AUTOMATION_WEBHOOK_SECRET` | POST /api/automation-logs 인증 |
| 빌드 | 외부 fetch 의존 없음 | stats-counter 수정 완료 |

---

## P3 보류 항목
- `next.config.js` webpack conditionNames `'import'` 선두 삽입 — tsc/build 현재 정상, 문제 재현 시 제거 검토
