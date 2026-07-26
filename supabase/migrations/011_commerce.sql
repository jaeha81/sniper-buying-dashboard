-- ============================================================
-- 011_commerce.sql
-- P2: 콘텐츠·등록·주문·배송·정산·수익 (지시서 §13·§15)
--
-- 여기가 수익이 발생하는 구간이다. 지금까지는 상품을 찾고 판단하는
-- 기능만 있었고, 팔 곳(listings)도 돈을 계산할 근거(settlements)도
-- 없었다. 그래서 파이프라인이 완벽하게 돌아도 매출은 0이었다.
--
-- 핵심 설계 판단:
--   1. 예상(margin_calculations)과 실현(settlements)을 분리한다.
--      지시서 §15 "예상 vs 실현 마진과 오차 원인"을 내려면 둘이 각각
--      남아 있어야 한다.
--   2. profit_daily는 집계 캐시일 뿐 정본이 아니다. 정본은 orders +
--      settlements + expenses다. 지시서 §18 "수익은 주문·정산·비용에서
--      계산한다."
--   3. listings 상태 전이는 승인 없이 published로 갈 수 없다.
--
-- 비파괴: 신규 테이블만 추가한다.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- CONTENT ASSETS — 등록용 콘텐츠 (콘텐츠 담당 산출물)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_assets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     TEXT        NOT NULL,
  asset_type     TEXT        NOT NULL
    CHECK (asset_type IN ('title','description','attributes','faq','image_brief','keywords')),
  locale         TEXT        NOT NULL DEFAULT 'ko-KR',
  content        TEXT        NOT NULL,
  -- LLM 생성이면 어떤 모델·프롬프트였는지
  model          TEXT,
  prompt_version TEXT,
  confidence     NUMERIC     NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  -- 사람이 검수했는지. 미검수 콘텐츠로 등록하지 않는다.
  reviewed       BOOLEAN     NOT NULL DEFAULT FALSE,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_assets_product_idx
  ON content_assets(product_id, asset_type, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- LISTINGS — 채널 등록 (상품등록 담당)
--
-- 상태 전이: draft → pending_approval → approved → publishing
--          → published → paused | ended
-- published로 가려면 반드시 approved를 지나야 한다. 이건 CHECK로
-- 강제할 수 없으므로 애플리케이션(lib/listing-engine.ts)과 승인
-- 게이트에서 막고, 여기서는 감사 가능하도록 이력을 남긴다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       TEXT        NOT NULL,
  channel          TEXT        NOT NULL
    CHECK (channel IN ('coupang','naver','eleven','gmarket','own_store','other')),
  -- 채널이 부여한 상품 ID. 등록 성공 후에만 채워진다.
  external_id      TEXT,
  external_url     TEXT,

  status           TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','publishing','published','paused','ended','failed')),

  -- 등록 시점의 판매가. 이후 가격 변경은 price_change 승인을 거친다.
  listed_price     INT8        NOT NULL DEFAULT 0,
  -- 이 등록이 근거한 승인·판정
  approval_id      UUID        REFERENCES approvals(id) ON DELETE SET NULL,
  bucky_decision_id UUID       REFERENCES bucky_decisions(id) ON DELETE SET NULL,
  margin_calculation_id UUID   REFERENCES margin_calculations(id) ON DELETE SET NULL,

  payload          JSONB,
  error_message    TEXT,

  published_at     TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 한 상품이 같은 채널에 두 번 살아 있을 수 없다.
CREATE UNIQUE INDEX IF NOT EXISTS listings_product_channel_active_unique
  ON listings(product_id, channel)
  WHERE status IN ('draft','pending_approval','approved','publishing','published','paused');

CREATE INDEX IF NOT EXISTS listings_status_idx  ON listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_channel_idx ON listings(channel, status);

CREATE TRIGGER listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- LISTING EVENTS — 등록 상태 전이 이력 (append-only)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listing_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT        NOT NULL,
  actor_type  TEXT        NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('owner','operator','autonomy','automation','system')),
  actor_id    TEXT,
  reason      TEXT,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_events_listing_idx
  ON listing_events(listing_id, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- ORDER ITEMS — 주문 품목
--
-- 007에서 다건 주문을 orders 여러 행으로 쪼갰다. 그건 임시 구조였다.
-- 이제 주문 1건 = orders 1행, 품목 N개 = order_items N행이 정본이다.
-- 기존 orders 행은 그대로 두고(비파괴), 신규 주문만 이 구조를 쓴다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   TEXT        NOT NULL,
  listing_id   UUID        REFERENCES listings(id) ON DELETE SET NULL,
  product_name TEXT        NOT NULL,
  quantity     INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price   INT8        NOT NULL DEFAULT 0,
  total_price  INT8        NOT NULL DEFAULT 0,
  -- 이 품목의 예상 원가. 실현 손익 대조의 기준이 된다.
  expected_unit_cost INT8  NOT NULL DEFAULT 0,
  margin_calculation_id UUID REFERENCES margin_calculations(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_items_order_idx   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- SHIPMENTS — 배송
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  leg             TEXT        NOT NULL DEFAULT 'domestic'
    CHECK (leg IN ('local','international','domestic')),
  carrier         TEXT,
  tracking_number TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_transit','customs','delivered','delayed','lost','returned')),
  -- 지연 감지용. 이 시각을 넘기면 주문·배송 담당이 예외 Task를 만든다.
  expected_at     TIMESTAMPTZ,
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  cost            INT8        NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipments_order_idx  ON shipments(order_id);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON shipments(status, expected_at);

CREATE TRIGGER shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- RETURNS / REFUNDS — 반품과 환불
--
-- 환불은 비가역이라 승인 게이트를 거친다. approval_id가 없는 환불은
-- 애플리케이션이 거부한다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS returns (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID        REFERENCES order_items(id) ON DELETE SET NULL,
  reason        TEXT        NOT NULL
    CHECK (reason IN ('defect','wrong_item','change_of_mind','delay','customs_reject','other')),
  status        TEXT        NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','rejected','in_transit','received','completed')),
  quantity      INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  -- 반품 배송비를 누가 부담하는지. 실현 손익에 반영된다.
  shipping_borne_by TEXT    NOT NULL DEFAULT 'seller'
    CHECK (shipping_borne_by IN ('seller','buyer','shared')),
  restocking_cost INT8      NOT NULL DEFAULT 0,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS returns_order_idx ON returns(order_id);

CREATE TRIGGER returns_updated_at
  BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS refunds (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  return_id    UUID        REFERENCES returns(id) ON DELETE SET NULL,
  -- 환불은 비가역이다. 승인 없이 실행하지 않는다 (지시서 §7).
  approval_id  UUID        REFERENCES approvals(id) ON DELETE SET NULL,
  amount       INT8        NOT NULL CHECK (amount >= 0),
  status       TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','processing','completed','failed','cancelled')),
  -- PG 환불 키. 실제 환불이 일어났음을 증명한다.
  payment_key  TEXT,
  reason       TEXT,
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refunds_order_idx  ON refunds(order_id);
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds(status, created_at DESC);

CREATE TRIGGER refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- SETTLEMENTS — 채널 정산 (실현 매출의 유일한 근거)
--
-- 지시서 §18: "수익은 주문·정산·비용에서 계산한다."
-- 주문 금액은 '팔린 값'이고 정산액은 '실제로 들어온 값'이다. 채널
-- 수수료·프로모션 분담·조정이 끼면 둘은 다르다. 실현 매출은 정산액만
-- 인정한다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID        REFERENCES orders(id) ON DELETE SET NULL,
  channel         TEXT        NOT NULL DEFAULT 'own_store',
  -- 채널 정산 명세 식별자
  external_ref    TEXT,

  -- 판매액에서 수수료를 뺀 실입금액
  gross_amount    INT8        NOT NULL DEFAULT 0,
  channel_fee     INT8        NOT NULL DEFAULT 0,
  payment_fee     INT8        NOT NULL DEFAULT 0,
  promotion_share INT8        NOT NULL DEFAULT 0,
  adjustment      INT8        NOT NULL DEFAULT 0,
  net_amount      INT8        NOT NULL DEFAULT 0,

  status          TEXT        NOT NULL DEFAULT 'expected'
    CHECK (status IN ('expected','confirmed','paid','disputed','cancelled')),
  settled_on      DATE,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS settlements_order_idx  ON settlements(order_id);
CREATE INDEX IF NOT EXISTS settlements_status_idx ON settlements(status, settled_on DESC);

CREATE TRIGGER settlements_updated_at
  BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- EXPENSES — 실제 발생 비용
--
-- 예상 원가(margin_calculations)와 별개다. 실제로 얼마를 썼는지가
-- 여기 남아야 실현 손익이 나온다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID        REFERENCES orders(id) ON DELETE SET NULL,
  product_id   TEXT,
  category     TEXT        NOT NULL
    CHECK (category IN (
      'sourcing','local_shipping','international_shipping','customs','vat',
      'domestic_shipping','packaging','advertising','cs','return_shipping',
      'platform_fee','payment_fee','fx_loss','tool_subscription','other'
    )),
  amount       INT8        NOT NULL DEFAULT 0,
  currency     TEXT        NOT NULL DEFAULT 'KRW',
  -- 외화 지출이면 적용 환율. fx_loss 계산 근거.
  exchange_rate NUMERIC,
  incurred_on  DATE        NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT,
  -- 실제 지출 증빙이 있는지. 없으면 추정치다.
  verified     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expenses_order_idx    ON expenses(order_id);
CREATE INDEX IF NOT EXISTS expenses_incurred_idx ON expenses(incurred_on DESC, category);

-- ──────────────────────────────────────────────────────────
-- PROFIT DAILY — 일별 손익 집계 캐시
--
-- 정본이 아니다. orders + settlements + expenses에서 재계산 가능하며,
-- 화면 조회 속도를 위해 존재한다. 불일치가 의심되면 재계산이 정답이다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profit_daily (
  day                   DATE        PRIMARY KEY,
  order_count           INT4        NOT NULL DEFAULT 0,
  -- 주문 금액 합계 (팔린 값)
  gross_sales           INT8        NOT NULL DEFAULT 0,
  -- 정산 실입금 합계 (들어온 값)
  net_settlement        INT8        NOT NULL DEFAULT 0,
  total_expense         INT8        NOT NULL DEFAULT 0,
  realized_net_profit   INT8        NOT NULL DEFAULT 0,
  realized_margin_pct   NUMERIC     NOT NULL DEFAULT 0,
  -- 예상 순이익 합계. 오차 분석용.
  expected_net_profit   INT8        NOT NULL DEFAULT 0,
  refund_count          INT4        NOT NULL DEFAULT 0,
  refund_amount         INT8        NOT NULL DEFAULT 0,
  -- 이 날짜의 정산이 전부 확정됐는지. 미확정이면 수치가 바뀔 수 있다.
  settled               BOOLEAN     NOT NULL DEFAULT FALSE,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- ALERTS — 경고·예외 (지시서 §6)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT        NOT NULL
    CHECK (kind IN (
      'margin_drop','out_of_stock','regulatory','order_delay',
      'automation_failure','budget','refund_spike','listing_failure'
    )),
  severity    TEXT        NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','critical')),
  title       TEXT        NOT NULL,
  summary     TEXT,
  entity_type TEXT,
  entity_id   TEXT,
  payload     JSONB,
  -- 같은 원인의 알림이 반복 생성되지 않게 한다.
  dedupe_key  TEXT,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS alerts_dedupe_active_unique
  ON alerts(dedupe_key) WHERE dedupe_key IS NOT NULL AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS alerts_severity_idx ON alerts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_open_idx     ON alerts(created_at DESC) WHERE resolved_at IS NULL;

-- ──────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds        ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_daily   ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_assets_service_all" ON content_assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "listings_service_all"       ON listings       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "listing_events_service_all" ON listing_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "order_items_service_all"    ON order_items    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "shipments_service_all"      ON shipments      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "returns_service_all"        ON returns        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "refunds_service_all"        ON refunds        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "settlements_service_all"    ON settlements    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "expenses_service_all"       ON expenses       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "profit_daily_service_all"   ON profit_daily   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "alerts_service_all"         ON alerts         FOR ALL TO service_role USING (true) WITH CHECK (true);
