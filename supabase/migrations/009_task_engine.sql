-- ============================================================
-- 009_task_engine.sql
-- P0-8: Task / Run / Approval 엔진 (지시서 §11)
--
-- 기존 agent_tasks에는 idempotency_key, attempt/max_attempts,
-- scheduled_at, started_at, completed_at, error_code/message,
-- confidence, assigned_employee_id가 없었다. 재실행 이력이 누적되지
-- 않아 "몇 번째 시도에서 왜 실패했는지"를 알 수 없었고, 중복 방지·
-- 백오프·dead-letter가 구현될 자리가 아예 없었다.
--
-- agent_tasks는 삭제하지 않는다. 지시서 §11 "삭제 대신 archive"에 따라
-- 읽기 전용으로 보존하고, 신규 쓰기는 tasks로만 보낸다.
--
-- 비파괴: 신규 테이블만 추가한다.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- TASKS — 작업 단위
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type                 TEXT        NOT NULL,
  entity_type          TEXT,
  entity_id            TEXT,
  -- employees 테이블은 P1에서 만든다. 그때 FK를 건다.
  assigned_employee_id UUID,

  status               TEXT        NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued','scheduled','running','needs_approval',
      'succeeded','failed','dead_letter','cancelled'
    )),
  -- 작을수록 먼저 실행한다.
  priority             INT2        NOT NULL DEFAULT 5,

  input                JSONB       NOT NULL DEFAULT '{}'::jsonb,
  output               JSONB,
  confidence           NUMERIC
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  requires_approval    BOOLEAN     NOT NULL DEFAULT FALSE,

  -- 중복 생성 차단. 같은 대상에 같은 작업이 두 번 들어오지 않게 한다.
  idempotency_key      TEXT        NOT NULL,

  attempt              INT2        NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts         INT2        NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),

  scheduled_at         TIMESTAMPTZ,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,

  error_code           TEXT,
  error_message        TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 멱등성은 '진행 중인 태스크'에만 적용한다.
-- 어제 성공한 작업을 오늘 다시 못 하게 막으면 안 되므로, 종료 상태는
-- 유일성 제약에서 제외한다.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_idempotency_active_unique
  ON tasks(idempotency_key)
  WHERE status IN ('queued','scheduled','running','needs_approval','failed');

CREATE INDEX IF NOT EXISTS tasks_status_idx    ON tasks(status, priority, scheduled_at);
CREATE INDEX IF NOT EXISTS tasks_entity_idx    ON tasks(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS tasks_employee_idx  ON tasks(assigned_employee_id, status);
CREATE INDEX IF NOT EXISTS tasks_created_idx   ON tasks(created_at DESC);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- TASK RUNS — 시도 1회당 1행
--
-- 지시서 §11: "재실행은 기존 Run을 덮어쓰지 않고 새 Run 생성".
-- 도구 호출·응답코드·비용·토큰·모델·프롬프트 버전을 여기 남긴다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt         INT2        NOT NULL CHECK (attempt >= 1),

  status          TEXT        NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','succeeded','failed','timed_out','cancelled')),

  input           JSONB,
  output          JSONB,

  -- 실행 비용·모델 추적 (지시서 §11·§18)
  model           TEXT,
  prompt_version  TEXT,
  input_tokens    INT4,
  output_tokens   INT4,
  cost_usd        NUMERIC,
  -- 이 Run이 부른 외부 도구와 응답 코드
  tool_calls      JSONB,

  error_code      TEXT,
  error_message   TEXT,

  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INT4
);

CREATE UNIQUE INDEX IF NOT EXISTS task_runs_task_attempt_unique
  ON task_runs(task_id, attempt);

CREATE INDEX IF NOT EXISTS task_runs_task_idx    ON task_runs(task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS task_runs_status_idx  ON task_runs(status, started_at DESC);

-- ──────────────────────────────────────────────────────────
-- TASK EVENTS — 상태 전이 로그 (append-only)
--
-- 지시서 §7: "이전 상태, 새 상태, 실행자, 근거, Task ID, 시각을
-- 이벤트 로그에 기록한다."
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  run_id      UUID        REFERENCES task_runs(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status   TEXT        NOT NULL,
  actor_type  TEXT        NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('owner','operator','autonomy','automation','system')),
  actor_id    TEXT,
  reason      TEXT,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_events_task_idx ON task_events(task_id, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- APPROVALS — 승인 게이트
--
-- 지시서 §2·§7: 결제·환불·법적 판단·신규 등록·대규모 가격 변경 등
-- 비가역 작업은 재하님 승인 없이 실행되지 않는다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approvals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID        REFERENCES tasks(id) ON DELETE CASCADE,
  entity_type   TEXT,
  entity_id     TEXT,

  kind          TEXT        NOT NULL
    CHECK (kind IN ('listing','price_change','payment','refund','risk_release','other')),
  status        TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired','cancelled')),

  title         TEXT        NOT NULL,
  summary       TEXT,
  -- 승인 판단에 필요한 근거 일체
  payload       JSONB,
  -- 승인 시 되돌릴 수 없는 작업인지
  irreversible  BOOLEAN     NOT NULL DEFAULT TRUE,

  requested_by  TEXT        NOT NULL DEFAULT 'system',
  expires_at    TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS approvals_task_idx   ON approvals(task_id);

CREATE TRIGGER approvals_updated_at
  BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- APPROVAL ACTIONS — 승인 행위 이력 (append-only)
-- 누가 언제 무엇을 승인·반려했는지. 취소해도 기록은 남는다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_actions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID        NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL
    CHECK (action IN ('approve','reject','cancel','expire','comment')),
  actor_type  TEXT        NOT NULL DEFAULT 'owner'
    CHECK (actor_type IN ('owner','operator','autonomy','system')),
  actor_id    TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_actions_approval_idx
  ON approval_actions(approval_id, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- RLS — 전부 service_role 전용
-- ──────────────────────────────────────────────────────────
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_service_all"            ON tasks            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "task_runs_service_all"        ON task_runs        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "task_events_service_all"      ON task_events      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "approvals_service_all"        ON approvals        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "approval_actions_service_all" ON approval_actions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────
-- 기존 agent_tasks 백필
--
-- 삭제하지 않고 tasks로 복사만 한다. agent_tasks는 읽기 전용 보존.
-- 이미 옮겨진 행을 다시 넣지 않도록 idempotency_key로 걸러낸다.
-- ──────────────────────────────────────────────────────────
INSERT INTO tasks (
  type, entity_type, entity_id, status, priority,
  input, requires_approval, idempotency_key,
  attempt, max_attempts, completed_at, created_at
)
SELECT
  at.action_type,
  at.target_type,
  at.target_id,
  CASE at.status
    WHEN 'pending'   THEN 'queued'
    WHEN 'approved'  THEN 'queued'
    WHEN 'running'   THEN 'queued'   -- 실행 중이던 것은 다시 큐에 넣는다
    WHEN 'completed' THEN 'succeeded'
    WHEN 'failed'    THEN 'dead_letter'
    WHEN 'rejected'  THEN 'cancelled'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'queued'
  END,
  CASE at.priority
    WHEN 'critical' THEN 1
    WHEN 'high'     THEN 3
    WHEN 'medium'   THEN 5
    WHEN 'low'      THEN 8
    ELSE 5
  END,
  COALESCE(at.payload, '{}'::jsonb) || jsonb_build_object(
    'migratedFrom', 'agent_tasks',
    'agentType', at.agent_type,
    'title', at.title,
    'recommendation', at.recommendation
  ),
  at.requires_approval,
  'agent_tasks:' || at.id::text,
  0,
  3,
  CASE WHEN at.status IN ('completed','failed','rejected','cancelled')
       THEN COALESCE(at.reviewed_at, at.updated_at) END,
  at.created_at
FROM agent_tasks at
WHERE NOT EXISTS (
  SELECT 1 FROM tasks t WHERE t.idempotency_key = 'agent_tasks:' || at.id::text
);
