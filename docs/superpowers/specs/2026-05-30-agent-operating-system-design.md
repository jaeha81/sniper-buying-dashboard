# Agent Operating System Design

## 목적

Sniper Buying Dashboard를 단순 관리자 대시보드에서 1인 운영자가 수익형 구매대행을 굴릴 수 있는 에이전트 운영 시스템으로 확장한다. 도입 대상은 상품 발굴, 마진/가격, 주문 처리, 리스크/컴플라이언스, 운영 지휘 에이전트 전부다.

## 기본 방향

하이브리드 구조를 사용한다. Make.com은 외부 웹 요청, 스케줄, 이메일, Slack, 배송 API 같은 외부 자동화 실행을 맡고, Next.js와 Supabase는 판단 결과, 승인 큐, 실행 로그, 관리자 대시보드를 맡는다.

에이전트는 직접 위험 액션을 실행하지 않는다. 상품 활성화, 가격 변경, 상품 일시중지, 주문 상태 변경, 고객 알림 발송은 `agent_tasks`에 승인 대기 작업으로 생성된다. 관리자가 승인하면 API가 실제 변경을 수행한다.

## 에이전트 구성

### 상품 발굴 에이전트

역할:
- 해외 상품 후보 수집 결과를 `product_candidates` 또는 `products.status = candidate`로 기록한다.
- Sniper Score 기준으로 검토 필요, 낮은 우선순위, 거절 후보를 분류한다.
- 고득점 후보는 `agent_tasks.action_type = review_candidate`로 올린다.

승인 필요 액션:
- `approve_product`: 후보를 판매 상품으로 전환한다.

### 마진/가격 에이전트

역할:
- 환율, 해외가, 배송비, 관세, 결제 수수료, 경쟁가를 반영해 마진 악화를 감지한다.
- 10% 미만 마진, 30% 이상 원가 상승, 환율 급변은 우선순위를 높인다.
- 가격 변경 제안은 `agent_tasks.action_type = update_price`로 올린다.

승인 필요 액션:
- `update_price`
- `pause_product`

### 주문 처리 에이전트

역할:
- 신규 주문, 구매 지시 필요 주문, 배송 추적 필요 주문, 장기 지연 주문을 분류한다.
- 주문 상태 변경과 고객 알림 발송을 승인 큐로 올린다.
- 주문 public 조회 API에는 고객명, 이메일, 주소, 통관번호를 노출하지 않는다.

승인 필요 액션:
- `update_order_status`
- `send_customer_notice`

### 리스크/컴플라이언스 에이전트

역할:
- 건강기능식품, 화장품, 전자제품, 식품, 의약품 카테고리의 통관/표시/수입 리스크를 점검한다.
- 개인정보 노출 위험, 고객 알림 오발송 위험, 금지 품목 가능성을 `agent_findings`로 남긴다.
- 중대 리스크는 `critical` severity로 운영 지휘 에이전트에 노출한다.

기본 액션:
- `inspect_risk`

### 운영 지휘 에이전트

역할:
- 다른 네 에이전트의 결과를 한 화면에서 우선순위화한다.
- 오늘 처리할 작업, 승인 대기 작업, 실패 자동화, 위험 발견, 지연 주문, 마진 악화 상품을 집계한다.
- `/admin/agent-command`의 기본 화면이 된다.

기본 액션:
- `review_automation_failure`

## 데이터 모델

필수 테이블:
- `automation_logs`: Make.com 및 서버 자동화 실행 이력
- `agent_runs`: 에이전트 실행 단위
- `agent_tasks`: 승인/실행/거절 가능한 작업 큐
- `agent_findings`: 위험, 기회, 실패, 경고 발견 사항

핵심 enum 값:
- `agent_type`: `product_discovery`, `margin_pricing`, `order_ops`, `compliance_risk`, `command_center`
- `task_status`: `pending`, `approved`, `rejected`, `running`, `completed`, `failed`, `cancelled`
- `task_priority`: `low`, `medium`, `high`, `critical`
- `action_type`: `review_candidate`, `approve_product`, `update_price`, `pause_product`, `update_order_status`, `send_customer_notice`, `inspect_risk`, `review_automation_failure`

RLS:
- `service_role`은 전체 접근 가능하다.
- 브라우저 클라이언트가 직접 쓰지 않는다.
- 관리자 조작은 Next.js API에서 기존 `isAdminAuthenticated` 검사를 통과한 뒤 서버에서 수행한다.

## API 설계

### `GET /api/agent-command`

관리자 인증 필수. 반환 데이터:
- five agent summary cards
- pending tasks
- critical findings
- failed automation logs
- low margin products
- delayed orders

### `GET /api/agent-tasks`

관리자 인증 필수. 필터:
- `status`
- `agentType`
- `priority`

### `POST /api/agent-tasks`

관리자 인증 필수. 서버 내부 또는 관리자 수동 생성용. 위험 액션은 `requires_approval = true`로 강제한다.

### `PUT /api/agent-tasks/[id]`

관리자 인증 필수. 허용 작업:
- approve
- reject
- complete
- fail
- cancel

승인 시 실제 대상 변경은 별도 안전 검증 후 수행한다. 첫 단계에서는 상태만 바꾸고, 실제 상품/주문 변경은 후속 작업으로 분리해도 된다.

### `GET /api/automation-logs`

기존 관리자 조회 API를 유지한다.

### `POST /api/automation-logs`

Make.com 기록용. `AUTOMATION_WEBHOOK_SECRET`과 요청 헤더 또는 bearer token이 일치해야 한다.

## 관리자 UI

신규 화면:
- `/admin/agent-command`

화면 구성:
- 5개 에이전트 상태 카드
- 오늘의 우선순위 작업
- 승인 대기 작업
- 중대 발견 사항
- 실패 자동화
- 마진 악화 상품
- 지연 주문

기존 화면 연결:
- `/admin`에 Agent Command 링크 추가
- `/admin/product-candidates`의 승인/거절 TODO를 task 기반 흐름으로 연결
- `/admin/margins` 계산 결과를 가격 검토 task로 저장 가능하게 확장
- `/admin/orders` 상태 변경은 agent task/automation log에 흔적을 남기도록 확장

## 안전 정책

P1 안전 요구사항:
- 관리자 API는 기존 세션 검사를 반드시 통과해야 한다.
- 레거시 `admin_session=authenticated` 값으로 보호 API가 열리면 안 된다.
- Make.com 쓰기 API는 webhook secret 없이 기록되면 안 된다.
- public order 조회는 고객 PII를 반환하면 안 된다.
- 서비스 롤 키는 클라이언트 번들에 노출하면 안 된다.

운영 정책:
- 위험 액션은 승인 큐에 먼저 생성한다.
- 자동화 실패는 숨기지 않고 `automation_logs`와 `agent_findings`에 남긴다.
- `critical` 발견은 운영 지휘 화면 최상단에 노출한다.

## 완료 기준

완료로 인정하려면 현재 상태에서 다음 증거가 있어야 한다.

- Supabase migration에 네 개 테이블이 존재한다.
- TypeScript 타입에 5개 에이전트가 모두 정의되어 있다.
- `/api/agent-command`, `/api/agent-tasks`, `/api/automation-logs` POST가 존재한다.
- `/admin/agent-command`가 5개 에이전트와 작업 큐를 표시한다.
- 관리자 인증 없는 API 호출은 401을 반환한다.
- webhook secret 없는 automation log POST는 401을 반환한다.
- `npm.cmd run build`가 통과한다.
- `npx.cmd tsc --noEmit`이 통과한다.
