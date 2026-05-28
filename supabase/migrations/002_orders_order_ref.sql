-- ============================================================
-- 002_orders_order_ref.sql
-- Add order_ref column to orders table for client-generated IDs
-- (e.g. SB-1234567890 from Toss Payments orderId)
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_ref TEXT;

-- Index for fast lookup by ref (used by /api/orders?ref=XXX)
CREATE INDEX IF NOT EXISTS orders_order_ref_idx ON orders (order_ref);
