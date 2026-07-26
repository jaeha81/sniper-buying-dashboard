-- ============================================================
-- 009_task_engine_down.sql — 009 롤백
--
-- agent_tasks는 009에서 읽기만 했으므로(백필 원본) 그대로 남아 있다.
-- 즉 이 롤백은 데이터 손실 없이 이전 상태로 돌아간다 — 단, 009 적용
-- 이후 tasks에만 생성된 신규 작업은 함께 사라진다.
--
-- 운영 중 롤백이라면 먼저 확인할 것:
--   SELECT count(*) FROM tasks WHERE idempotency_key NOT LIKE 'agent_tasks:%';
-- 이 값이 0보다 크면 백필로 옮겨온 게 아닌 신규 작업이 있다는 뜻이다.
-- ============================================================

DROP TRIGGER IF EXISTS approvals_updated_at ON approvals;
DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;

DROP TABLE IF EXISTS approval_actions;
DROP TABLE IF EXISTS approvals;
DROP TABLE IF EXISTS task_events;
DROP TABLE IF EXISTS task_runs;
DROP TABLE IF EXISTS tasks;
