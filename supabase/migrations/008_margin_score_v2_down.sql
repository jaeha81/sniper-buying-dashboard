-- ============================================================
-- 008_margin_score_v2_down.sql — 008 롤백
--
-- 신규 테이블만 추가했으므로 전량 삭제로 완전 복구된다.
-- products의 기존 계산 열은 건드리지 않았으므로 그대로 남는다.
--
-- 주의: 마진·스코어 산출 이력이 함께 사라진다. 운영 중 롤백이라면
-- 먼저 margin_calculations / scores를 덤프해 둘 것.
-- ============================================================

DROP TABLE IF EXISTS risk_checks;
DROP TABLE IF EXISTS scores;
DROP TABLE IF EXISTS margin_calculations;
DROP TABLE IF EXISTS source_offers;
DROP TABLE IF EXISTS fx_snapshots;
