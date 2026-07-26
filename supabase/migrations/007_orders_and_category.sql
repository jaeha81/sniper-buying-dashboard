-- ============================================================
-- 007_orders_and_category.sql
-- P0-5 / P0-9: 주문 결제상태 표시 + 카테고리 제약 불일치 해소
--
-- MIGRATION_PLAN.md는 이 둘을 011·012로 잡았으나, 카테고리 불일치는
-- 발굴 파이프라인을 실제로 실패시키는 활성 버그이고 결제상태는
-- 주문 API 수정과 같은 배치에 묶여야 해서 앞으로 당겼다.
--
-- 비파괴: 열 추가와 CHECK 완화뿐이다.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1) products.category CHECK 확대
--
-- 기존 CHECK는 5종(health/sports/beauty/outdoor/electronics)인데
-- lib/product-extractor.ts의 LLM 추출 결과는 8종을 방출한다.
-- 모델이 food·medicine을 반환하면 discovery-pipeline이 INSERT
-- 단계에서 그대로 실패했다. lib/types.ts의 Product는 이미 7종을
-- 선언하고 있어 타입과 DB도 어긋나 있었다.
--
-- 'other'는 추가하지 않는다 — 파이프라인이 이미 health로 접고 있고,
-- 분류 불명을 그대로 저장하면 집계가 오염된다.
-- ──────────────────────────────────────────────────────────
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;

ALTER TABLE products ADD CONSTRAINT products_category_check
  CHECK (category IN (
    'health','sports','beauty','outdoor','electronics','food','medicine'
  ));

-- ──────────────────────────────────────────────────────────
-- 2) orders 결제 상태
--
-- 현재 코드에는 Toss 서버 승인(POST /v1/payments/confirm) 단계가
-- 없다. 결제창은 뜨지만 승인이 완료되지 않으므로 실제 수납이
-- 일어나지 않는다. 승인 여부를 구분해 두지 않으면 미수납 주문이
-- 매출로 집계된다.
--
-- unconfirmed : 승인 절차를 거치지 않음 (현재 모든 주문이 여기 해당)
-- confirmed   : 서버 승인 완료 (승인 라우트 구현 후에만 설정)
-- failed      : 승인 시도 실패
-- refunded    : 환불 완료
-- ──────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unconfirmed'
    CHECK (payment_status IN ('unconfirmed','confirmed','failed','refunded')),
  ADD COLUMN IF NOT EXISTS confirmed_amount INT8,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;

-- 기존 행 백필: payment_key 유무와 무관하게 서버 승인을 거친 주문은
-- 하나도 없다. 전부 unconfirmed로 남긴다(DEFAULT가 이미 처리).

CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders(payment_status);

-- ──────────────────────────────────────────────────────────
-- 3) orders 주문번호 유일성
--
-- order_ref는 클라이언트가 `SB-${Date.now()}`로 만들어 보내던 값이라
-- 중복 가능성이 있었다. 서버 생성으로 바꾸면서 유일성을 강제한다.
-- ──────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_ref_unique
  ON orders(order_ref)
  WHERE order_ref IS NOT NULL;
