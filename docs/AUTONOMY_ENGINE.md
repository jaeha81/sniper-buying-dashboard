# 자율 운영 엔진 (Autonomy Engine)

에이전트가 "제안만 하는" 기존 구조를 **정책 기반 자율 실행** 구조로 업그레이드한 레이어입니다.
스캔(`POST /api/agent-runs`)이 태스크를 생성하면, 자율성 정책 엔진이 각 태스크를 즉시 실행할지
승인 대기로 남길지 판단하고, 자동 실행분은 감사 로그와 함께 즉시 DB에 반영합니다.

## 자율 레벨

| 레벨 | 설명 |
|------|------|
| `manual` (수동) | 모든 액션을 관리자가 직접 승인. 에이전트는 제안만 함 |
| `assisted` (반자율, 기본값) | 방어적 액션 자동 실행: 저마진 일시중지, 한도 내 가격 조정 |
| `autopilot` (완전자율) | 가드레일 내 모든 액션 자동 실행: 고득점 상품 승인, 고객 알림(옵션), 비긴급 리스크 점검 |

## 액션별 자율 실행 매트릭스

| 액션 | manual | assisted | autopilot |
|------|--------|----------|-----------|
| `pause_product` | 승인 | ✅ 자동 (마진 < 방어선) | ✅ 자동 |
| `update_price` | 승인 | ✅ 자동 (제안가 변동 ≤ 한도) | ✅ 자동 (제안가 변동 ≤ 한도) |
| `approve_product` | 승인 | 승인 | ✅ 자동 (Sniper Score ≥ 임계값) |
| `send_customer_notice` | 승인 | 승인 | ✅ 자동 (`allow_customer_notice` 시) |
| `inspect_risk` | 승인 | 승인 | ✅ 자동 (critical 제외) |
| `review_candidate` | 승인 | 승인 | 승인 — 발굴 게이트는 항상 사람 |
| `update_order_status` | 승인 | 승인 | 승인 — 실물 구매/배송 확인 필요 |
| `review_automation_failure` | 승인 | 승인 | 승인 — 원인 진단 필요 |

## 가드레일

`autonomy_settings` 싱글톤 행(id=1)에 저장되며 `/api/autonomy`로 조회/수정합니다.

| 컬럼 | 기본값 | 의미 |
|------|--------|------|
| `kill_switch` | `false` | `true`면 레벨과 무관하게 모든 자율 실행 즉시 중단 |
| `max_daily_auto_actions` | 30 | 최근 24시간 자율 실행 한도. 초과분은 승인 대기로 전환 |
| `max_price_change_pct` | 10 | 자동 가격 변경 허용 폭(±%). 초과 제안은 승인 대기 |
| `min_margin_rate` | 10 | 이 마진율(%) 미만이면 방어적 일시중지를 자율 실행 |
| `min_approve_sniper_score` | 80 | autopilot 상품 자동 승인 최소 스코어 |
| `allow_customer_notice` | `false` | autopilot에서 고객 알림 자동 발송 허용 여부 |

마이그레이션(`005_autonomy_engine.sql`) 미적용 시 정책 로드는 **수동 모드로 폴백**하여
자율 실행이 절대 일어나지 않습니다.

## 재가격 제안 (마진/가격 에이전트)

마진율이 10~15% 구간인 상품에 대해 플랜 빌더가 목표 마진 20% 복원 제안가를 계산해
`update_price` 태스크 payload에 포함합니다:

```
proposedPrice = ceil( totalCost / (1 - 0.20) / 100 ) * 100   -- 100원 단위 올림
payload: { domesticExpectedPrice, expectedMargin, marginRate, currentPrice, proposedChangePct }
```

자율 엔진은 `|proposedChangePct| ≤ max_price_change_pct`일 때만 자동 적용합니다.
마진율 10% 미만은 가격 조정 대신 방어적 `pause_product`가 생성됩니다.

## 감사 추적 (Audit Trail)

모든 실행(관리자 승인 포함)은 `agent_tasks`에 기록됩니다:

- `executed_by`: `admin` | `autonomy`
- `executed_at`: 실행 시각
- `auto_approved`: 자율 엔진이 승인했는지 여부
- `decision_reason`: 자동 실행/보류 사유 (한국어)
- `execution_result`: 실행 결과 JSON (`{ ok, action, detail | error }`)

자율 실행 결과는 Slack(`SLACK_WEBHOOK_URL`)으로 요약 통보되고,
실패 건이 있으면 warning 레벨로 알립니다.

## API

### `GET /api/autonomy` (관리자)
현재 정책 + 최근 24시간 자율 실행 수 + 최근 자율 실행 이력 10건.

### `PUT /api/autonomy` (관리자)
부분 업데이트. 예:

```json
{ "autonomyLevel": "autopilot", "maxPriceChangePct": 5 }
{ "killSwitch": true }
```

### `POST /api/agent-runs` (관리자 또는 자동화 시크릿)
기존 스캔 + 자율 실행 패스. 응답에 `autonomy` 블록 추가:

```json
{
  "autonomy": {
    "level": "assisted",
    "killSwitch": false,
    "policySource": "supabase",
    "autoExecuted": 3,
    "autoFailed": 0,
    "heldForApproval": 5,
    "autoActionsLast24h": 7
  }
}
```

## 운영 UI

`/admin/agent-command` 상단의 **자율 운영 엔진 제어판**:

- 자율 레벨 전환 (수동 / 반자율 / 완전자율)
- 긴급 정지(킬스위치) / 재개 버튼
- 최근 24시간 자율 실행 수 / 한도 표시
- 가드레일 수정 (일일 한도, 가격 변동 한도, 자동 승인 스코어, 고객 알림 허용)
- 자율 실행 이력 (성공/실패 + 사유)

## 배포 체크리스트

1. Supabase SQL Editor에서 `supabase/migrations/005_autonomy_engine.sql` 실행
2. `/admin/agent-command`에서 "마이그레이션 필요" 배지가 사라졌는지 확인
3. 반자율(assisted)로 며칠 운영하며 자율 실행 이력 검증 후 완전자율(autopilot) 전환 권장
4. Make.com 스케줄 시나리오가 `POST /api/agent-runs`를 주기 호출하면 사람 개입 없이
   스캔 → 판단 → 실행 → 알림 루프가 완성됨
