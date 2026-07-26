-- ============================================================
-- 006_identity.sql
-- P0-1: 신원·세션·권한·감사 기반
--
-- 배경: 기존 관리자 인증은 ADMIN_SESSION_SECRET 값을 그대로 쿠키에
-- 심고 `token === secret`으로 비교했다. 쿠키가 한 번 유출되면 서버
-- 시크릿이 유출되는 것과 같고, 세션을 개별로 만료·폐기할 수 없었다.
-- 이 마이그레이션은 세션을 DB 레코드로 만들어 폐기·감사를 가능하게 한다.
--
-- 비파괴: 신규 테이블만 추가한다. 기존 테이블은 건드리지 않는다.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- USERS — 운영자 계정. 현재는 재하님 1인이지만 감사 로그가
-- 실행 주체를 가리키려면 실체가 있는 행이 필요하다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE,
  display_name  TEXT        NOT NULL DEFAULT '운영자',
  role          TEXT        NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner','operator','viewer')),
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 부트스트랩 소유자. 비밀번호는 여전히 ADMIN_PASSWORD 환경변수로
-- 검증한다(1인 운영). 이 행은 세션·감사 로그가 참조할 주체일 뿐이다.
INSERT INTO users (id, display_name, role)
VALUES ('00000000-0000-0000-0000-000000000001', '재하 (owner)', 'owner')
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- PERMISSIONS — 역할 → 능력 매핑.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  role       TEXT        NOT NULL CHECK (role IN ('owner','operator','viewer')),
  capability TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role, capability)
);

INSERT INTO permissions (role, capability) VALUES
  ('owner',    'product.read'),   ('owner',    'product.write'),
  ('owner',    'order.read'),     ('owner',    'order.write'),
  ('owner',    'task.read'),      ('owner',    'task.approve'),
  ('owner',    'autonomy.write'), ('owner',    'settings.write'),
  ('operator', 'product.read'),   ('operator', 'product.write'),
  ('operator', 'order.read'),     ('operator', 'task.read'),
  ('viewer',   'product.read'),   ('viewer',   'order.read'),
  ('viewer',   'task.read')
ON CONFLICT (role, capability) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- SESSIONS — 발급된 세션 하나당 한 행.
--
-- 쿠키에는 서명된 토큰(v1.<session id>.<만료>.<HMAC>)만 담기고
-- 시크릿 자체는 서버를 떠나지 않는다. 서명 검증은 상태 없이 되므로
-- 미들웨어가 DB 왕복 없이 통과시키고, 라우트가 이 표를 조회해
-- 폐기 여부까지 확인한다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  ip           TEXT,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_idx    ON sessions(user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

-- ──────────────────────────────────────────────────────────
-- AUDIT LOGS — 지시서 §16·§18: 모든 중요 조작이 남아야 한다.
-- 삭제 대신 보존이 원칙이므로 UPDATE/DELETE는 하지 않는다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type  TEXT        NOT NULL
    CHECK (actor_type IN ('owner','operator','viewer','autonomy','automation','system','anonymous')),
  actor_id    TEXT,
  action      TEXT        NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  before      JSONB,
  after       JSONB,
  reason      TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx  ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx   ON audit_logs(actor_type, actor_id);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- RLS — 전부 service_role 전용. 익명·인증 클라이언트는 접근 불가.
-- ──────────────────────────────────────────────────────────
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_service_all"       ON users       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "permissions_service_all" ON permissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "sessions_service_all"    ON sessions    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "audit_logs_service_all"  ON audit_logs  FOR ALL TO service_role USING (true) WITH CHECK (true);
