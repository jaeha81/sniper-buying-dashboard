-- ============================================================
-- 001_initial.sql  —  Sniper Buying Dashboard initial schema
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- PRODUCTS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                          TEXT        PRIMARY KEY,
  name                        TEXT        NOT NULL,
  category                    TEXT        NOT NULL
    CHECK (category IN ('health','sports','beauty','outdoor','electronics')),
  description                 TEXT        NOT NULL DEFAULT '',
  overseas_price              NUMERIC     NOT NULL DEFAULT 0,        -- USD
  local_shipping_cost         NUMERIC     NOT NULL DEFAULT 0,        -- USD
  international_shipping_cost INT8        NOT NULL DEFAULT 0,        -- KRW
  domestic_expected_price     INT8        NOT NULL DEFAULT 0,        -- KRW
  tax_estimate                INT8        NOT NULL DEFAULT 0,        -- KRW
  payment_fee                 INT8        NOT NULL DEFAULT 0,        -- KRW
  domestic_shipping_cost      INT8        NOT NULL DEFAULT 0,        -- KRW
  other_costs                 INT8        NOT NULL DEFAULT 0,        -- KRW
  total_cost                  INT8        NOT NULL DEFAULT 0,        -- KRW
  expected_margin             INT8        NOT NULL DEFAULT 0,        -- KRW
  margin_rate                 NUMERIC     NOT NULL DEFAULT 0,        -- %
  sniper_score                INT2        NOT NULL DEFAULT 0,        -- 0-100
  risk_level                  TEXT        NOT NULL DEFAULT 'LOW'
    CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
  source_url                  TEXT        NOT NULL DEFAULT '',
  competitor_url              TEXT        NOT NULL DEFAULT '',
  status                      TEXT        NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate','active','paused','discontinued')),
  demand_score                INT2        NOT NULL DEFAULT 1
    CHECK (demand_score BETWEEN 1 AND 5),
  price_competitiveness_score INT2        NOT NULL DEFAULT 1
    CHECK (price_competitiveness_score BETWEEN 1 AND 5),
  shipping_stability_score    INT2        NOT NULL DEFAULT 1
    CHECK (shipping_stability_score BETWEEN 1 AND 5),
  competition_level           TEXT        NOT NULL DEFAULT 'medium'
    CHECK (competition_level IN ('low','medium','high')),
  page_convincing_score       INT2        NOT NULL DEFAULT 1
    CHECK (page_convincing_score BETWEEN 1 AND 5),
  automation_score            INT2        NOT NULL DEFAULT 1
    CHECK (automation_score BETWEEN 1 AND 5),
  image_url                   TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- ORDERS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       TEXT        NOT NULL,
  product_name     TEXT        NOT NULL,
  quantity         INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price       INT8        NOT NULL DEFAULT 0,   -- KRW
  total_price      INT8        NOT NULL DEFAULT 0,   -- KRW
  status           TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ordered','shipping','delivered','cancelled')),
  customer_name    TEXT        NOT NULL,
  customer_email   TEXT        NOT NULL,
  customs_id       TEXT,
  shipping_address TEXT        NOT NULL,
  payment_method   TEXT        NOT NULL DEFAULT 'card',
  payment_key      TEXT,
  requests         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- CUSTOMERS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL UNIQUE,
  phone        TEXT,
  address      TEXT,
  total_orders INTEGER     NOT NULL DEFAULT 0,
  total_spent  INT8        NOT NULL DEFAULT 0,   -- KRW
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- AUTO-UPDATE updated_at trigger
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────
ALTER TABLE products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- products: anyone can read, service_role can write
CREATE POLICY "products_select_anon"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "products_all_service"
  ON products FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- orders: service_role only (inserts from API server-side)
CREATE POLICY "orders_all_service"
  ON orders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- customers: service_role only
CREATE POLICY "customers_all_service"
  ON customers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ──────────────────────────────────────────────────────────
-- SEED: 5 sample products
-- ──────────────────────────────────────────────────────────
INSERT INTO products (
  id, name, category, description,
  overseas_price, local_shipping_cost, international_shipping_cost,
  domestic_expected_price, tax_estimate, payment_fee,
  domestic_shipping_cost, other_costs, total_cost,
  expected_margin, margin_rate, sniper_score, risk_level,
  source_url, competitor_url, status,
  demand_score, price_competitiveness_score, shipping_stability_score,
  competition_level, page_convincing_score, automation_score
) VALUES
(
  'prod-001',
  '나우푸즈 비타민D3 5000IU 240소프트젤',
  'health',
  'iHerb 베스트셀러 비타민D3. 면역력 및 뼈 건강 지원. 올리브오일 기반 흡수율 우수. 국내 동일 제품 대비 가격 경쟁력 높음.',
  12.5, 2.0, 4500,
  35000, 0, 700,
  3000, 500, 24575,
  10425, 29.8, 78, 'LOW',
  'https://www.iherb.com/pr/now-foods-vitamin-d-3-5-000-iu/14888',
  'https://www.coupang.com/vp/products/now-foods-vitamin-d3',
  'active',
  5, 4, 4, 'medium', 4, 4
),
(
  'prod-002',
  '옵티멈 뉴트리션 골드 스탠다드 웨이 프로틴 5파운드 더블 초콜릿',
  'health',
  '세계 1위 프로틴 브랜드. ON 골드 스탠다드 5lbs. 서빙당 24g 단백질. Amazon 정품 인증. 국내 판매가 대비 35% 저렴.',
  45.0, 5.0, 8000,
  110000, 6750, 2200,
  3000, 1000, 87700,
  22300, 20.3, 72, 'LOW',
  'https://www.amazon.com/Optimum-Nutrition-Standard-Protein-Chocolate/dp/B000QSNYGI',
  'https://www.coupang.com/vp/products/ON-whey-protein',
  'active',
  5, 4, 3, 'high', 4, 3
),
(
  'prod-003',
  '요가매트 TPE 6mm 논슬립 친환경 에코 요가매트',
  'sports',
  '친환경 TPE 소재 6mm 두께. 양면 논슬립 처리. 183x61cm 표준 사이즈. 수분흡수력 뛰어남. 최근 홈트 수요 급증 아이템.',
  28.0, 3.5, 5500,
  65000, 4050, 1300,
  3000, 500, 47125,
  17875, 27.5, 75, 'LOW',
  'https://www.amazon.com/yoga-mat-tpe-6mm/dp/example',
  'https://www.coupang.com/vp/products/yoga-mat-tpe',
  'active',
  4, 4, 3, 'medium', 3, 4
),
(
  'prod-004',
  '세라비 스킨케어 비타민C 세럼 30ml',
  'beauty',
  'CeraVe 피부과 추천 브랜드. 10% 비타민C + 히알루론산. 피부 톤 개선 및 보습. 민감성 피부 적합. iHerb 인기 미국 직구 아이템.',
  15.0, 2.0, 4000,
  42000, 0, 840,
  3000, 500, 28590,
  13410, 31.9, 82, 'LOW',
  'https://www.iherb.com/pr/cerave-vitamin-c-serum/123456',
  'https://www.coupang.com/vp/products/cerave-vitamin-c',
  'active',
  5, 5, 4, 'medium', 5, 4
),
(
  'prod-005',
  '저항밴드 세트 5단계 강도 운동 탄성밴드',
  'sports',
  '5가지 강도 라텍스 저항밴드 세트. 홈트, 물리치료, 스트레칭 다목적. 수납파우치 포함. 부피 작아 배송비 유리. 재구매율 높음.',
  19.9, 2.5, 3500,
  38000, 2880, 760,
  3000, 300, 26825,
  11175, 29.4, 74, 'LOW',
  'https://www.amazon.com/resistance-bands-set-5-levels/dp/example',
  'https://www.coupang.com/vp/products/resistance-bands',
  'active',
  4, 4, 4, 'medium', 3, 5
)
ON CONFLICT (id) DO NOTHING;
