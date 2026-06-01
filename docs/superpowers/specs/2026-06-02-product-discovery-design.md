# 상품 자동 발굴 & 수익 보호 자동화 설계

**날짜:** 2026-06-02  
**목표:** 관리자가 10분 안에 좋은 상품을 판단하고 결정할 수 있게 만드는 자동화  
**검수:** Codex FAIL → 3단계 수집 모델 + 큐 기반 배치 + 경보 시스템으로 재설계  

---

## 핵심 원칙

- **완전 자동화 금지** — 판매 결정·가격 설정·구매 집행은 반드시 사람이 확인
- **수익 보호 우선** — AI 추출 오류, 환율 급변, 통관 리스크가 손실로 이어지지 않도록 게이트 설치
- **자동화 범위** — 정보 수집·계산·경보의 자동화. 의사결정은 관리자

---

## 자동화 범위 확정

| 구분 | 자동화 | 사람 결정 |
|------|--------|-----------|
| 상품 후보 수집 | ✅ | |
| 마진/Sniper Score 계산 | ✅ | |
| 환율 실시간 반영 | ✅ | |
| 가격·마진 변동 경보 | ✅ | |
| 판매 결정 (active 전환) | | ✅ |
| 국내 판매가 설정 | | ✅ |
| 실제 구매 집행 | | ✅ |
| 통관 위험 상품 취급 여부 | | ✅ |
| 클레임·환불 처리 | | ✅ |

---

## 시스템 구조: 4개 모듈

### 모듈 1 — 상품 발굴 (정보 수집)

**입력:** URL 직접 입력 or 카테고리 자동 스캔 (iHerb, Amazon, Vitacost, Costco 등)

**파이프라인:**
```
URL 입력 or 카테고리 스캔 요청
    ↓
scan_jobs 테이블 저장 → 즉시 200 응답 (타임아웃 우회)
    ↓
Make.com Webhook or Vercel Cron (5분 간격) → scan_items 1개씩 처리
    ↓
Firecrawl API → 정제된 Markdown
    ↓
OpenRouter AI → 구조화 추출 (상품명/가격/카테고리/리뷰수/평점)
  + confidence score 저장 + evidence span 보관
    ↓
가격 검증 게이트:
  - confidence < 0.7 → raw_candidates 저장 후 중단 (사유 기록)
  - 가격 범위 이상 ($0 or $10,000 초과) → 거부
  - 중복 URL → DB unique 제약으로 차단
    ↓
검증 통과 → 마진 계산 (실시간 환율 적용)
    ↓
products 테이블 (status: 'candidate') 저장
    ↓
에이전트 스캔 → review_candidate 태스크 생성 (top-20 제한)
    ↓
Slack 알림: "N개 후보 발굴 완료"
```

**소스별 처리:**
- iHerb: Firecrawl direct (봇 차단 낮음)
- Amazon: Firecrawl (프록시 자동 처리)
- Vitacost / Costco / 기타: Firecrawl

---

### 모듈 2 — 실시간 마진 계산

**문제:** 기존 환율 고정값 `1350` → 실제 환율과 괴리 발생 시 마진 오류

**변경:**
- 상품 저장 시점 환율 `/api/exchange-rate` 호출 → `price_snapshots` 테이블에 기록
- `products.exchange_rate_snapshot` 컬럼 추가
- 환율 변동 ±3% 이상 발생 시 → 판매중(`active`) 상품 전체 마진 재계산 job 실행
- 재계산 결과 마진율 15% 미만 → `agent_findings` (critical) + Slack 경보

**마진 계산 기본값 (수정 가능):**
```
internationalShippingCost: 5,000 KRW
domesticShippingCost: 3,000 KRW
localShippingCost: $3.00 (iHerb 기준)
paymentFee: 해외원가(KRW) × 2.5%
관세: 카테고리별 기존 getRiskLevel() 로직 활용
```

---

### 모듈 3 — 경보 시스템

**스캔 주기:** 매일 1회 (Make.com 스케줄 — 기존 연동 활용)

**경보 조건:**
| 조건 | 심각도 | 액션 |
|------|--------|------|
| 판매중 상품 마진율 15% 미만 | critical | Slack + agent_findings |
| 환율 ±3% 이상 변동 | warning | 마진 재계산 + Slack |
| raw_candidate confidence 낮은 건 누적 10개 이상 | warning | Slack (AI 추출 품질 저하) |
| 태스크 pending 24시간 이상 방치 | warning | Slack |

**태스크 폭발 방지:**
- `review_candidate` 태스크 생성 시 Sniper Score 상위 20개만 태스크화
- 나머지는 `candidate` 상태로 대기 (백로그)
- 우선순위: Sniper Score + 예상 월마진 + confidence 복합 산정

---

### 모듈 4 — 관리자 의사결정 대시보드

**경로:** `/admin/discover`

**UI 구성:**
```
┌─────────────────────────────────────┐
│ 상품 발굴                            │
│ [URL 입력 분석]  [카테고리 스캔 설정] │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 검증된 후보 (Sniper Score 순)        │
│                                     │
│ #1 나우푸즈 비타민D3    Score: 78    │
│    원가 ₩16,875 / 판매가 ₩35,000   │
│    마진율 29.8% / 리스크 LOW        │
│    [쿠팡 최저가 확인] [Approve] [제외]│
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 스캔 현황 (진행중 / 완료 / 실패)     │
└─────────────────────────────────────┘
```

---

## DB 추가 테이블

### raw_candidates
```sql
id, source_url, source_site, raw_markdown TEXT,
extracted_data JSONB,        -- AI 추출 원문
confidence NUMERIC,          -- 0.0 ~ 1.0
validation_status TEXT,      -- 'pending' | 'passed' | 'failed'
validation_errors JSONB,     -- 실패 사유
created_at TIMESTAMPTZ
```

### scan_jobs
```sql
id, job_type TEXT,           -- 'url' | 'category_scan'
source_site TEXT,            -- 'iherb' | 'amazon' | 'vitacost' | 'costco' | 'other'
category TEXT,
target_url TEXT,
status TEXT,                 -- 'queued' | 'running' | 'completed' | 'failed'
total_items INT,
processed_items INT,
created_at, completed_at TIMESTAMPTZ
```

### scan_items
```sql
id, job_id UUID REFERENCES scan_jobs,
url TEXT, status TEXT,       -- 'queued' | 'processing' | 'done' | 'failed'
result_product_id UUID,      -- 성공 시 products.id
error_message TEXT,
created_at TIMESTAMPTZ
```

### price_snapshots
```sql
id, product_id UUID REFERENCES products,
exchange_rate NUMERIC,
overseas_price NUMERIC,
total_cost NUMERIC,
margin_rate NUMERIC,
sniper_score INT,
recorded_at TIMESTAMPTZ
```

---

## 기존 DB 변경

### products 테이블 추가 컬럼
```sql
exchange_rate_snapshot NUMERIC,   -- 저장 시점 환율
ai_confidence NUMERIC,            -- AI 추출 confidence
raw_candidate_id UUID,            -- raw_candidates 참조
source_site TEXT,                 -- 'iherb' | 'amazon' | ...
```

### unique 제약 추가
```sql
ALTER TABLE products ADD CONSTRAINT products_source_url_unique UNIQUE (source_url);
```

---

## Vercel 타임아웃 해결 전략

| 엔드포인트 | 처리 방식 | 예상 시간 |
|-----------|-----------|----------|
| `POST /api/discover/url` | 단건 직접 처리 | ~15초 (Pro plan) |
| `POST /api/discover/scan` | scan_jobs 저장 후 즉시 응답 | <1초 |
| `POST /api/discover/process` | scan_items 1개 처리 (Make.com 호출) | ~15초 |
| `GET /api/discover/jobs` | 스캔 현황 조회 | <1초 |

카테고리 스캔은 Make.com이 `/api/discover/process`를 item 수만큼 순차 호출하여 처리.

---

## 구현 순서 (4 Phase)

| Phase | 내용 | 선행 조건 |
|-------|------|----------|
| P1 | DB 마이그레이션 (raw_candidates, scan_jobs, scan_items, price_snapshots) | 없음 |
| P2 | 단건 URL 분석 API + 환율 실시간 연동 | P1 |
| P3 | 카테고리 스캔 큐 + Make.com 연동 | P2 |
| P4 | /admin/discover UI + 경보 시스템 | P3 |

---

## 빠진 것 (의도적으로 제외)

- **쿠팡/네이버 자동 등록**: 플랫폼 정책 위반 가능성 → 관리자 수동 등록
- **자동 구매 집행**: 손실 위험 → 관리자 확인 후 수동 실행
- **AI 수요 예측**: 데이터 부족 단계에서는 신뢰 불가 → demandScore는 리뷰수/평점 기반 규칙으로 산출
