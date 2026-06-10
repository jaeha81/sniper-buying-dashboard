-- 주간 운영 리뷰용 뷰 모음
-- Supabase SQL Editor 또는 supabase db push로 적용

-- ① 주간 자율 실행 요약
CREATE OR REPLACE VIEW v_weekly_auto_summary AS
SELECT
  DATE_TRUNC('week', executed_at)::DATE          AS week_start,
  COUNT(*)                                        AS total_executions,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS succeeded,
  SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) AS failed,
  ROUND(
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::NUMERIC
    / NULLIF(COUNT(*), 0) * 100, 1
  )                                               AS success_rate_pct,
  COUNT(DISTINCT action_type)                     AS distinct_action_types
FROM agent_tasks
WHERE executed_by = 'autonomy'
  AND executed_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;

-- ② 마진 방어 이력 (자동 일시중지된 상품)
CREATE OR REPLACE VIEW v_margin_defense_log AS
SELECT
  t.id,
  t.title,
  t.target_id                                     AS product_id,
  (t.payload->>'marginRate')::NUMERIC             AS margin_rate_at_action,
  t.decision_reason,
  t.executed_at,
  t.status,
  p.name                                          AS product_name,
  p.category
FROM agent_tasks t
LEFT JOIN products p ON p.id = t.target_id
WHERE t.action_type = 'pause_product'
  AND t.executed_by  = 'autonomy'
ORDER BY t.executed_at DESC;

-- ③ 미해결 발견(findings) 현황
CREATE OR REPLACE VIEW v_open_findings AS
SELECT
  f.id,
  f.agent_type,
  f.severity,
  f.title,
  f.summary,
  f.target_type,
  f.target_id,
  f.confidence,
  f.created_at,
  EXTRACT(DAY FROM NOW() - f.created_at)::INT     AS days_open,
  p.name                                          AS product_name
FROM agent_findings f
LEFT JOIN products p ON p.id = f.target_id
WHERE f.resolved_at IS NULL
ORDER BY
  CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
  f.created_at DESC;

-- ④ 저마진 상품 모니터 (마진 10% 미만 활성 상품)
CREATE OR REPLACE VIEW v_low_margin_products AS
SELECT
  id,
  name,
  category,
  status,
  margin_rate::NUMERIC                            AS margin_rate,
  sniper_score,
  risk_level,
  total_cost::NUMERIC                             AS total_cost,
  domestic_expected_price::NUMERIC                AS domestic_expected_price,
  ROUND(
    (domestic_expected_price::NUMERIC - total_cost::NUMERIC)
    / NULLIF(domestic_expected_price::NUMERIC, 0) * 100, 1
  )                                               AS calc_margin_pct
FROM products
WHERE status IN ('active', 'candidate')
  AND margin_rate::NUMERIC < 10
ORDER BY margin_rate::NUMERIC ASC;

-- ⑤ 에이전트 스캔 실행 이력 (최근 30회)
CREATE OR REPLACE VIEW v_agent_run_history AS
SELECT
  r.id,
  r.agent_type,
  r.status,
  r.trigger_type,
  r.summary,
  (r.output_payload->>'insertedTasks')::INT       AS inserted_tasks,
  (r.output_payload->>'insertedFindings')::INT    AS inserted_findings,
  (r.output_payload->>'autoExecuted')::INT        AS auto_executed,
  r.completed_at
FROM agent_runs r
ORDER BY r.completed_at DESC
LIMIT 30;
