# Sniper Buying Dashboard — 데이터베이스 스키마 설계서

> Supabase PostgreSQL 기반 | RLS 적용 | Edge Functions 활용  
> 최종 수정: 2026-05-26

---

## 1. 테이블 목록 개요

| 테이블명 | 설명 | 주요 관계 |
|---------|------|---------|
| `products` | 승인된 판매 상품 목록 | ← product_candidates |
| `product_candidates` | 신규 발굴 상품 후보 | → products |
| `orders` | 고객 주문 마스터 | ← customers, → order_items |
| `order_items` | 주문 상품 상세 라인 | → orders, products |
| `customers` | 고객 정보 | → orders |
| `margin_logs` | 가격 변동 이력 | → products |
| `automation_logs` | Make.com 자동화 실행 이력 | |
| `settings` | 시스템 설정 키-값 저장소 | |

---

## 2. 테이블 상세 스키마

### 2.1 products (판매 상품)

```sql
CREATE TABLE products (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        VARCHAR(255) NOT NULL,
    category                    VARCHAR(100) NOT NULL,
    description                 TEXT,
    overseas_price              NUMERIC(10, 2) NOT NULL,       -- 해외 구매가 (USD)
    local_shipping_cost         NUMERIC(10, 2) DEFAULT 0,       -- 현지 배송비 (USD)
    international_shipping_cost NUMERIC(10, 2) NOT NULL,        -- 국제 배송비 (KRW)
    domestic_expected_price     NUMERIC(10, 2),                 -- 국내 예상 판매가 (KRW)
    tax_estimate                NUMERIC(10, 2) DEFAULT 0,       -- 관부가세 추정 (KRW)
    payment_fee                 NUMERIC(10, 2) DEFAULT 0,       -- 결제 수수료 (KRW)
    total_cost                  NUMERIC(10, 2) GENERATED ALWAYS AS (
                                    overseas_price * 1350  -- 환율 고정값, 실제로는 settings 참조
                                    + local_shipping_cost * 1350
                                    + international_shipping_cost
                                    + tax_estimate
                                    + payment_fee
                                ) STORED,
    expected_margin             NUMERIC(10, 2),                 -- 예상 마진 (KRW)
    margin_rate                 NUMERIC(5, 2),                  -- 마진율 (%)
    sniper_score                INTEGER DEFAULT 0 CHECK (sniper_score BETWEEN 0 AND 100),
    risk_level                  VARCHAR(10) CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    source_url                  TEXT,                           -- 소싱지 URL
    competitor_url              TEXT,                           -- 경쟁사 URL
    status                      VARCHAR(30) DEFAULT 'active'
                                    CHECK (status IN (
                                        'active', 'inactive', 'out_of_stock',
                                        'price_review', 'discontinued'
                                    )),
    image_url                   TEXT,
    weight_kg                   NUMERIC(5, 3),                  -- 무게 (kg)
    hs_code                     VARCHAR(20),                    -- 관세 HS 코드
    customs_category            VARCHAR(100),                   -- 통관 카테고리
    candidate_id                UUID REFERENCES product_candidates(id),
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_sniper_score ON products(sniper_score DESC);
CREATE INDEX idx_products_margin_rate ON products(margin_rate DESC);

-- updated_at 자동 갱신 트리거
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.2 product_candidates (상품 후보)

```sql
CREATE TABLE product_candidates (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        VARCHAR(255) NOT NULL,
    category                    VARCHAR(100),
    description                 TEXT,
    overseas_price              NUMERIC(10, 2),
    source_url                  TEXT,
    competitor_url              TEXT,
    sniper_score                INTEGER DEFAULT 0,
    risk_level                  VARCHAR(10) DEFAULT 'MEDIUM',
    status                      VARCHAR(30) DEFAULT 'pending'
                                    CHECK (status IN (
                                        'pending', 'review_required', 'approved',
                                        'rejected', 'low_priority'
                                    )),
    -- Sniper Score 세부 항목
    score_domestic_demand       INTEGER DEFAULT 0 CHECK (score_domestic_demand BETWEEN 0 AND 20),
    score_price_competitiveness INTEGER DEFAULT 0 CHECK (score_price_competitiveness BETWEEN 0 AND 20),
    score_margin_rate           INTEGER DEFAULT 0 CHECK (score_margin_rate BETWEEN 0 AND 20),
    score_shipping_stability    INTEGER DEFAULT 0 CHECK (score_shipping_stability BETWEEN 0 AND 15),
    score_customs_risk_inv      INTEGER DEFAULT 0 CHECK (score_customs_risk_inv BETWEEN 0 AND 10),
    score_competition_inv       INTEGER DEFAULT 0 CHECK (score_competition_inv BETWEEN 0 AND 5),
    score_page_persuasion       INTEGER DEFAULT 0 CHECK (score_page_persuasion BETWEEN 0 AND 5),
    score_automation_fit        INTEGER DEFAULT 0 CHECK (score_automation_fit BETWEEN 0 AND 5),
    -- 메타
    sourced_by                  VARCHAR(50) DEFAULT 'make_automation',
    reviewer_notes              TEXT,
    reviewed_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_candidates_status ON product_candidates(status);
CREATE INDEX idx_candidates_sniper_score ON product_candidates(sniper_score DESC);
CREATE INDEX idx_candidates_created_at ON product_candidates(created_at DESC);
```

### 2.3 customers (고객)

```sql
CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) UNIQUE NOT NULL,
    name                VARCHAR(100),
    phone               VARCHAR(20),
    -- 개인통관고유번호 (암호화 저장 권장)
    customs_personal_id VARCHAR(20),
    -- 기본 배송지
    default_address     JSONB,
    -- 카카오 알림톡 연동
    kakao_linked        BOOLEAN DEFAULT FALSE,
    kakao_user_key      VARCHAR(100),
    -- 마케팅 동의
    marketing_agreed    BOOLEAN DEFAULT FALSE,
    marketing_agreed_at TIMESTAMPTZ,
    -- 통계
    total_orders        INTEGER DEFAULT 0,
    total_spent         NUMERIC(12, 2) DEFAULT 0,
    last_order_at       TIMESTAMPTZ,
    last_email_sent     TIMESTAMPTZ,
    -- Supabase Auth 연동
    auth_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_auth_user_id ON customers(auth_user_id);
```

### 2.4 orders (주문 마스터)

```sql
CREATE TABLE orders (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number                VARCHAR(30) UNIQUE NOT NULL
                                    DEFAULT ('ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*9999)::TEXT, 4, '0')),
    customer_id                 UUID NOT NULL REFERENCES customers(id),
    status                      VARCHAR(30) DEFAULT 'pending'
                                    CHECK (status IN (
                                        'pending', 'sourcing', 'purchased',
                                        'shipped', 'delivered', 'completed',
                                        'cancelled', 'return_requested', 'returned'
                                    )),
    -- 금액 정보
    subtotal                    NUMERIC(10, 2) NOT NULL,
    shipping_fee                NUMERIC(10, 2) DEFAULT 0,
    discount_amount             NUMERIC(10, 2) DEFAULT 0,
    total_amount                NUMERIC(10, 2) NOT NULL,
    -- 결제 정보
    payment_method              VARCHAR(50),
    payment_status              VARCHAR(20) DEFAULT 'pending'
                                    CHECK (payment_status IN ('pending', 'paid', 'refunded', 'partial_refund')),
    paid_at                     TIMESTAMPTZ,
    -- 배송 정보
    shipping_address            JSONB NOT NULL,               -- {name, phone, zipcode, address1, address2}
    customs_personal_id         VARCHAR(20),                  -- 개인통관고유번호
    tracking_number             VARCHAR(100),
    shipping_carrier            VARCHAR(50),
    -- 소싱 정보
    sourcing_cost               NUMERIC(10, 2),               -- 실제 소싱 원가
    actual_margin               NUMERIC(10, 2),               -- 실제 마진
    sourcing_memo               TEXT,
    -- 메타
    admin_notes                 TEXT,
    cancelled_at                TIMESTAMPTZ,
    cancel_reason               TEXT,
    completed_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_order_number ON orders(order_number);
```

### 2.5 order_items (주문 상품 라인)

```sql
CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    product_name    VARCHAR(255) NOT NULL,    -- 주문 시점 상품명 스냅샷
    product_image   TEXT,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(10, 2) NOT NULL,  -- 주문 시점 판매가
    unit_cost       NUMERIC(10, 2),           -- 주문 시점 원가
    options         JSONB,                    -- {size, flavor, etc.}
    total_price     NUMERIC(10, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
```

### 2.6 margin_logs (가격 변동 이력)

```sql
CREATE TABLE margin_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    -- 변동 전/후
    previous_price      NUMERIC(10, 2) NOT NULL,
    current_price       NUMERIC(10, 2) NOT NULL,
    change_rate         NUMERIC(6, 2) NOT NULL,         -- 변동률 (%)
    previous_margin     NUMERIC(10, 2),
    current_margin      NUMERIC(10, 2),
    -- 분석
    change_type         VARCHAR(20) CHECK (change_type IN ('increase', 'decrease', 'stable')),
    alert_sent          BOOLEAN DEFAULT FALSE,
    alert_severity      VARCHAR(10) CHECK (alert_severity IN ('info', 'warning', 'critical')),
    -- 환율 정보
    exchange_rate_used  NUMERIC(8, 2),                  -- KRW/USD
    checked_at          TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_margin_logs_product_id ON margin_logs(product_id);
CREATE INDEX idx_margin_logs_checked_at ON margin_logs(checked_at DESC);
CREATE INDEX idx_margin_logs_change_type ON margin_logs(change_type);
```

### 2.7 automation_logs (자동화 실행 이력)

```sql
CREATE TABLE automation_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_name   VARCHAR(100) NOT NULL,              -- Make.com 시나리오명
    scenario_id     VARCHAR(50),                        -- Make.com 시나리오 ID
    trigger_type    VARCHAR(50),                        -- schedule / webhook / manual
    status          VARCHAR(20) DEFAULT 'running'
                        CHECK (status IN ('running', 'success', 'failed', 'partial')),
    ops_consumed    INTEGER DEFAULT 0,
    -- 처리 결과
    records_processed   INTEGER DEFAULT 0,
    records_created     INTEGER DEFAULT 0,
    records_updated     INTEGER DEFAULT 0,
    records_failed      INTEGER DEFAULT 0,
    -- 오류 정보
    error_message   TEXT,
    error_detail    JSONB,
    -- 실행 시간
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER GENERATED ALWAYS AS (
                        EXTRACT(MILLISECONDS FROM (completed_at - started_at))::INTEGER
                    ) STORED,
    -- 메타
    payload         JSONB,                              -- 입력 데이터 스냅샷
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_automation_logs_scenario_name ON automation_logs(scenario_name);
CREATE INDEX idx_automation_logs_status ON automation_logs(status);
CREATE INDEX idx_automation_logs_started_at ON automation_logs(started_at DESC);
```

### 2.8 settings (시스템 설정)

```sql
CREATE TABLE settings (
    key             VARCHAR(100) PRIMARY KEY,
    value           TEXT NOT NULL,
    value_type      VARCHAR(20) DEFAULT 'string'
                        CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
    description     TEXT,
    is_secret       BOOLEAN DEFAULT FALSE,              -- 비밀값 여부 (마스킹 처리)
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_by      VARCHAR(100)
);

-- 기본 설정값 삽입
INSERT INTO settings (key, value, value_type, description) VALUES
    ('exchange_rate_usd_krw', '1350', 'number', 'USD/KRW 환율'),
    ('price_alert_threshold', '10', 'number', '가격 변동 알림 임계값 (%)'),
    ('price_auto_deactivate_threshold', '30', 'number', '자동 비활성화 임계값 (%)'),
    ('sniper_score_threshold', '70', 'number', '관리자 검토 대상 최소 Sniper Score'),
    ('default_shipping_fee', '4900', 'number', '기본 국내 배송비 (KRW)'),
    ('free_shipping_threshold', '50000', 'number', '무료 배송 기준 금액 (KRW)'),
    ('admin_email', 'admin@example.com', 'string', '관리자 이메일'),
    ('kakao_template_code_shipped', 'TM_SHIPPED_01', 'string', '배송 시작 알림톡 템플릿 코드');
```

---

## 3. 공통 유틸리티 함수

```sql
-- updated_at 자동 갱신 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 모든 테이블에 트리거 적용
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_candidates_updated_at
    BEFORE UPDATE ON product_candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 4. RLS (Row Level Security) 정책

### 4.1 RLS 활성화

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
```

### 4.2 products 정책

```sql
-- 일반 사용자: active 상품만 읽기
CREATE POLICY "products_public_read" ON products
    FOR SELECT USING (status = 'active');

-- 서비스 롤 (Make.com): 전체 읽기/쓰기
CREATE POLICY "products_service_all" ON products
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 인증된 관리자: 전체 접근
CREATE POLICY "products_admin_all" ON products
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

### 4.3 orders 정책

```sql
-- 고객: 본인 주문만 읽기
CREATE POLICY "orders_customer_read" ON orders
    FOR SELECT TO authenticated
    USING (
        customer_id IN (
            SELECT id FROM customers WHERE auth_user_id = auth.uid()
        )
    );

-- 서비스 롤: 전체 접근 (Make.com, Edge Functions)
CREATE POLICY "orders_service_all" ON orders
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 관리자: 전체 접근
CREATE POLICY "orders_admin_all" ON orders
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

### 4.4 customers 정책

```sql
-- 고객: 본인 정보만 읽기/수정 (개인통관고유번호 보호)
CREATE POLICY "customers_self_read" ON customers
    FOR SELECT TO authenticated
    USING (auth_user_id = auth.uid());

CREATE POLICY "customers_self_update" ON customers
    FOR UPDATE TO authenticated
    USING (auth_user_id = auth.uid())
    WITH CHECK (auth_user_id = auth.uid());

-- 서비스 롤: 전체 접근
CREATE POLICY "customers_service_all" ON customers
    FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 4.5 settings 정책

```sql
-- 비밀값(is_secret=true)은 서비스 롤만 접근
CREATE POLICY "settings_public_read" ON settings
    FOR SELECT USING (is_secret = false);

CREATE POLICY "settings_service_all" ON settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "settings_admin_write" ON settings
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

---

## 5. 주요 쿼리 예시

### 5.1 Sniper Score 상위 10 상품 조회

```sql
SELECT
    p.id,
    p.name,
    p.category,
    p.overseas_price,
    p.total_cost,
    p.domestic_expected_price,
    p.expected_margin,
    p.margin_rate,
    p.sniper_score,
    p.risk_level,
    p.status
FROM products p
WHERE p.status = 'active'
ORDER BY p.sniper_score DESC, p.margin_rate DESC
LIMIT 10;
```

### 5.2 마진율 구간별 상품 분포 조회

```sql
SELECT
    CASE
        WHEN margin_rate >= 40 THEN '40% 이상 (우량)'
        WHEN margin_rate >= 30 THEN '30-40% (양호)'
        WHEN margin_rate >= 20 THEN '20-30% (보통)'
        WHEN margin_rate >= 10 THEN '10-20% (저마진)'
        ELSE '10% 미만 (손익 주의)'
    END AS margin_group,
    COUNT(*) AS product_count,
    AVG(sniper_score) AS avg_sniper_score
FROM products
WHERE status = 'active'
GROUP BY margin_group
ORDER BY MIN(margin_rate) DESC;
```

### 5.3 월별 주문 및 매출 집계

```sql
SELECT
    DATE_TRUNC('month', o.created_at) AS month,
    COUNT(DISTINCT o.id) AS order_count,
    COUNT(DISTINCT o.customer_id) AS customer_count,
    SUM(o.total_amount) AS gross_revenue,
    SUM(o.sourcing_cost) AS total_cost,
    SUM(o.actual_margin) AS total_margin,
    ROUND(AVG(o.actual_margin / NULLIF(o.total_amount, 0) * 100), 2) AS avg_margin_rate
FROM orders o
WHERE o.status IN ('completed', 'delivered')
  AND o.created_at >= DATE_TRUNC('year', NOW())
GROUP BY DATE_TRUNC('month', o.created_at)
ORDER BY month DESC;
```

### 5.4 최근 가격 변동이 큰 상품 조회

```sql
SELECT
    p.name,
    p.category,
    ml.previous_price,
    ml.current_price,
    ml.change_rate,
    ml.alert_severity,
    ml.checked_at
FROM margin_logs ml
JOIN products p ON p.id = ml.product_id
WHERE ml.checked_at >= NOW() - INTERVAL '7 days'
  AND ABS(ml.change_rate) >= 10
ORDER BY ABS(ml.change_rate) DESC
LIMIT 20;
```

### 5.5 고객별 구매 통계 (VIP 분석)

```sql
SELECT
    c.name,
    c.email,
    c.total_orders,
    c.total_spent,
    ROUND(c.total_spent / NULLIF(c.total_orders, 0), 0) AS avg_order_value,
    c.last_order_at,
    EXTRACT(DAY FROM NOW() - c.last_order_at) AS days_since_last_order
FROM customers c
WHERE c.total_orders > 0
ORDER BY c.total_spent DESC
LIMIT 50;
```

---

## 6. Supabase Edge Functions 활용 포인트

### 6.1 calculate-sniper-score

```
트리거: product_candidates INSERT
역할: Sniper Score 8개 항목 자동 계산 후 sniper_score 필드 업데이트
위치: supabase/functions/calculate-sniper-score/index.ts
```

핵심 로직:
- `overseas_price` 기반 가격경쟁력 점수 계산
- `risk_level` 기반 통관리스크 역점수 부여
- 계산된 score >= threshold(settings 참조) 이면 status = 'review_required' 설정

### 6.2 order-webhook-relay

```
트리거: orders INSERT / orders.status UPDATE
역할: Make.com 웹훅 엔드포인트로 이벤트 포워딩
위치: supabase/functions/order-webhook-relay/index.ts
```

### 6.3 update-customer-stats

```
트리거: orders.status = 'completed' UPDATE
역할: customers.total_orders, total_spent, last_order_at 집계 갱신
위치: supabase/functions/update-customer-stats/index.ts
```

### 6.4 price-sync

```
트리거: HTTP 요청 (Make.com에서 호출)
역할: 상품 가격 업데이트 + margin_logs 기록 + 임계치 초과 시 알림
위치: supabase/functions/price-sync/index.ts
```
