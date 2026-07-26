-- ============================================================
-- 010_employees_down.sql — 010 롤백
--
-- tasks의 FK를 먼저 떼야 employees를 지울 수 있다.
-- autonomy_settings의 기존 열(autonomy_level, kill_switch 등)은
-- 010에서 건드리지 않았으므로 그대로 남는다.
-- ============================================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assigned_employee_fk;

ALTER TABLE autonomy_settings
  DROP COLUMN IF EXISTS daily_budget_usd,
  DROP COLUMN IF EXISTS disabled_channels,
  DROP COLUMN IF EXISTS emergency_stop;

DROP TRIGGER IF EXISTS employees_updated_at ON employees;

DROP TABLE IF EXISTS webhook_nonces;
DROP TABLE IF EXISTS bucky_decisions;
DROP TABLE IF EXISTS prompt_versions;
DROP TABLE IF EXISTS employee_tools;
DROP TABLE IF EXISTS employees;
