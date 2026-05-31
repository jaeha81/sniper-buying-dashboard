-- ============================================================
-- 003_agent_operating_system.sql
-- Hybrid agent operating layer for Sniper Buying Dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name TEXT NOT NULL,
  scenario_id TEXT,
  trigger_type TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','success','failed','partial')),
  ops_consumed INTEGER NOT NULL DEFAULT 0,
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  error_detail JSONB,
  payload JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL
    CHECK (agent_type IN (
      'product_discovery',
      'margin_pricing',
      'order_ops',
      'compliance_risk',
      'command_center'
    )),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','success','failed','partial')),
  trigger_type TEXT,
  summary TEXT,
  input_payload JSONB,
  output_payload JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL
    CHECK (agent_type IN (
      'product_discovery',
      'margin_pricing',
      'order_ops',
      'compliance_risk',
      'command_center'
    )),
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'review_candidate',
      'approve_product',
      'update_price',
      'pause_product',
      'update_order_status',
      'send_customer_notice',
      'inspect_risk',
      'review_automation_failure'
    )),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','running','completed','failed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  recommendation TEXT,
  target_type TEXT,
  target_id TEXT,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  payload JSONB,
  reviewer_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL
    CHECK (agent_type IN (
      'product_discovery',
      'margin_pricing',
      'order_ops',
      'compliance_risk',
      'command_center'
    )),
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  summary TEXT,
  target_type TEXT,
  target_id TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  payload JSONB,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_logs_status_idx ON automation_logs(status);
CREATE INDEX IF NOT EXISTS automation_logs_started_at_idx ON automation_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_agent_type_idx ON agent_runs(agent_type);
CREATE INDEX IF NOT EXISTS agent_runs_started_at_idx ON agent_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS agent_tasks_priority_idx ON agent_tasks(priority);
CREATE INDEX IF NOT EXISTS agent_tasks_agent_type_idx ON agent_tasks(agent_type);
CREATE INDEX IF NOT EXISTS agent_tasks_created_at_idx ON agent_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS agent_findings_severity_idx ON agent_findings(severity);
CREATE INDEX IF NOT EXISTS agent_findings_agent_type_idx ON agent_findings(agent_type);
CREATE INDEX IF NOT EXISTS agent_findings_created_at_idx ON agent_findings(created_at DESC);

CREATE TRIGGER agent_tasks_updated_at
  BEFORE UPDATE ON agent_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_logs_service_all"
  ON automation_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "agent_runs_service_all"
  ON agent_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "agent_tasks_service_all"
  ON agent_tasks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "agent_findings_service_all"
  ON agent_findings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
