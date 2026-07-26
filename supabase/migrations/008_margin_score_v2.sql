-- ============================================================
-- 008_margin_score_v2.sql
-- P0-6 / P0-7: Sniper Score 2.0 + 마진 엔진 v2 저장 계층
--
-- 지금까지 계산 결과는 products 테이블의 열(total_cost, margin_rate,
-- sniper_score …)에만 남았다. 값 하나만 덮어써지니 언제·어떤 근거로
-- 그 숫자가 나왔는지 알 수 없고, 지시서 §18이 요구하는 "모든 분석에
-- 근거·출처·신뢰도·버전이 남는다"를 만족할 수 없었다.
--
-- 이제 계산 1회 = 행 1개다. products의 기존 열은 최신값 캐시로 격하한다
-- (읽기 편의를 위해 남겨두되, 정본은 아래 테이블들이다).
--
-- 비파괴: 신규 테이블만 추가한다.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- FX SNAPSHOTS — 환율 이력
--
-- 지금은 외부 API 실패 시 1350을 폴백으로 쓰면서 그 사실을 응답에
-- 남기지 않았다. 과거 계산을 재현할 수도 없었다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fx_snapshots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT        NOT NULL DEFAULT 'USD',
  quote_currency TEXT       NOT NULL DEFAULT 'KRW',
  rate          NUMERIC     NOT NULL CHECK (rate > 0),
  -- REAL: 외부 API 응답 / ESTIMATE: 폴백 상수 / MANUAL: 사람이 입력
  data_quality  TEXT        NOT NULL DEFAULT 'REAL'
    CHECK (data_quality IN ('REAL','ESTIMATE','MANUAL')),
  source        TEXT,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fx_snapshots_captured_idx
  ON fx_snapshots(base_currency, quote_currency, captured_at DESC);

-- ──────────────────────────────────────────────────────────
-- SOURCE OFFERS — 소싱처별 공급 조건
-- 같은 상품이라도 소싱처마다 가격·재고·신뢰도가 다르다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS source_offers (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     TEXT        NOT NULL,
  source_site    TEXT        NOT NULL,
  source_url     TEXT        NOT NULL,
  currency       TEXT        NOT NULL DEFAULT 'USD',
  price          NUMERIC     NOT NULL DEFAULT 0,
  option_cost    NUMERIC     NOT NULL DEFAULT 0,
  local_shipping NUMERIC     NOT NULL DEFAULT 0,
  in_stock       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- 0-1. Score 2.0의 UNTRUSTED_SUPPLIER 하드블록이 이 값을 본다.
  supplier_trust NUMERIC     NOT NULL DEFAULT 0.5
    CHECK (supplier_trust >= 0 AND supplier_trust <= 1),
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS source_offers_product_idx
  ON source_offers(product_id, captured_at DESC);

-- ──────────────────────────────────────────────────────────
-- MARGIN CALCULATIONS — 마진 계산 1회당 1행
--
-- input/result를 JSONB로 통째로 남기는 이유: 비용 항목이 앞으로도
-- 늘어날 텐데, 항목마다 열을 만들면 스키마가 계속 흔들린다. 대신
-- 집계·필터에 쓰는 핵심 지표만 열로 승격해 둔다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS margin_calculations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          TEXT,
  source_offer_id     UUID        REFERENCES source_offers(id) ON DELETE SET NULL,
  fx_snapshot_id      UUID        REFERENCES fx_snapshots(id) ON DELETE SET NULL,

  -- 계산 규칙 버전. 공식이 바뀌면 올린다(지시서 §18 "규칙 버전 기록").
  engine_version      TEXT        NOT NULL DEFAULT 'v2',

  selling_price       INT8        NOT NULL DEFAULT 0,
  sourcing_cost       INT8        NOT NULL DEFAULT 0,
  international_cost  INT8        NOT NULL DEFAULT 0,
  selling_cost        INT8        NOT NULL DEFAULT 0,
  domestic_ops_cost   INT8        NOT NULL DEFAULT 0,
  financial_cost      INT8        NOT NULL DEFAULT 0,
  total_cost          INT8        NOT NULL DEFAULT 0,
  expected_net_profit INT8        NOT NULL DEFAULT 0,
  expected_net_margin_pct NUMERIC NOT NULL DEFAULT 0,
  upfront_cost        INT8        NOT NULL DEFAULT 0,
  roi_pct             NUMERIC     NOT NULL DEFAULT 0,

  -- 전체 입력과 결과, 낙관/기준/보수 시뮬레이션
  input               JSONB       NOT NULL,
  result              JSONB       NOT NULL,
  simulation          JSONB,

  calculated_by       TEXT        NOT NULL DEFAULT 'system',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS margin_calculations_product_idx
  ON margin_calculations(product_id, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- SCORES — Sniper Score 2.0 산출 1회당 1행
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scores (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            TEXT        NOT NULL,
  margin_calculation_id UUID        REFERENCES margin_calculations(id) ON DELETE SET NULL,

  engine_version        TEXT        NOT NULL DEFAULT 'v2',
  -- LLM이 관여한 경우 어떤 프롬프트였는지
  prompt_version        TEXT,

  score                 INT2        NOT NULL DEFAULT 0
    CHECK (score >= 0 AND score <= 100),
  -- 데이터 신뢰도 0-1. 점수와 별개로 판단 근거의 튼튼함을 나타낸다.
  confidence            NUMERIC     NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  verdict               TEXT        NOT NULL DEFAULT 'review'
    CHECK (verdict IN ('recommend','review','reject')),

  breakdown             JSONB       NOT NULL,
  confidence_breakdown  JSONB,
  -- 지표별 근거(출처·수집시각·참조)
  evidence              JSONB,
  -- 해소되지 않은 하드블록. 비어 있지 않으면 verdict는 항상 reject.
  hard_blocks           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  reasons               JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scores_product_idx  ON scores(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scores_verdict_idx  ON scores(verdict, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- RISK CHECKS — 규제·IP·배송 위험 검토 이력
--
-- Score 2.0의 하드블록(REGULATORY_UNRESOLVED, IP_RISK_UNRESOLVED,
-- NOT_SHIPPABLE)은 이 표에서 "해소됨"이 확인돼야 풀린다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_checks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   TEXT        NOT NULL,
  check_type   TEXT        NOT NULL
    CHECK (check_type IN ('customs','certification','prohibited','trademark','ip','shipping','supplier')),
  status       TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','cleared','blocked','needs_review')),
  severity     TEXT        NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','critical')),
  summary      TEXT,
  evidence     JSONB,
  confidence   NUMERIC     NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  checked_by   TEXT        NOT NULL DEFAULT 'system',
  cleared_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_checks_product_idx
  ON risk_checks(product_id, check_type, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- RLS — 전부 service_role 전용
-- ──────────────────────────────────────────────────────────
ALTER TABLE fx_snapshots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_offers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores              ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_checks         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fx_snapshots_service_all"        ON fx_snapshots        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "source_offers_service_all"       ON source_offers       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "margin_calculations_service_all" ON margin_calculations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "scores_service_all"              ON scores              FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "risk_checks_service_all"         ON risk_checks         FOR ALL TO service_role USING (true) WITH CHECK (true);
