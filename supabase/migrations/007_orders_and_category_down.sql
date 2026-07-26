-- ============================================================
-- 007_orders_and_category_down.sql — 007 롤백
--
-- 주의: category CHECK를 5종으로 되돌리기 전에 food/medicine 행이
-- 남아 있으면 제약 추가가 실패한다. 아래 UPDATE로 먼저 접어야 한다.
-- ============================================================

DROP INDEX IF EXISTS orders_order_ref_unique;
DROP INDEX IF EXISTS orders_payment_status_idx;

ALTER TABLE orders
  DROP COLUMN IF EXISTS payment_confirmed_at,
  DROP COLUMN IF EXISTS confirmed_amount,
  DROP COLUMN IF EXISTS payment_status;

-- 확대된 카테고리로 저장된 행을 원래 허용값으로 접는다.
UPDATE products SET category = 'health'
  WHERE category IN ('food','medicine');

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;

ALTER TABLE products ADD CONSTRAINT products_category_check
  CHECK (category IN ('health','sports','beauty','outdoor','electronics'));
