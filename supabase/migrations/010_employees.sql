-- ============================================================
-- 010_employees.sql
-- P1: 직원 레지스트리 + 프롬프트 버전 + 안전 정책 확장
--
-- 지금까지 '에이전트'는 코드 상수(lib/agents.ts)로만 존재했다. 지시서 §5는
-- 11개 직원에게 권한·부하·성공률·비용을 부여하고 §6은 지휘실에 직원별
-- 상태·큐·성공률·비용·차단 사유를 표시하라고 요구한다. 코드 상수로는
-- 이 중 어느 것도 저장할 수 없다.
--
-- 비파괴: 신규 테이블 + autonomy_settings 열 추가.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- EMPLOYEES — 직원 11종
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT        NOT NULL UNIQUE
    CHECK (code IN (
      'sourcing','market_research','margin_pricing','compliance_risk',
      'content','listing','price_stock_watch','order_fulfillment',
      'customer_service','revenue_analytics','automation_watch'
    )),
  name           TEXT        NOT NULL,
  responsibility TEXT        NOT NULL,

  -- 수동 일시중지. 지휘실에서 직원 단위로 끌 수 있다.
  paused         BOOLEAN     NOT NULL DEFAULT FALSE,
  -- 필요한 자격증명·도구가 없으면 오프라인으로 표시한다.
  offline        BOOLEAN     NOT NULL DEFAULT FALSE,
  paused_reason  TEXT,

  -- 성과 누적. 지시서 §15 "직원별 작업수, 성공률, 수동개입률, 실행비용"
  total_runs           INT4    NOT NULL DEFAULT 0,
  success_runs         INT4    NOT NULL DEFAULT 0,
  manual_interventions INT4    NOT NULL DEFAULT 0,
  cost_usd             NUMERIC NOT NULL DEFAULT 0,
  -- 기여 이익 (KRW). 정산 데이터가 붙는 P2에서 채워진다.
  contributed_profit_krw INT8  NOT NULL DEFAULT 0,

  last_active_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- lib/employees.ts의 정의와 일치해야 한다. 한쪽만 바뀌면 배정이 실패한다.
INSERT INTO employees (code, name, responsibility) VALUES
  ('sourcing',           '소싱 담당',          '후보 수집, 정규화, 중복 제거'),
  ('market_research',    '시장분석 담당',      '국내 수요·가격대·경쟁 분석'),
  ('margin_pricing',     '마진·가격 담당',     '전체 비용, 권장가, 순익, ROI, 민감도 분석'),
  ('compliance_risk',    '규제·리스크 담당',   '통관·인증·금지·상표/IP·배송 위험 검토'),
  ('content',            '콘텐츠 담당',        '제목·설명·속성·FAQ·이미지 작업지시 생성'),
  ('listing',            '상품등록 담당',      '승인된 상품의 채널 등록·수정'),
  ('price_stock_watch',  '가격·재고 감시 담당', '소싱가·환율·재고·마진 하락 감시'),
  ('order_fulfillment',  '주문·배송 담당',     '주문·발주 준비·배송·지연·취소 예외 처리'),
  ('customer_service',   'CS 담당',            '문의 분류와 답변 초안 작성'),
  ('revenue_analytics',  '수익·성과 담당',     '예상/실현 손익, 상품·채널·직원 기여 분석'),
  ('automation_watch',   '자동화 감시 담당',   'API·웹훅·스케줄·DB 작업 장애 감시')
ON CONFLICT (code) DO NOTHING;

-- tasks.assigned_employee_id에 이제 FK를 걸 수 있다.
-- ON DELETE SET NULL: 직원을 지워도 작업 이력은 남아야 한다.
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_assigned_employee_fk;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_assigned_employee_fk
  FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────
-- EMPLOYEE TOOLS — 직원별 허용 도구 (권한)
-- 콘텐츠 담당이 결제 API를 부르는 일이 없어야 한다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_tools (
  employee_id UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tool        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_id, tool)
);

-- ──────────────────────────────────────────────────────────
-- PROMPT VERSIONS — LLM 프롬프트 이력
--
-- 지시서 §18: "모든 분석에 근거·출처·신뢰도·버전이 남는다."
-- 프롬프트를 고친 뒤 판정 품질이 달라졌을 때 원인을 짚으려면
-- 어떤 버전으로 산출했는지가 남아야 한다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  version     TEXT        NOT NULL,
  model       TEXT,
  template    TEXT        NOT NULL,
  notes       TEXT,
  active      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, version)
);

-- 이름당 활성 버전은 하나뿐이어야 한다.
CREATE UNIQUE INDEX IF NOT EXISTS prompt_versions_active_unique
  ON prompt_versions(name) WHERE active;

-- ──────────────────────────────────────────────────────────
-- BUCKY DECISIONS — 총괄 판정 이력 (지시서 §4)
--
-- 판정 1회 = 1행. 덮어쓰지 않는다 — 같은 상품에 대한 판정이 시간에 따라
-- 어떻게 변했는지가 자율성 확대 판단(P3)의 근거가 된다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bucky_decisions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id              TEXT        NOT NULL,
  score_id                UUID        REFERENCES scores(id) ON DELETE SET NULL,
  margin_calculation_id   UUID        REFERENCES margin_calculations(id) ON DELETE SET NULL,

  verdict                 TEXT        NOT NULL
    CHECK (verdict IN ('recommend','review','reject','pause')),
  priority                TEXT        NOT NULL
    CHECK (priority IN ('P0','P1','P2','P3')),

  sniper_score            INT2        NOT NULL DEFAULT 0,
  confidence              NUMERIC     NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  expected_net_margin_pct NUMERIC     NOT NULL DEFAULT 0,
  expected_profit_krw     INT8        NOT NULL DEFAULT 0,

  hard_blocks             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  reasons                 JSONB       NOT NULL DEFAULT '[]'::jsonb,
  conflicts               JSONB       NOT NULL DEFAULT '[]'::jsonb,
  next_actions            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- 직원별 산출물 원본
  employee_reports        JSONB,

  requires_owner_approval BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bucky_decisions_product_idx
  ON bucky_decisions(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bucky_decisions_verdict_idx
  ON bucky_decisions(verdict, priority, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- WEBHOOK NONCES — replay 방지 (지시서 §12)
--
-- 같은 서명 요청이 두 번 들어오면 두 번째는 거부한다.
-- expires_at이 지난 행은 정리해도 안전하다.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_nonces (
  nonce      TEXT        PRIMARY KEY,
  scenario   TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_nonces_expires_idx ON webhook_nonces(expires_at);

-- ──────────────────────────────────────────────────────────
-- AUTONOMY SETTINGS 확장 — 전역 비상정지와 채널별 Kill Switch
--
-- 기존 kill_switch는 '자율 실행' 경로에만 걸렸다. 관리자가 손으로 누르는
-- 실행, 외부 등록, Make 호출은 그대로 나갔다. emergency_stop은 부작용이
-- 있는 모든 경로를 막는다.
-- ──────────────────────────────────────────────────────────
ALTER TABLE autonomy_settings
  ADD COLUMN IF NOT EXISTS emergency_stop    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS disabled_channels JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS daily_budget_usd  NUMERIC NOT NULL DEFAULT 0
    CHECK (daily_budget_usd >= 0);

-- ──────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE employees       ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_tools  ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bucky_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_nonces  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_service_all"       ON employees       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "employee_tools_service_all"  ON employee_tools  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "prompt_versions_service_all" ON prompt_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "bucky_decisions_service_all" ON bucky_decisions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "webhook_nonces_service_all"  ON webhook_nonces  FOR ALL TO service_role USING (true) WITH CHECK (true);
