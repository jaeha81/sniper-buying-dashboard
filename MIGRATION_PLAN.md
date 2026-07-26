# MIGRATION_PLAN.md

> **Sniper Buying Dashboard → Sniper Buying Agent Operations OS 전환 계획**
> 근거 문서: `SNIPER BUYING 에이전트형 완전 자동화 운영 OS — 개발지시서 v1.0`
> 감사 기준 커밋: `abe23c9` (master, 2026-06-10) · 감사일 2026-07-26
> 검증 상태: `tsc --noEmit` 통과 · `next build` 통과 (35 라우트 빌드 성공)

이 문서는 지시서 §20에 따른 **1차 산출물**이다. 코드 변경은 포함하지 않으며, 현재 저장소의 실제 상태 감사와 P0~P3 전환 설계만 담는다.

---

## 0. 요약 (Executive Summary)

| 항목 | 현황 |
|---|---|
| 스택 | Next.js 15.5 App Router · React 18 · TypeScript 5 · Tailwind 3 · Supabase(Postgres) · Vercel |
| 커밋 | master 32개 · 병합 PR 1개 · 현재 브랜치 `claude/dev-status-check-iqjc15` (master와 동일) |
| 라우트 | 페이지 23개 (공개 스토어 13 / 관리자 10) · API 20개 |
| DB | 마이그레이션 5개 · 테이블 13개 |
| 빌드 | ✅ 통과 |
| 타입체크 | ✅ 통과 |
| 테스트 | ❌ **없음** (테스트 러너·스크립트 부재, 컴파일 전용 `*.typecheck.ts` 2개만 존재) |

**핵심 판단: 버리지 않는다.** 마진·스코어 계산 엔진, 발굴 파이프라인(Firecrawl+LLM), 에이전트/자율성 정책 엔진, 관리자 UI 컴포넌트는 지시서 요구사항과 구조적으로 정렬되어 있어 그대로 승계·확장한다. 반면 **공개 커머스 계층 전체**(장바구니·결제·고객 회원가입)와 **하드코딩 샘플 데이터 941줄**은 내부 운영 OS와 목적이 충돌하므로 분리·제거한다.

**최우선 처리 대상 3건** (P0에서 반드시 해소):
1. 🔴 Toss 결제가 **서버 승인(confirm) 없이** 종료된다 — 실제 수납이 일어나지 않는다.
2. 🔴 `POST /api/orders`가 **무인증 + 클라이언트 전송 금액 그대로 저장** — 주문 위조·금액 조작 가능.
3. 🔴 관리자 세션 쿠키 값이 **서버 시크릿 그 자체** — 유출 시 즉시 영구 관리자 권한.

---

## 1. 현재 저장소 구조 감사

### 1.1 라우트 인벤토리

**공개 스토어 (인증 없음)**

| 라우트 | 데이터 출처 | 처리 방침 |
|---|---|---|
| `/` (랜딩) | `data/sample-products.ts` 하드코딩 | → `/legacy-store` 이동 |
| `/products` | API + `sampleProducts` 초기값 | 목록/필터 UI **재사용**, 데이터원 교체 |
| `/products/[id]` | Supabase API | 상세 UI **재사용** → `/app/products/[id]` 360° 탭 기반 |
| `/cart` | localStorage (`cart-context`) | → **승인 대기함 / 등록 후보함**으로 대체 |
| `/checkout` | localStorage + Toss SDK | → `/legacy-store` 이동 (§1.3 결제 결함 참조) |
| `/order-complete` | `/api/orders?ref=` | → `/legacy-store` 이동 |
| `/shipping-guide`, `/faq`, `/policy/{privacy,terms,refund}` | 정적 | → `/legacy-store` 이동 |
| `/login` | Supabase Auth(고객) + 관리자 암호 (2중) | 관리자 경로만 남기고 고객 로그인 제거 |
| `/signup`, `/auth/callback` | Supabase Auth | → 제거 또는 `/legacy-store` |

**관리자 (쿠키 게이트)**

| 라우트 | 상태 | 전환 목표 |
|---|---|---|
| `/admin` | KPI를 `/api/products`에서 집계 | `/app/command-center` |
| `/admin/products` | Supabase 연동, **수정/삭제가 `alert('TODO')`** | `/app/products` |
| `/admin/product-candidates` | 태스크 기반 승인 흐름 | `/app/approvals` |
| `/admin/discover` | URL 발굴 UI | `/app/pipeline` |
| `/admin/margins` | 마진·스코어 계산기 | `/app/products/[id]` 마진 탭 + 독립 계산기 |
| `/admin/orders` | Supabase 연동 | `/app/orders` |
| `/admin/customers` | Supabase 연동 | `/legacy-store` 또는 CS 직원 화면 |
| `/admin/automation-logs` | Supabase 연동 | `/app/automations` |
| `/admin/agent-command` | 자율성 제어판 | `/app/employees` + `/app/command-center` |
| `/admin/settings` | 설정 | `/app/settings` |

**API 20개 · 인증 상태**

| 엔드포인트 | 메서드 | 인증 | 판정 |
|---|---|---|---|
| `/api/admin-login`, `/api/admin-logout` | POST | 암호 | 유지 (강화 필요) |
| `/api/products` | GET | ❌ 없음 | 🔴 인증 추가 |
| `/api/products` | POST | ✅ 관리자 | OK |
| `/api/products/[id]` | GET/PUT/DELETE | 부분 | 확인 후 전면 인증 |
| `/api/orders` | GET(`?ref=`) | ❌ 없음 | ⚠️ 열거 가능 (아래 §1.3-4) |
| `/api/orders` | GET(전체) | ✅ 관리자 | OK |
| `/api/orders` | POST | ❌ **없음** | 🔴 치명 |
| `/api/orders/[id]` | PATCH | ✅ 관리자 | OK |
| `/api/customers` | GET | ✅ 관리자 | OK |
| `/api/exchange-rate` | GET | ❌ 없음 | 허용 (외부 공개값) |
| `/api/agent-command` | GET | ✅ 관리자 | OK |
| `/api/agent-runs` | POST | ✅ 관리자 또는 자동화 시크릿 | 서명 방식으로 교체 |
| `/api/agent-tasks`, `/api/agent-tasks/[id]` | GET/POST/PATCH | ✅ 관리자 | OK |
| `/api/automation-logs` | GET 관리자 / POST 시크릿 | ✅ | 서명 방식으로 교체 |
| `/api/autonomy` | GET/PUT | ✅ 관리자 | OK |
| `/api/discover/{url,scan,jobs,candidates,monitor,process}` | POST/GET | ✅ 관리자/시크릿 | OK |

`middleware.ts`의 matcher는 **`/admin/:path*` 뿐**이다. `/api/*`는 엣지에서 보호되지 않고 각 라우트의 개별 검사에만 의존한다.

### 1.2 데이터 계층 현황

**기존 테이블 13개**

| 마이그레이션 | 테이블 |
|---|---|
| `001_initial.sql` | `products`, `orders`, `customers` |
| `002_orders_order_ref.sql` | `orders.order_ref` 추가 |
| `003_agent_operating_system.sql` | `automation_logs`, `agent_runs`, `agent_tasks`, `agent_findings` |
| `004_product_discovery.sql` | `raw_candidates`, `scan_jobs`, `scan_items`, `price_snapshots` + `products` 확장 4열 |
| `005_autonomy_engine.sql` | `autonomy_settings` + `agent_tasks` 감사열 5개 |

**지시서 §13 요구 테이블 대비 격차**

| 상태 | 테이블 |
|---|---|
| ✅ 대응 존재 | `products`(products), `orders`(orders), `tasks`(agent_tasks), `automation_runs`(automation_logs), `settings`(autonomy_settings), `source_snapshots`(price_snapshots 부분), `market_snapshots`(raw_candidates 부분) |
| ❌ **부재 (신규 필요)** | `users`, `sessions`, `permissions`, `employees`, `employee_tools`, `prompt_versions`, `product_variants`, `source_offers`, `fx_snapshots`, `scores`, `margin_calculations`, `risk_checks`, `task_runs`, `task_events`, `approvals`, `approval_actions`, `content_assets`, `listings`, `listing_events`, `order_items`, `shipments`, `returns`, `refunds`, `settlements`, `expenses`, `profit_daily`, `alerts`, `audit_logs` |

즉 **요구 34개 중 실질 대응 7개(21%)**. 나머지 27개는 신규 설계 대상이다.

**RLS 현황**: 전 테이블 RLS 활성. 정책은 대부분 `service_role` 전용이나, `products_select_anon`이 **익명 SELECT를 허용**한다 — 내부 전용 OS에서는 철회 대상.

### 1.3 발견된 오류·결함

#### 🔴 치명 (P0 필수)

**1. Toss 결제에 서버 승인 단계가 없다**
`app/checkout/page.tsx:181`이 `toss.requestPayment()`를 호출하고 `successUrl`로 리다이렉트하는 것으로 흐름이 끝난다. Toss v1 규격상 `successUrl` 수신 후 **`POST https://api.tosspayments.com/v1/payments/confirm`을 서버에서 호출해야 실제 승인**이 완료된다. 저장소 전체에서 `TOSS_SECRET_KEY`는 `.env.local.example`에 선언만 되어 있고 **어떤 코드도 참조하지 않는다**. 결제 승인 라우트가 존재하지 않는다.
→ **결과: 결제가 실제로 수납되지 않는다.**

**2. 주문이 결제 이전에, 클라이언트 금액 그대로, 무인증으로 생성된다**
`app/checkout/page.tsx:157`이 결제 요청 **전에** `POST /api/orders`를 호출한다. 해당 핸들러(`app/api/orders/route.ts:128`)는 인증 검사가 없고, `unitPrice`/`totalPrice`를 **클라이언트가 보낸 값 그대로 저장**한다. 서버 측 가격 재계산·상품 대조가 없다.
→ 임의 주문 삽입, 금액 조작, 미결제 주문 누적 가능.

**3. 관리자 세션 쿠키 값 = 서버 시크릿 원본**
`lib/admin-auth.ts:7`의 `getAdminSessionToken()`이 `ADMIN_SESSION_SECRET`을 그대로 반환하고, `admin-login`이 이 값을 쿠키에 심으며, `middleware.ts:14`와 `isAdminAuthenticated()`가 `token === secret` 단순 비교로 검증한다.
→ 쿠키 1회 유출 = 시크릿 유출 = 영구 관리자 권한. 세션 개별 발급·만료·폐기·회전 불가. `sessions` 테이블 부재. CSRF 토큰 없음. 비교도 timing-safe 아님.

#### 🟠 높음

**4. `GET /api/orders?ref=`가 무인증 열거 가능**
`order_ref`가 `SB-${Date.now()}` (checkout:140) — 밀리초 타임스탬프라 사실상 열거 가능하다. 응답 필드는 PII를 제외한 7개(주문번호·상품명·수량·총액·상태·생성시각)로 제한되어 개인정보 유출은 아니지만, 타인의 주문 존재·금액·상태가 노출된다.

**5. 카테고리 CHECK 제약 불일치로 삽입 실패**
`products.category` CHECK는 5종(`health,sports,beauty,outdoor,electronics`)인데, `lib/product-extractor.ts:5`의 `ExtractedProduct.category`는 8종(+`food`,`medicine`,`other`)을 방출한다. `lib/discovery-pipeline.ts:150`은 `other`만 `health`로 접는다.
→ LLM이 `food` 또는 `medicine`을 반환하면 **발굴 파이프라인이 DB 삽입 단계에서 실패**한다.

**6. 테스트가 전혀 없다**
`package.json`에 test 스크립트·러너·프레임워크가 없다. `lib/agents.typecheck.ts`, `lib/agent-automation.typecheck.ts`는 컴파일 타임 타입 단언일 뿐 런타임 검증이 아니다. 지시서 §19는 "테스트 없는 마진·점수·상태 변경"을 명시적으로 금지한다.

**7. `.env.local.example`이 실제 사용 변수와 불일치**
코드가 사용하나 예시에 없음: `FIRECRAWL_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
예시에 있으나 코드가 미사용: `TOSS_SECRET_KEY` (= 결함 1의 방증), `MAKE_WEBHOOK_URL`.

#### 🟡 중간

**8. Make.com 연동이 지시서 §12 보안 요건 미달**
`lib/automation-auth.ts`는 정적 공유 시크릿 **문자열 동등 비교**만 수행한다. HMAC 서명·timestamp·replay 방지 nonce·callback schema 검증·idempotency·Make 실행 ID 양방향 저장이 모두 없다.

**9. Task 엔진이 지시서 §11 스펙 미달**
`agent_tasks`에 `idempotency_key`, `attempt`, `max_attempts`, `scheduled_at`, `started_at`, `completed_at`, `error_code`, `error_message`, `confidence`, `assigned_employee_id`가 없다. `task_runs`·`task_events` 테이블 부재로 재실행 이력이 누적되지 않고, 지수 백오프·circuit breaker·dead-letter·timeout이 구현되어 있지 않다.

**10. 직원 5종 → 11종 확장 필요**
`agent_runs`/`agent_tasks`의 `agent_type` CHECK는 5종(`product_discovery, margin_pricing, order_ops, compliance_risk, command_center`). 지시서 §5는 11개 직원을 요구한다. `employees` 레지스트리 테이블도 부재 — 현재 직원은 코드 상수(`lib/agents.ts`)로만 존재한다.

**11. 실행 비용·모델·프롬프트 버전 미기록**
지시서 §11·§18은 Run마다 도구 호출·응답코드·비용·토큰·모델·프롬프트 버전 기록을 요구하나, 저장 스키마·수집 코드 모두 없다. `prompt_versions` 테이블 부재.

**12. 환율 신뢰도 표기 없음**
`lib/calculator.ts:3`의 `DEFAULT_EXCHANGE_RATE = 1350`과 `app/api/exchange-rate/route.ts:3`의 `FALLBACK_RATE = 1350`이 이중 하드코딩되어 있고, 외부 API 실패 시 **폴백값을 성공 응답과 구분 없이 반환**한다(`updatedAt: null`만 차이). `fx_snapshots` 미저장으로 과거 환율 재현 불가. 지시서 §6의 `REAL/DEMO/ESTIMATE` 표기 요건 미충족.

**13. 전역 비상정지 부재**
`autonomy_settings.kill_switch`는 **자율 실행 경로에만** 적용된다. 지시서 §16이 요구하는 전역 Emergency Stop(관리자 수동 실행·외부 등록·Make 호출 포함 차단)과 채널별 Kill Switch가 없다.

**14. `/api/health` 부재, Preview 외부 실동작 차단 부재**
지시서 §14·§18 요건. Vercel Preview 환경에서 Firecrawl·OpenRouter·Make·Toss 실호출이 그대로 나간다.

**15. 미구현 UI 핸들러**
`app/admin/products/page.tsx:101, 202, 209` — 상품 추가/수정/삭제 버튼이 `alert('TODO: ...')`.

**16. 하드코딩 샘플 데이터 941줄이 아직 실사용 경로에 있다**

| 파일 | 규모 | 사용처 |
|---|---|---|
| `data/sample-products.ts` | 897줄 (30개 상품) | `app/api/products/route.ts:89` (DB 미구성 시 폴백), `app/products/page.tsx:55` (초기 state), `components/stats-counter.tsx:37` (랜딩 통계), `app/page.tsx:25` |
| `data/sample-orders.ts` | 144줄 | 현재 import 없음 (사문화) |

`components/stats-counter.tsx`의 랜딩 통계(상품 수·평균 마진율)가 샘플 데이터에서 산출된다 — 지시서 §19 "가짜 실시간 매출·수익" 금지 조항에 직접 저촉.

### 1.4 배포 구조

- **호스팅**: Vercel (`sniper-buying-dashboard.vercel.app`), GitHub master 푸시 자동 배포
- **환경변수**: Vercel 프로젝트 설정에 저장, 서버 전용 키(`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_*`, `FIRECRAWL_*`, `OPENROUTER_*`, `AUTOMATION_WEBHOOK_SECRET`, `SLACK_WEBHOOK_URL`)는 `NEXT_PUBLIC_` 접두사 없이 서버에서만 참조 — **이 부분은 정상**
- **이미지**: `next.config.js`에 amazon/iherb/unsplash/spline 원격 패턴 허용
- **DB 마이그레이션**: 자동화 없음. Supabase SQL Editor 수동 실행 (PR #1 본문에 절차 기재). 적용 여부를 코드가 런타임에 감지해 폴백하는 구조 — 상태 추적 불가
- **CI**: GitHub Actions 워크플로 없음

---

## 2. 유지 / 교체 / 제거 판정

### 2.1 유지 — 승계 후 확장 (KEEP)

| 자산 | 근거 | 확장 방향 |
|---|---|---|
| `lib/calculator.ts` (284줄) | 마진 공식 + Sniper Score 8지표가 지시서 §8과 지표·배점까지 일치 | 지시서 §9 비용 항목(광고비·마켓수수료·반품준비금·환전스프레드 등) 추가, 신뢰도·하드블록 도입 → **Score 2.0** |
| `lib/discovery-pipeline.ts` + `firecrawl.ts` + `product-extractor.ts` | 소싱 담당 직원의 실동작 기반. URL→스크랩→LLM추출→스코어→저장 E2E가 이미 존재 | 파이프라인 상태머신(§7 15단계)에 편입, `evidence_refs`·`captured_at` 기록 추가 |
| `lib/agents.ts` · `agent-executor.ts` · `agent-automation.ts` | Task 생성·실행·감사 단일 경로가 이미 분리되어 있음 | 직원 11종 확장, `task_runs`/`task_events` 연결 |
| `lib/autonomy.ts` · `autonomy-store.ts` | 3단계 자율 레벨 + 가드레일 + 킬스위치가 지시서 §16 정책 요건의 절반을 이미 충족 | 전역 Emergency Stop·채널별 Kill Switch·일일 비용 한도로 확장 |
| `lib/margin-monitor.ts` | 가격·재고 감시 담당 직원의 기반 | `source_snapshots`·`fx_snapshots` 연동 |
| `lib/notify.ts` | Slack 알림 | `alerts` 테이블 연동 |
| `components/ui/*`, `product-card`, `sniper-score-bar`, `product-form-modal`, `admin/autonomy-panel` | 디자인 시스템 일관성 | `/app` 레이아웃으로 이전 |
| `app/admin/{margins,discover,agent-command}` | 실 DB 연동 완료된 운영 화면 | `/app/*`로 이전 |
| 마이그레이션 001~005 | 이미 프로덕션 DB에 적용됨 | **되돌리지 않고 006부터 확장** |

### 2.2 교체 (REPLACE)

| 대상 | 대체물 |
|---|---|
| `/cart` + `lib/cart-context.tsx` | `/app/approvals` (승인 대기함) + 등록 후보함 |
| `/admin/*` 라우트 트리 | `/app/*` (지시서 §3 권장 라우트 13개) |
| 쿠키=시크릿 인증 | `users` + `sessions` 테이블 기반 세션 발급/만료/폐기 + CSRF |
| `lib/automation-auth.ts` 정적 시크릿 | HMAC 서명 + timestamp + nonce replay 방지 |
| `agent_tasks` 단일 테이블 | `tasks` + `task_runs` + `task_events` + `approvals` + `approval_actions` |
| `app/admin/products` `alert('TODO')` 3개소 | 실 CRUD (이미 `product-form-modal` 존재) |
| `sampleProducts` 폴백 | DB 없으면 **빈 배열 + `데이터 없음` 표기** (지시서 §2: 임의 숫자 금지) |

### 2.3 이동 (MOVE — feature flag 뒤로)

`/`, `/products`(공개), `/checkout`, `/order-complete`, `/shipping-guide`, `/faq`, `/policy/*`, `/signup`, `/auth/callback` → **`/legacy-store`**, 환경변수 `ENABLE_LEGACY_STORE`(기본 `false`)로 차단. 루트 `/`는 `/login` 또는 `/app/command-center`로 리다이렉트(지시서 §18 완료 기준 1항).

### 2.4 제거 (DELETE)

- `data/sample-orders.ts` — 참조 없음, 즉시 삭제 가능
- `data/sample-products.ts` — 실사용 경로 4곳 제거 후 삭제. 개발 시드가 필요하면 `supabase/seeds/demo_products.sql`로 이전하고 각 행에 `is_demo = true` 플래그 부여
- `components/stats-counter.tsx`의 샘플 기반 집계 — 실데이터 집계로 교체 또는 제거

---

## 3. 데이터 이전 방법

**원칙: 파괴적 변경 없음.** 기존 5개 마이그레이션은 이미 프로덕션 DB에 적용되었으므로 되돌리지 않고, `006_` 이후로 **확장(ADD COLUMN / 신규 테이블 / 백필)** 만 수행한다.

### 3.1 마이그레이션 순서

| 번호 | 내용 | 파괴성 |
|---|---|---|
| `006_identity.sql` | `users`, `sessions`, `permissions`, `audit_logs` 신규 | 없음 |
| `007_employees.sql` | `employees`, `employee_tools`, `prompt_versions` 신규 + `lib/agents.ts` 상수 11종 시드 | 없음 |
| `008_task_engine.sql` | `tasks`, `task_runs`, `task_events`, `approvals`, `approval_actions` 신규. `agent_tasks` → `tasks` 백필 후 `agent_tasks`는 **읽기 전용 보존**(삭제 금지, 지시서 §11 "삭제 대신 archive") | 없음 |
| `009_pipeline_state.sql` | `products.pipeline_state` 추가 (§7 15단계 enum), 기존 `status` 4값 → 매핑 백필: `candidate→SCORED`, `active→SELLING`, `paused→PAUSED`, `discontinued→ENDED`. 기존 `status` 열은 당분간 병행 유지 후 P2에서 제거 | 없음 (병행) |
| `010_margin_score_v2.sql` | `margin_calculations`, `scores`, `risk_checks`, `fx_snapshots`, `source_offers` 신규. 기존 `products`의 계산 결과 열은 **캐시로 격하**하고 신규 테이블을 정본으로 | 없음 |
| `011_category_fix.sql` | `products.category` CHECK를 8종으로 확대 (§1.3-5 해소) | 제약 완화 = 안전 |
| `012_commerce.sql` | `order_items`, `shipments`, `returns`, `refunds`, `settlements`, `expenses`, `profit_daily` 신규 | 없음 |
| `013_listings_content.sql` | `content_assets`, `listings`, `listing_events` 신규 | 없음 |
| `014_alerts_rls.sql` | `alerts` 신규 + `products_select_anon` 정책 철회 | ⚠️ 공개 스토어 차단 (의도된 변경, `/legacy-store` 이전 완료 후 실행) |

### 3.2 데이터 이전 규칙

- **샘플 데이터는 DB로 옮기지 않는다.** 30개 샘플 상품은 실제 소싱 근거(`source_url` 스크랩 이력)가 없으므로 `raw_candidates` → `products` 정규 경로를 통과하지 않았다. 필요 시 `is_demo = true` 시드로만 분리 보관하고 모든 집계에서 제외한다.
- **기존 `products` 행 처리**: `source_url`이 존재하고 `raw_candidate_id`가 연결된 행만 실데이터로 인정. 나머지는 `data_quality = 'unverified'`로 표시하고 재분석 Task를 자동 생성한다.
- **기존 `orders` 행 처리**: `payment_key`가 `NULL`인 주문은 결제 미승인 상태(§1.3-1의 직접 결과)이므로 `payment_status = 'unconfirmed'`로 표시. 수익 집계에서 제외한다.
- **롤백**: 각 마이그레이션은 대응하는 `NNN_down.sql`을 함께 제출한다. 신규 테이블만 추가하는 단계는 `DROP TABLE`로 완전 복구 가능하며, 백필 단계(`008`, `009`)는 원본을 보존하므로 신규 열/테이블만 제거하면 된다.

---

## 4. 보안 조치 계획

| # | 문제 | 조치 | 단계 |
|---|---|---|---|
| S1 | 쿠키 값 = 서버 시크릿 | `sessions` 테이블 기반 랜덤 세션 ID 발급, 만료·폐기·회전, `timingSafeEqual` 비교 | P0 |
| S2 | `POST /api/orders` 무인증 + 금액 신뢰 | 인증 필수화 + 서버 측 가격 재계산·상품 대조 | P0 |
| S3 | Toss 서버 승인 부재 | `/legacy-store`로 격리 시 결제 기능 비활성. 유지 결정 시 `POST /api/payments/confirm` 신설(`TOSS_SECRET_KEY` 서버 호출 + 금액 검증) | P0(격리) / P2(복구) |
| S4 | `/api/*` 엣지 미보호 | `middleware.ts` matcher를 `['/app/:path*', '/api/:path*']`로 확장, 공개 허용 목록 명시 | P0 |
| S5 | `products_select_anon` 익명 SELECT | 정책 철회 (`014`) | P0 |
| S6 | CSRF 방어 없음 | 상태 변경 메서드에 double-submit 토큰 | P0 |
| S7 | Make 웹훅 정적 시크릿 | HMAC-SHA256 서명 + timestamp 허용창 + nonce 저장소 | P1 |
| S8 | rate limit 없음 | 로그인·발굴·웹훅 라우트에 IP·계정 단위 제한 | P1 |
| S9 | 감사 로그 없음 | `audit_logs`에 모든 상태 변경 기록 (실행자·이전값·새값·근거·시각) | P0 |
| S10 | Preview 실호출 | `VERCEL_ENV !== 'production'`에서 외부 부작용 호출 차단 게이트 | P1 |
| S11 | 개인정보 평문 | 고객 이메일·주소·통관번호 마스킹 렌더링 + 열람 감사 | P2 |

---

## 5. 단계별 실행 계획

### P0 — 내부 운영 기반 전환

| # | 항목 | 상태 |
|---|---|---|
| 1 | `users`/`sessions`/`permissions`/`audit_logs` 도입, 세션 인증 교체 (S1, S9) | ✅ 완료 |
| 2 | `middleware.ts` 전면 보호 + `/api` 인증 (S4) | ✅ 완료 |
| 3 | `/admin/*` → `/app/*` 이전, 루트 리다이렉트, `/legacy-store` 분리 | ⏸ 대기 — §6-1 확인 필요 |
| 4 | 샘플 데이터 사용처 제거 → `데이터 없음` 표기 | ✅ 완료 (파일 삭제까지) |
| 5 | `POST /api/orders` 서버 가격 검증 (S2), 결제 흐름 격리 (S3) | ✅ 완료 |
| 6 | Score 2.0: 신뢰도 + 하드블록 + `scores`/`risk_checks` 저장 | ✅ 완료 |
| 7 | 마진 엔진 v2: `margin_calculations` + `fx_snapshots` | ✅ 완료 |
| 8 | `tasks`/`task_runs`/`task_events`/`approvals` 엔진 | ✅ 완료 |
| 9 | `category` CHECK 수정 (§1.3-5) | ✅ 완료 (`007`) |
| 10 | 테스트 인프라 구축 (Vitest) | ✅ 완료 (24개 통과) |
| 11 | `.env.local.example` 실사용 변수와 동기화 | ✅ 완료 |
| + | `GET /api/health` (지시서 §14) | ✅ 완료 (앞당김) |
| + | CSRF 방어 (S6) | ⬜ 예정 |

**첫 배치에서 실제로 바뀐 것**

- **세션 인증**: 쿠키에 `ADMIN_SESSION_SECRET` 원본을 담던 구조를 폐기. 이제 쿠키에는 `v1.<세션ID>.<만료>.<HMAC>` 서명 토큰만 담기고 시크릿은 서버를 떠나지 않는다. 세션은 `sessions` 행으로 존재해 개별 폐기·만료가 가능하다. 미들웨어는 서명만 상태 없이 검증(Edge, DB 왕복 없음)하고, 라우트는 DB까지 조회해 폐기 여부를 확인한다.
- **API 보호**: matcher가 `/admin` 하나에서 `['/admin/*','/app/*','/api/*']`로 확대. 기본 차단 + 명시적 허용 목록(로그인·헬스·환율·자동화 웹훅·레거시 스토어) 구조로 바뀌어, 라우트가 개별 검사를 빠뜨려도 열리지 않는다.
- **주문 금액**: 클라이언트가 보내던 `unitPrice`/`totalPrice`/`orderRef`를 전부 무시한다. 서버가 `products`에서 가격을 조회해 계산하고 주문번호도 서버가 만든다. 결제창에 넘기는 금액도 서버 확정값이다. 판매중(`active`)이 아닌 상품은 거부한다.
- **다건 주문**: 장바구니에 여러 상품이 있으면 `product_id: 'multi'`(존재하지 않는 ID)로 한 행에 뭉개던 것을 품목마다 한 행씩 저장하도록 수정. 정식 `order_items` 도입(P2) 전까지의 구조다.
- **결제 미승인 표시**: `orders.payment_status`를 추가하고 모든 신규 주문을 `unconfirmed`로 기록한다. Toss 서버 승인 단계가 없어 실제 수납이 일어나지 않는 상태를 데이터에 명시했다 — 수익 집계에서 걸러낼 수 있다.
- **샘플 데이터 제거**: `data/sample-products.ts`(897줄)·`sample-orders.ts`(144줄) 삭제. API 폴백·상품 목록 초기값·랜딩 통계·랜딩 추천 상품 4곳이 전부 실 DB 조회로 바뀌었고, 데이터가 없으면 `—` 또는 "등록된 상품이 없습니다"로 표시한다.

**두 번째 배치에서 실제로 바뀐 것**

- **마진 엔진 v2** (`lib/margin-engine.ts`) — 지시서 §9의 전체 비용 모델. 기존 8항목에 마켓 수수료·결제 수수료·광고비·쿠폰·적립금·포장·CS·반품 준비금·환전 스프레드·세금 준비금·부피중량 할증·보험·통관비를 더해 5개 그룹(소싱/국제/판매/국내운영/재무)으로 재편했다. `ROI = 순이익 / 선투입비용`을 추가하고, 낙관/기준/보수 3종 시뮬레이션을 제공한다. 구버전 입력을 v2로 올리는 `upgradeLegacyMarginInput()`이 있고, 신규 항목을 0으로 두면 구버전과 결과가 일치함을 테스트로 고정했다.
  - 실측: 기존 계산에서 빠져 있던 판매·운영 비용을 넣으면 같은 상품의 마진율이 **10%p 이상** 떨어진다. 계산상 흑자가 실제로는 적자인 구간이 존재했다는 뜻이다.
- **Sniper Score 2.0** (`lib/score-engine.ts`) — 8개 지표와 배점은 그대로 두고(구버전과 동일 점수를 내는지 테스트로 검증), 판단에 **데이터 신뢰도**와 **하드블록**을 도입했다.
  - 신뢰도: 지표별 출처(`measured`/`scraped`/`inferred`/`manual`/`missing`)와 신선도(7일 이내 만점 → 60일 이상 0.3)를 배점으로 가중평균. 배점 큰 지표의 근거가 부실할수록 크게 떨어진다.
  - 하드블록 9종: 데이터 부족·최저 순마진·건당 이익·ROI·판매 불가·배송 불가·규제 미해결·IP 미해결·소싱처 신뢰도. **하나라도 걸리면 점수와 무관하게 `reject`** — 100점이어도 통과하지 않는다.
  - 근거 없이 만점을 주면 신뢰도 0으로 자동 차단된다 (지시서 §19 "근거 없는 수요·법규·가격 생성" 금지).
- **Task·Run 엔진** (`lib/task-engine.ts`) — 지시서 §11. 8개 상태의 전이 규칙을 코드로 강제한다. 성공한 태스크는 되돌려 실행할 수 없고(재실행은 새 Task/Run), dead letter는 되살아나지 않는다. 지수 백오프(지터 포함, 난수는 주입받아 테스트 가능), 멱등 키, 타임아웃 감지, 우선순위 큐를 포함한다.
  - 멱등성은 **진행 중인 태스크에만** 적용한다 — 어제 성공한 작업을 오늘 다시 못 하게 막으면 안 되기 때문이다. DB의 unique index도 종료 상태를 제외한다.
- **환율 신뢰도** (`app/api/exchange-rate/route.ts`) — 외부 API 실패 시 상수 1350을 성공 응답과 구분 없이 돌려주던 것을 고쳤다. 응답에 `dataQuality: REAL | ESTIMATE`를 명시하고 `fx_snapshots`에 이력을 남긴다. ESTIMATE는 캐시에 태우지 않아 API 복구 시 바로 실측으로 돌아온다. 마진 계산기 화면에 REAL/ESTIMATE 배지를 표시한다.
- **`agent_tasks` → `tasks` 백필** — 원본은 지우지 않고 읽기 전용으로 보존한다(지시서 §11 "삭제 대신 archive"). 상태·우선순위를 신규 체계로 매핑하고, 실행 중이던 것은 큐로 되돌린다.

**완료 기준 대비 현황**: 마진/스코어 테스트 통과 ✅ (102개) · 감사 로그 기록 ✅ · 샘플 데이터 참조 0건 ✅ · 모든 분석에 근거·신뢰도·버전 기록 ✅ (`scores.evidence`/`confidence`/`engine_version`) · 루트 리다이렉트 ⏸ · 데이터 출처 배지 🔶 (환율은 표시, 상품·주문 화면은 미적용)

### P1 — Bucky와 직원 운영

12. `employees`/`employee_tools`/`prompt_versions` + 직원 11종 레지스트리·상태판
13. Bucky 오케스트레이션 (§4 판정 JSON 스키마)
14. URL 1건 → 후보 → 판정 → 승인 대기 E2E
15. Make.com 서명 웹훅 (S7) + `/app/automations`
16. 재시도·백오프·circuit breaker·dead-letter·전역 Emergency Stop
17. `/api/health`, Preview 차단 (S10)

**완료 기준**: URL 하나로 파이프라인 전 구간 실행·기록 · 모든 분석에 근거/신뢰도/버전 기록 · Make 중단·중복·timeout 안전 처리

### P2 — 외부 등록·주문·수익 연결

18. `content_assets`/`listings`/`listing_events` + 콘텐츠·등록 담당
19. 가격·재고 감시 (`source_offers`/`source_snapshots`)
20. `order_items`/`shipments`/`returns`/`refunds`/`settlements`/`expenses`/`profit_daily`
21. 실현 손익 대시보드 (예상 vs 실현, 비용 워터폴)
22. CS 초안 · PII 마스킹 (S11)
23. 결제 승인 복구 결정 시 S3 이행

**완료 기준**: 승인 전 외부 등록 미실행 검증 · 수익이 주문·정산·비용에서 산출

### P3 — 자율 최적화

24. 성과 기반 배정, 제한적 자동 승인 확대, 임계값 실험, 실패 사례 환류

---

## 6. 리스크와 판단이 필요한 사항

1. **공개 스토어의 운명** — 지시서는 `/legacy-store` 이동 또는 feature flag를 지시하나, 이는 현재 vercel.app 공개 URL의 고객 접근이 차단됨을 의미한다. 진행 중인 주문·고객이 실제로 존재하는지에 따라 §2.3 실행 시점이 달라진다. **확인 필요.**
2. **결제 기능의 존치 여부** — §1.3-1로 인해 현재 결제는 작동하지 않는다. 내부 운영 OS 전환 후 판매 채널을 외부 마켓(쿠팡·네이버 등 `listings`)으로 옮긴다면 자체 결제는 불필요하며, S3 복구 작업을 생략할 수 있다. **확인 필요.**
3. **마이그레이션 수동 실행** — 현재 SQL Editor 수동 적용이라 006~014를 순차 실행할 때 누락 위험이 있다. Supabase CLI 기반 마이그레이션 자동화를 P0에 포함할 것을 권고한다.
4. **`agent_tasks` → `tasks` 전환 중 이중 쓰기** — P0 8단계 동안 두 테이블이 병존한다. 전환 완료 전까지 신규 쓰기는 `tasks`로만 보내고 `agent_tasks`는 읽기 전용으로 고정한다.

---

## 7. 다음 단계

이 문서 검토 후 **P0 착수**. P0 1~5번(인증·라우트·데이터 정직성)을 첫 배치로 묶어 제출하고, 6~11번(엔진·테스트)을 두 번째 배치로 진행할 것을 제안한다.
