# Sniper Buying Dashboard — Make.com 자동화 시나리오 설계서

> Make.com 무료 플랜 기준 (1,000 ops/월) | 5개 시나리오 상세 설계  
> 최종 수정: 2026-05-26

---

## 개요

Make.com은 본 시스템의 자동화 허브로, 총 5개 시나리오를 운영한다.  
무료 플랜(1,000 ops/월) 내에서 운영하기 위해 각 시나리오의 ops를  
정밀하게 설계하고 비효율 모듈 제거 원칙을 적용한다.

---

## 시나리오 1: 신상품 후보 수집

### 목적
iHerb 신상품 페이지 또는 RSS에서 잠재 상품을 자동 수집하여  
Supabase `product_candidates` 테이블에 저장하고 Sniper Score를 계산한다.

### 트리거 유형
- **Schedule**: 매일 오전 09:00 KST (UTC+9)
- 주기: 1회/일 → 월 31 실행

### 모듈 체인

```
[1] Schedule
    │
    ▼
[2] HTTP - Make a Request
    URL: https://www.iherb.com/catalog/paging/
    Method: GET
    Headers: User-Agent 설정
    │
    ▼
[3] HTML - Parse HTML
    (또는 JSON Parser, iHerb API 응답 형태에 따라)
    상품명, 가격, URL, 이미지 추출
    │
    ▼
[4] Iterator
    파싱된 상품 목록 순회 (최대 20개/회)
    │
    ▼
[5] Supabase - Search Records
    테이블: product_candidates
    필터: source_url = {{item.url}}
    목적: 중복 체크
    │
    ▼
[6] Router (2개 경로)
    ├── [경로 A] 신규 상품 (검색 결과 없음)
    │       ▼
    │   [7] Tools - Set Variable
    │       overseas_price, name, category 정규화
    │       ▼
    │   [8] Supabase - Create a Record
    │       테이블: product_candidates
    │       status: 'pending'
    │       ▼
    │   [9] HTTP - POST (Supabase Edge Function)
    │       URL: /functions/v1/calculate-sniper-score
    │       자동 Score 계산 트리거
    │
    └── [경로 B] 기존 상품 → 스킵
```

### ops 소비량 추정

| 실행 횟수 | 1회 ops | 월 ops |
|---------|---------|--------|
| 매일 1회 × 31일 | 약 8 ops (상품 5개 처리 기준) | **248 ops** |
| 신규 상품 20개 처리 시 | 약 25 ops | 최대 775 ops |

> 권장: 일 처리 상품 수를 5개로 제한 → 월 약 248 ops 목표

### 에러 처리

- **HTTP 타임아웃**: 30초 설정, 3회 자동 재시도 (지수 백오프: 1분, 5분, 15분)
- **파싱 실패**: `automation_logs`에 `status='failed'` 기록 후 다음 상품으로 계속
- **Supabase 연결 오류**: 시나리오 중단 + 관리자 이메일 알림
- **중복 삽입 시도**: UNIQUE 제약 조건으로 DB 레벨 차단 (Make.com은 에러 무시)

---

## 시나리오 2: 주문 접수 알림

### 목적
고객이 주문을 완료하면 관리자에게 즉시 알림을 발송하여  
소싱 시작을 지시하고, 고객에게는 주문 확인 메일을 발송한다.

### 트리거 유형
- **Webhook**: Supabase Database Webhook → Make.com  
  이벤트: `orders` 테이블 INSERT
- 실시간 트리거, 주문 발생 즉시

### 모듈 체인

```
[1] Webhooks - Custom Webhook
    Supabase orders INSERT 이벤트 수신
    │
    ▼
[2] JSON - Parse JSON
    order_id, customer_id, total_amount, status 파싱
    │
    ▼
[3] Supabase - Get a Record
    테이블: orders (JOIN customers, order_items 포함 뷰 사용)
    주문 상세 + 고객 정보 조회
    │
    ▼
[4] Router (병렬 2개 경로)
    │
    ├── [경로 A] 관리자 알림
    │       ▼
    │   [5] Email - Send an Email (Gmail)
    │       수신: admin@example.com
    │       제목: [주문 접수] {order_number} - {product_name}
    │       본문: 소싱 지시서 (상품명, 수량, sourceUrl, 예상 원가)
    │
    └── [경로 B] 고객 확인 이메일
            ▼
        [6] Email - Send an Email (Gmail)
            수신: {customer.email}
            제목: 주문이 접수되었습니다 - {order_number}
            본문: 주문 내역, 예상 수령일, 추적 페이지 링크
```

### ops 소비량 추정

| 구분 | 1회 ops | 월 ops (20건 기준) |
|------|---------|----------------|
| Webhook 수신 | 0 | - |
| Supabase 조회 | 1 | 20 |
| 관리자 이메일 | 1 | 20 |
| 고객 이메일 | 1 | 20 |
| **합계** | **3** | **60 ops** |

### 에러 처리

- **이메일 발송 실패**: 최대 3회 재시도 (각 5분 간격)
- **Supabase 조회 실패**: `automation_logs` 기록 + Slack 긴급 알림
- **Webhook 파싱 오류**: HTTP 400 응답 → Make.com 자동 재발송 방지 처리
- **고객 이메일 주소 없음**: 관리자 알림에 "이메일 미수집" 포함 후 계속

---

## 시나리오 3: 가격 변동 모니터링

### 목적
등록된 활성 상품의 해외 원가를 매일 1회 확인하여,  
기준치(10%) 이상 변동 시 관리자에게 알림을 발송하고 DB에 기록한다.

### 트리거 유형
- **Schedule**: 매일 오전 10:00 KST (격일 실행 옵션으로 ops 절감 가능)
- 격일 실행 시 월 ops 절반 절감

### 모듈 체인

```
[1] Schedule (매일 10:00)
    │
    ▼
[2] Supabase - Search Records
    테이블: products
    필터: status = 'active'
    결과: 상품 목록 (최대 10개)
    │
    ▼
[3] Iterator
    상품 목록 순회
    │
    ▼
[4] HTTP - Make a Request
    URL: {{product.source_url}} (iHerb 상품 페이지)
    Method: GET
    │
    ▼
[5] Tools - Text Parser (정규식)
    현재 가격 추출: \$([0-9]+\.[0-9]{2})
    │
    ▼
[6] Tools - Set Variable
    previous_price: {{product.overseas_price}}
    current_price: {{parsed_price}}
    change_rate: ((current - previous) / previous) * 100
    │
    ▼
[7] Router (3개 경로, 변동률 기준)
    │
    ├── [경로 A] |change_rate| < 10% → 스킵 (로그만)
    │
    ├── [경로 B] 10% ≤ |change_rate| < 30%
    │       ▼
    │   [8] Supabase - Update Record (products)
    │       overseas_price = current_price
    │       ▼
    │   [9] Supabase - Create Record (margin_logs)
    │       ▼
    │   [10] Email - 관리자 가격 변동 알림
    │
    └── [경로 C] |change_rate| >= 30% (심각)
            ▼
        [8'] Supabase - Update Record (products)
            status = 'price_review'
            ▼
        [9'] Supabase - Create Record (margin_logs)
            alert_severity = 'critical'
            ▼
        [10'] Email + Slack - 긴급 알림
```

### ops 소비량 추정

| 구분 | 1회 ops | 월 ops (10상품, 매일) |
|------|---------|-----------------|
| Supabase 조회 | 1 | 31 |
| HTTP 요청 (10개) | 10 | 310 |
| Supabase 업데이트 (알림 발생 2개 가정) | 2×2 | 124 |
| 알림 이메일 | 2 | 62 |
| **합계** | **~15** | **~527 ops** |

> 격일 실행 시: **~264 ops** → 무료 플랜 내 여유 확보

### 에러 처리

- **HTTP 크롤링 차단 (403/429)**: User-Agent 변경 + 10분 대기 후 재시도
- **가격 파싱 실패**: 해당 상품 스킵 + `automation_logs` warning 기록
- **연속 3회 크롤링 실패**: 해당 상품 `status = 'price_review'` 자동 전환

---

## 시나리오 4: 배송 상태 업데이트

### 목적
배송 추적 번호가 등록된 주문에 대해 배송 상태를 자동으로 확인하고,  
상태 변경 시 Supabase를 업데이트하며 고객에게 알림을 발송한다.

### 트리거 유형
- **Schedule**: 매일 2회 (오전 9:00, 오후 3:00 KST)
- 배송 중인 주문에 대해서만 실행

### 활용 배송 추적 API (무료/저비용)

| API | 무료 여부 | 지원 택배사 |
|-----|---------|----------|
| Aftership API | 무료 50건/월 | DHL, EMS, 롯데택배 등 |
| 스마트택배 API | 무료 | 국내 택배 전체 |
| 직접 크롤링 | 완전 무료 | 개별 설정 필요 |

### 모듈 체인

```
[1] Schedule (09:00, 15:00)
    │
    ▼
[2] Supabase - Search Records
    테이블: orders
    필터: status IN ('shipped') AND tracking_number IS NOT NULL
    │
    ▼
[3] Iterator
    배송 중 주문 순회
    │
    ▼
[4] HTTP - Make a Request
    URL: https://api.aftership.com/v4/trackings/{tracking_number}
    Headers: aftership-api-key: {{env.AFTERSHIP_KEY}}
    │
    ▼
[5] JSON - Parse JSON
    current_status, last_checkpoint 추출
    │
    ▼
[6] Router (상태별 분기)
    │
    ├── [delivered] 배송 완료
    │       ▼
    │   [7] Supabase - Update Record
    │       orders.status = 'delivered'
    │       ▼
    │   [8] Email + 카카오 알림톡
    │       "배송이 완료되었습니다"
    │
    └── [in_transit] 배송 중 (체크포인트 변경 시만)
            ▼
        [7'] Supabase - Update Record
            last_checkpoint 업데이트
            ▼
        [8'] Email
            "배송 현황 업데이트"
```

### ops 소비량 추정

| 구분 | 1회 ops | 월 ops (진행 주문 5건 기준) |
|------|---------|----------------------|
| Supabase 조회 | 1 | 62 (2회/일 × 31일) |
| Aftership API (5건) | 5 | 310 |
| Supabase 업데이트 | 1~5 | 31~155 |
| 알림 발송 | 0~5 | 0~155 |
| **합계** | | **~403 ops** |

### 에러 처리

- **Aftership API 한도 초과**: 스마트택배 직접 크롤링으로 폴백
- **추적 번호 오류**: `automation_logs` 기록 + 관리자 알림
- **알림 발송 실패**: 이메일 → 카카오 순으로 폴백

---

## 시나리오 5: 일일 매출 리포트

### 목적
매일 자정 직전에 당일 매출, 주문 현황, 마진을 집계하여  
관리자에게 요약 리포트 이메일을 발송한다.

### 트리거 유형
- **Schedule**: 매일 23:55 KST
- 실행 빈도: 1회/일 → 월 31 실행

### 모듈 체인

```
[1] Schedule (23:55)
    │
    ▼
[2] Supabase - Make an API Call (Custom SQL)
    당일 주문 집계 쿼리 실행:
    SELECT COUNT(*), SUM(total_amount), SUM(actual_margin) ...
    WHERE created_at::date = CURRENT_DATE
    │
    ▼
[3] Supabase - Make an API Call
    미처리 주문 조회:
    SELECT * FROM orders WHERE status IN ('pending', 'sourcing')
    │
    ▼
[4] Supabase - Make an API Call
    당일 신규 후보 상품 조회:
    SELECT COUNT(*) FROM product_candidates WHERE created_at::date = CURRENT_DATE
    │
    ▼
[5] Tools - Set Variable
    리포트 데이터 조합:
    total_orders, revenue, margin, pending_orders, new_candidates
    │
    ▼
[6] Email - Send an Email (Gmail)
    수신: admin@example.com
    제목: [일일 리포트] {DATE} 매출 ₩{revenue}원 / 주문 {orders}건
    본문: HTML 형식 리포트
    │
    ▼
[7] Supabase - Create Record (automation_logs)
    시나리오 실행 기록
```

### 리포트 이메일 템플릿 구조

```html
<h2>📊 일일 매출 리포트 — YYYY-MM-DD</h2>

<table>
  <tr><th>항목</th><th>금액/수량</th></tr>
  <tr><td>총 주문 수</td><td>{total_orders}건</td></tr>
  <tr><td>총 매출</td><td>₩{revenue}</td></tr>
  <tr><td>총 마진</td><td>₩{margin}</td></tr>
  <tr><td>평균 마진율</td><td>{avg_margin_rate}%</td></tr>
</table>

<h3>⚠️ 처리 필요 항목</h3>
<ul>
  <li>미처리 주문: {pending_count}건</li>
  <li>소싱 중: {sourcing_count}건</li>
  <li>가격 검토 필요 상품: {price_review_count}개</li>
</ul>

<h3>🆕 신규 후보 상품</h3>
오늘 수집된 후보: {new_candidates}개
검토 필요 (Score≥70): {high_score_candidates}개
```

### ops 소비량 추정

| 구분 | 1회 ops | 월 ops |
|------|---------|--------|
| Schedule 트리거 | 1 | 31 |
| Supabase API (3회 쿼리) | 3 | 93 |
| 이메일 발송 | 1 | 31 |
| 로그 기록 | 1 | 31 |
| **합계** | **6** | **186 ops** |

---

## 무료 플랜(1,000 ops/월) 운영 분석

### 시나리오별 월 ops 요약

| 시나리오 | 설명 | 월 ops (최적화 후) |
|---------|------|----------------|
| 시나리오 1 | 신상품 수집 (일 5개) | 248 |
| 시나리오 2 | 주문 알림 (20건/월) | 60 |
| 시나리오 3 | 가격 모니터링 (격일, 10상품) | 264 |
| 시나리오 4 | 배송 추적 (5건 진행 중) | 403 |
| 시나리오 5 | 일일 리포트 | 186 |
| **합계** | | **1,161 ops** |

### ops 절감 방안

무료 플랜 1,000 ops 내에서 운영하려면 아래 중 1가지 이상 적용:

| 방안 | 절감량 | 적용 후 합계 |
|------|--------|----------|
| 가격 모니터링 격일 실행 (이미 반영) | -263 | 1,161 |
| 신상품 수집 일 3개로 제한 | -50 | 1,111 |
| 배송 추적 1회/일로 변경 | -155 | 956 ✅ |
| 일일 리포트 주 3회로 변경 | -93 | 863 ✅ |

**권장 초기 설정 (MVP 단계)**:
- 배송 추적: 1회/일 (오전 9:00만)
- 가격 모니터링: 격일
- 신상품 수집: 일 3개 제한
- **예상 월 ops: 약 800-900** → 무료 플랜 내 운영 가능

### Make.com 유료 전환 기준

| 조건 | 액션 |
|------|------|
| 월 주문 50건 초과 | Core 플랜 ($9/월, 10,000 ops) 전환 고려 |
| 상품 30개 이상 가격 모니터링 | Core 플랜 전환 필요 |
| 배송 추적 실시간 전환 | Core 플랜 전환 필요 |

> Core 플랜 전환 시 ROI: 월 50건 주문 × 평균 마진 15,000원 = 750,000원 매출에서 $9 비용은 0.001% 수준

---

## Make.com 설정 가이드

### 환경 변수 (Secrets)

```
SUPABASE_URL: https://{project_id}.supabase.co
SUPABASE_SERVICE_KEY: eyJ... (서비스 롤 키, 절대 프론트에 노출 금지)
GMAIL_FROM: admin@example.com
AFTERSHIP_API_KEY: at_xxxxxxxx
SLACK_WEBHOOK_URL: https://hooks.slack.com/...
KAKAO_REST_API_KEY: xxxx
```

### 공통 에러 핸들러 설정

모든 시나리오에 아래 Error Handler 연결:
1. `automation_logs`에 실패 기록
2. 관리자 이메일 알림 (동일 에러 24시간 내 중복 발송 방지)
3. 연속 3회 실패 시 시나리오 자동 비활성화

### Webhook URL 보안

- Make.com Webhook URL에 쿼리 파라미터로 secret token 추가
- Supabase Database Webhook 헤더에 Authorization 추가
- URL 외부 공개 금지
