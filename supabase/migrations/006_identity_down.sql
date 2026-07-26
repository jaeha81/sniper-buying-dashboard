-- ============================================================
-- 006_identity_down.sql — 006 롤백
--
-- 신규 테이블만 추가했으므로 전량 삭제로 완전 복구된다.
-- 주의: audit_logs를 지우면 그동안 쌓인 감사 기록도 함께 사라진다.
-- 운영 중 롤백이라면 먼저 audit_logs를 덤프해 둘 것.
-- ============================================================

DROP TRIGGER IF EXISTS users_updated_at ON users;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS users;
