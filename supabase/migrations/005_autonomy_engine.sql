-- ============================================================
-- 005_autonomy_engine.sql
-- Full-autonomy upgrade: policy settings + execution audit trail
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- AUTONOMY SETTINGS (singleton row, id = 1)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autonomy_settings (
  id                        INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  autonomy_level            TEXT        NOT NULL DEFAULT 'assisted'
    CHECK (autonomy_level IN ('manual','assisted','autopilot')),
  kill_switch               BOOLEAN     NOT NULL DEFAULT FALSE,
  max_daily_auto_actions    INTEGER     NOT NULL DEFAULT 30
    CHECK (max_daily_auto_actions >= 0),
  max_price_change_pct      NUMERIC     NOT NULL DEFAULT 10
    CHECK (max_price_change_pct >= 0),
  min_margin_rate           NUMERIC     NOT NULL DEFAULT 10,
  min_approve_sniper_score  INT2        NOT NULL DEFAULT 80
    CHECK (min_approve_sniper_score BETWEEN 0 AND 100),
  allow_customer_notice     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO autonomy_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER autonomy_settings_updated_at
  BEFORE UPDATE ON autonomy_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE autonomy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autonomy_settings_service_all"
  ON autonomy_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ──────────────────────────────────────────────────────────
-- AGENT TASKS: execution audit columns
-- executed_by  : who triggered the actual mutation (admin | autonomy)
-- decision_reason: why the autonomy engine auto-executed or held the task
-- ──────────────────────────────────────────────────────────
ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS auto_approved    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS decision_reason  TEXT,
  ADD COLUMN IF NOT EXISTS executed_by      TEXT
    CHECK (executed_by IS NULL OR executed_by IN ('admin','autonomy')),
  ADD COLUMN IF NOT EXISTS executed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_result JSONB;

CREATE INDEX IF NOT EXISTS agent_tasks_executed_by_idx
  ON agent_tasks(executed_by, executed_at DESC);
