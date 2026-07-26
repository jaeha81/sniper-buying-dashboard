-- ============================================================
-- 011_commerce_down.sql — 011 롤백
--
-- 신규 테이블만 추가했으므로 전량 삭제로 복구된다. 기존 orders는
-- 건드리지 않았으므로 그대로 남는다(order_items가 사라지면 007
-- 방식의 orders 행만 남는 상태로 되돌아간다).
--
-- 운영 중 롤백이라면 먼저 확인할 것 — 실현 손익 근거가 사라진다:
--   SELECT count(*) FROM settlements;
--   SELECT count(*) FROM expenses;
--   SELECT count(*) FROM listings WHERE status = 'published';
-- published 등록이 있으면 외부 채널에 상품이 살아 있는데 앱이 그 사실을
-- 잊어버리게 된다. 채널에서 먼저 내린 뒤 롤백할 것.
-- ============================================================

DROP TRIGGER IF EXISTS settlements_updated_at ON settlements;
DROP TRIGGER IF EXISTS refunds_updated_at     ON refunds;
DROP TRIGGER IF EXISTS returns_updated_at     ON returns;
DROP TRIGGER IF EXISTS shipments_updated_at   ON shipments;
DROP TRIGGER IF EXISTS listings_updated_at    ON listings;

DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS profit_daily;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS settlements;
DROP TABLE IF EXISTS refunds;
DROP TABLE IF EXISTS returns;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS listing_events;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS content_assets;
