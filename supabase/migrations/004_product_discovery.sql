-- 004_product_discovery.sql
-- 상품 자동 발굴 & 수익 보호 자동화

-- ─── raw_candidates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS raw_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL,
  source_site TEXT NOT NULL
    CHECK (source_site IN ('iherb', 'amazon', 'vitacost', 'costco', 'other')),
  raw_markdown TEXT,
  extracted_data JSONB,
  confidence NUMERIC NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'passed', 'failed')),
  validation_errors JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS raw_candidates_status_idx ON raw_candidates(validation_status);
CREATE INDEX IF NOT EXISTS raw_candidates_created_at_idx ON raw_candidates(created_at DESC);

-- ─── scan_jobs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL
    CHECK (job_type IN ('url', 'category_scan')),
  source_site TEXT NOT NULL
    CHECK (source_site IN ('iherb', 'amazon', 'vitacost', 'costco', 'other')),
  category TEXT,
  target_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  total_items INT NOT NULL DEFAULT 0,
  processed_items INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scan_jobs_status_idx ON scan_jobs(status);

-- ─── scan_items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'done', 'failed', 'skipped')),
  result_product_id UUID,
  result_raw_candidate_id UUID,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scan_items_job_id_idx ON scan_items(job_id);
CREATE INDEX IF NOT EXISTS scan_items_status_idx ON scan_items(status);

-- ─── price_snapshots ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  exchange_rate NUMERIC NOT NULL,
  overseas_price NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  margin_rate NUMERIC NOT NULL,
  sniper_score INT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('discovery', 'rate_change', 'manual', 'daily_scan')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_snapshots_product_id_idx ON price_snapshots(product_id);
CREATE INDEX IF NOT EXISTS price_snapshots_recorded_at_idx ON price_snapshots(recorded_at DESC);

-- ─── products 테이블 컬럼 추가 ────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS exchange_rate_snapshot NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS raw_candidate_id UUID,
  ADD COLUMN IF NOT EXISTS source_site TEXT
    CHECK (source_site IN ('iherb', 'amazon', 'vitacost', 'costco', 'other', 'manual'));

CREATE UNIQUE INDEX IF NOT EXISTS products_source_url_unique
  ON products(source_url)
  WHERE source_url IS NOT NULL AND source_url <> '';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE raw_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_candidates_service_all" ON raw_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "scan_jobs_service_all" ON scan_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "scan_items_service_all" ON scan_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "price_snapshots_service_all" ON price_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
