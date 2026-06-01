# 상품 자동 발굴 & 수익 보호 자동화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iHerb/Amazon 등 해외 쇼핑몰에서 상품을 자동 수집·분석하고 손실 방지 게이트를 통과한 후보만 관리자에게 제시하는 시스템 구축

**Architecture:** Firecrawl API로 HTML을 Markdown으로 변환 → OpenRouter AI로 구조화 추출 → 가격 검증 게이트 → 실시간 환율 마진 계산 → Supabase 저장. 카테고리 스캔은 scan_jobs 큐에 저장 후 Make.com이 item 단위로 처리(Vercel 타임아웃 우회). 환율 변동 감지 시 자동 마진 재계산 + Slack 경보.

**Tech Stack:** Next.js 14 App Router, Supabase PostgreSQL, Firecrawl API, OpenRouter AI (기존), open.er-api.com 환율 (기존), Slack Webhook (기존)

**핵심 원칙:** 손실 유발 경로 금지. 검증되지 않은 AI 추출값은 raw_candidates에 격리. 판매 결정은 반드시 관리자 approve.

---

## 파일 구조

### 신규 생성
```
supabase/migrations/004_product_discovery.sql  -- DB 테이블 + 컬럼 추가
lib/firecrawl.ts                               -- Firecrawl API 래퍼
lib/product-extractor.ts                       -- OpenRouter AI 구조화 추출
lib/discovery-pipeline.ts                      -- 단건 URL 발굴 오케스트레이터
lib/margin-monitor.ts                          -- 환율 변동 감지 + 마진 재계산
app/api/discover/url/route.ts                  -- POST: 단건 URL 분석
app/api/discover/scan/route.ts                 -- POST: 카테고리 스캔 큐 등록
app/api/discover/process/route.ts             -- POST: scan_item 1개 처리 (Make.com 호출)
app/api/discover/jobs/route.ts                 -- GET: 스캔 현황 조회
app/api/discover/candidates/route.ts           -- GET: 검증된 후보 목록
app/api/discover/monitor/route.ts             -- POST: 환율 변동 감지 + 경보
app/admin/discover/page.tsx                    -- 관리자 발굴 대시보드 UI
```

### 기존 수정
```
lib/calculator.ts                              -- DEFAULT_EXCHANGE_RATE 상수 유지 (fallback용)
app/api/products/route.ts                      -- GET: source_site, ai_confidence 컬럼 반영
```

---

## Task 1: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/004_product_discovery.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 004_product_discovery.sql
-- 상품 자동 발굴 & 수익 보호 자동화

-- ─── raw_candidates ────────────────────────────────────────────────────────
-- AI 추출 원문 격리 저장. 검증 통과 전까지 products에 진입 불가.
CREATE TABLE IF NOT EXISTS raw_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL,
  source_site TEXT NOT NULL
    CHECK (source_site IN ('iherb', 'amazon', 'vitacost', 'costco', 'other')),
  raw_markdown TEXT,
  extracted_data JSONB,          -- AI 추출 원문 전체
  confidence NUMERIC NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'passed', 'failed')),
  validation_errors JSONB,       -- 실패 사유 배열
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS raw_candidates_status_idx ON raw_candidates(validation_status);
CREATE INDEX IF NOT EXISTS raw_candidates_created_at_idx ON raw_candidates(created_at DESC);

-- ─── scan_jobs ─────────────────────────────────────────────────────────────
-- 카테고리 스캔 작업 큐. 생성 즉시 200 응답 후 Make.com이 처리.
CREATE TABLE IF NOT EXISTS scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL
    CHECK (job_type IN ('url', 'category_scan')),
  source_site TEXT NOT NULL
    CHECK (source_site IN ('iherb', 'amazon', 'vitacost', 'costco', 'other')),
  category TEXT,                 -- 'health' | 'sports' | 'beauty' | 'outdoor' | 'electronics'
  target_url TEXT,               -- job_type='url' 일 때
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  total_items INT NOT NULL DEFAULT 0,
  processed_items INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scan_jobs_status_idx ON scan_jobs(status);

-- ─── scan_items ─────────────────────────────────────────────────────────────
-- 스캔 작업의 개별 URL 단위. Make.com이 1개씩 process 호출.
CREATE TABLE IF NOT EXISTS scan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'done', 'failed', 'skipped')),
  result_product_id UUID,        -- 성공 시 products.id
  result_raw_candidate_id UUID,  -- 검증 실패 시 raw_candidates.id
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scan_items_job_id_idx ON scan_items(job_id);
CREATE INDEX IF NOT EXISTS scan_items_status_idx ON scan_items(status);

-- ─── price_snapshots ────────────────────────────────────────────────────────
-- 환율 변동 이력. 마진 재계산 근거 보관.
CREATE TABLE IF NOT EXISTS price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,      -- products.id (FK 없음: 상품 삭제 후도 이력 보관)
  exchange_rate NUMERIC NOT NULL,
  overseas_price NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  margin_rate NUMERIC NOT NULL,
  sniper_score INT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('discovery', 'rate_change', 'manual', 'daily_scan')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_snapshots_product_id_idx ON price_snapshots(product_id);
CREATE INDEX IF NOT EXISTS price_snapshots_recorded_at_idx ON price_snapshots(recorded_at DESC);

-- ─── products 테이블 컬럼 추가 ────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS exchange_rate_snapshot NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS raw_candidate_id UUID,
  ADD COLUMN IF NOT EXISTS source_site TEXT
    CHECK (source_site IN ('iherb', 'amazon', 'vitacost', 'costco', 'other', 'manual'));

-- source_url 중복 방지 (빈 문자열 제외)
CREATE UNIQUE INDEX IF NOT EXISTS products_source_url_unique
  ON products(source_url)
  WHERE source_url IS NOT NULL AND source_url <> '';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE raw_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_candidates_service_all" ON raw_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "scan_jobs_service_all" ON scan_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "scan_items_service_all" ON scan_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "price_snapshots_service_all" ON price_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

Supabase 대시보드 → SQL Editor → 위 SQL 전체 붙여넣기 → Run

확인: Table Editor에 `raw_candidates`, `scan_jobs`, `scan_items`, `price_snapshots` 4개 테이블 생성됨

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/004_product_discovery.sql
git commit -m "feat(db): 상품 발굴 테이블 마이그레이션 (raw_candidates, scan_jobs, scan_items, price_snapshots)"
```

---

## Task 2: Firecrawl API 래퍼

**Files:**
- Create: `lib/firecrawl.ts`

Firecrawl은 URL을 받아 정제된 Markdown을 반환하는 스크래핑 서비스. https://firecrawl.dev 에서 무료 계정 생성 후 API 키 발급 필요.

환경변수: `FIRECRAWL_API_KEY`

- [ ] **Step 1: lib/firecrawl.ts 작성**

```typescript
// lib/firecrawl.ts
// Firecrawl API 래퍼 — URL → 정제된 Markdown

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1'

export interface FirecrawlResult {
  markdown: string
  title: string
  url: string
  statusCode: number
}

export interface FirecrawlError {
  error: string
  statusCode?: number
}

export type FirecrawlResponse =
  | { success: true; data: FirecrawlResult }
  | { success: false; error: string }

/**
 * URL을 Firecrawl API로 스크래핑해 Markdown 반환.
 * 봇 차단 우회, JS 렌더링 처리, 광고/nav 제거 포함.
 */
export async function scrapeUrl(url: string): Promise<FirecrawlResponse> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return { success: false, error: 'FIRECRAWL_API_KEY not configured' }
  }

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,    // 광고/nav/footer 제거
        waitFor: 2000,             // JS 렌더링 대기 2초
        timeout: 30000,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return { success: false, error: `Firecrawl ${res.status}: ${body}` }
    }

    const json = await res.json()

    if (!json.success || !json.data?.markdown) {
      return { success: false, error: 'Firecrawl returned empty content' }
    }

    return {
      success: true,
      data: {
        markdown: json.data.markdown as string,
        title: (json.data.metadata?.title as string) ?? '',
        url: (json.data.metadata?.sourceURL as string) ?? url,
        statusCode: (json.data.metadata?.statusCode as number) ?? 200,
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * iHerb 카테고리 베스트셀러 페이지 URL 생성
 * 예: getIherbCategoryUrl('health') → iHerb 건강식품 베스트셀러
 */
export function getIherbCategoryUrl(category: string): string {
  const categoryMap: Record<string, string> = {
    health: 'https://www.iherb.com/c/vitamins?sort=6',           // 베스트셀러순
    beauty: 'https://www.iherb.com/c/beauty?sort=6',
    sports: 'https://www.iherb.com/c/sports?sort=6',
  }
  return categoryMap[category] ?? `https://www.iherb.com/c/${category}?sort=6`
}
```

- [ ] **Step 2: .env.local.example에 FIRECRAWL_API_KEY 추가**

`lib/firecrawl.ts` 파일이 참조하는 `.env.local.example`에 아래 줄 추가:
```
# Firecrawl (상품 스크래핑)
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

- [ ] **Step 3: 커밋**

```bash
git add lib/firecrawl.ts .env.local.example
git commit -m "feat: Firecrawl API 래퍼 추가"
```

---

## Task 3: OpenRouter AI 구조화 추출

**Files:**
- Create: `lib/product-extractor.ts`

OpenRouter가 상품 페이지 Markdown을 분석해 구조화된 상품 데이터를 반환한다. confidence가 0.7 미만이면 손실 방지 게이트에서 차단.

- [ ] **Step 1: lib/product-extractor.ts 작성**

```typescript
// lib/product-extractor.ts
// OpenRouter AI로 상품 페이지 Markdown에서 구조화 데이터 추출

export interface ExtractedProduct {
  name: string
  overseasPrice: number           // USD
  currency: string                // 'USD' | 'EUR' | ...
  category: 'health' | 'sports' | 'beauty' | 'outdoor' | 'electronics' | 'food' | 'medicine' | 'other'
  description: string
  brand: string
  reviewCount: number
  avgRating: number               // 0.0 ~ 5.0
  // Sniper Score 입력값 추정 (1-5)
  demandScore: number
  priceCompetitivenessScore: number
  shippingStabilityScore: number
  competitionLevel: 'low' | 'medium' | 'high'
  pageConvincingScore: number
  automationScore: number
  imageUrl: string
  // 신뢰도
  confidence: number              // 0.0 ~ 1.0
  confidenceReasons: string[]     // confidence가 낮은 이유
}

export interface ExtractResult {
  success: true
  product: ExtractedProduct
}

export interface ExtractError {
  success: false
  error: string
}

const EXTRACTION_PROMPT = `You are a product data extractor for a Korean import reselling business.

Analyze the following product page markdown and extract structured data.
Return ONLY valid JSON matching the schema below. No explanation, no markdown.

SCHEMA:
{
  "name": "full product name in Korean if possible, otherwise English",
  "overseasPrice": number (USD, numeric only, no currency symbol),
  "currency": "USD",
  "category": one of ["health","sports","beauty","outdoor","electronics","food","medicine","other"],
  "description": "1-2 sentence product description in Korean",
  "brand": "brand name",
  "reviewCount": number (0 if not found),
  "avgRating": number 0.0-5.0 (0 if not found),
  "demandScore": number 1-5 (estimate from review count: <100=1, <500=2, <2000=3, <5000=4, >=5000=5),
  "priceCompetitivenessScore": number 1-5 (how cheap vs Korean market: very cheap=5, similar=3, expensive=1),
  "shippingStabilityScore": number 1-5 (iHerb/Amazon=4, unknown=3),
  "competitionLevel": one of ["low","medium","high"],
  "pageConvincingScore": number 1-5 (product page quality: many photos+reviews=5),
  "automationScore": number 1-5 (simple product=5, complex options=2),
  "imageUrl": "main product image URL or empty string",
  "confidence": number 0.0-1.0 (how confident you are in price accuracy),
  "confidenceReasons": ["reason1 if confidence < 0.8"]
}

CONFIDENCE RULES (reduce confidence for):
- Price not clearly visible: -0.4
- Price in non-USD currency: -0.2
- Multiple price options (size/flavor): -0.1
- Product name unclear: -0.2
- Page is a category/list page (not single product): -0.5

PRODUCT PAGE MARKDOWN:
`

export async function extractProductData(
  markdown: string,
  sourceUrl: string
): Promise<ExtractResult | ExtractError> {
  const apiKey = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini'

  if (!apiKey) {
    return { success: false, error: 'OPENROUTER_API_KEY not configured' }
  }

  // Markdown 앞 4000자만 전송 (토큰 절약 + 가격 정보는 보통 상단에 있음)
  const trimmedMarkdown = markdown.slice(0, 4000)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://sniper-buying-dashboard.vercel.app',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: EXTRACTION_PROMPT + trimmedMarkdown,
          },
        ],
        temperature: 0,            // 일관된 추출을 위해 temperature=0
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      return { success: false, error: `OpenRouter ${res.status}` }
    }

    const json = await res.json()
    const content = json.choices?.[0]?.message?.content

    if (!content) {
      return { success: false, error: 'OpenRouter returned empty content' }
    }

    const parsed = JSON.parse(content) as ExtractedProduct

    // 최소 필드 검증
    if (!parsed.name || !parsed.overseasPrice || parsed.overseasPrice <= 0) {
      return {
        success: false,
        error: `Extraction failed: name="${parsed.name}" price=${parsed.overseasPrice}`,
      }
    }

    // 가격 범위 게이트: $0 초과 $10,000 미만
    if (parsed.overseasPrice > 10000) {
      return {
        success: false,
        error: `Price out of range: $${parsed.overseasPrice} — likely extraction error`,
      }
    }

    return { success: true, product: parsed }
  } catch (err) {
    return { success: false, error: `Parse error: ${String(err)}` }
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/product-extractor.ts
git commit -m "feat: OpenRouter AI 상품 구조화 추출 모듈 추가"
```

---

## Task 4: 발굴 파이프라인 오케스트레이터

**Files:**
- Create: `lib/discovery-pipeline.ts`

단건 URL → Firecrawl → AI 추출 → 손실 방지 게이트 → 마진 계산 → Supabase 저장의 전체 흐름을 담당.

- [ ] **Step 1: lib/discovery-pipeline.ts 작성**

```typescript
// lib/discovery-pipeline.ts
// URL 하나를 받아 raw_candidate 검증 → products(candidate) 저장까지 처리

import { scrapeUrl } from './firecrawl'
import { extractProductData } from './product-extractor'
import { calculateMargin, calculateSniperScore, getRiskLevel } from './calculator'
import { createServiceClient } from './supabase/server'

const CONFIDENCE_THRESHOLD = 0.7  // 이 미만이면 raw_candidates에서 차단

export type DiscoverySite = 'iherb' | 'amazon' | 'vitacost' | 'costco' | 'other'

export interface DiscoverySuccess {
  status: 'created' | 'duplicate'
  productId?: string
  rawCandidateId?: string
  sniperScore?: number
  marginRate?: number
}

export interface DiscoveryFailure {
  status: 'failed'
  reason: string
  rawCandidateId?: string        // 실패해도 raw_candidates에 저장됨
}

export type DiscoveryResult = DiscoverySuccess | DiscoveryFailure

/**
 * URL 하나를 완전히 처리해 products 테이블에 candidate로 저장.
 * 실패 시에도 raw_candidates에 근거 저장.
 */
export async function discoverUrl(
  url: string,
  site: DiscoverySite
): Promise<DiscoveryResult> {
  const supabase = createServiceClient()
  if (!supabase) {
    return { status: 'failed', reason: 'Supabase service role not configured' }
  }

  // ── 1. 중복 체크 ──────────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('source_url', url)
    .maybeSingle()

  if (existing) {
    return { status: 'duplicate', productId: existing.id }
  }

  // ── 2. 스크래핑 ───────────────────────────────────────────────────────────
  const scrapeResult = await scrapeUrl(url)
  if (!scrapeResult.success) {
    return { status: 'failed', reason: `Scrape failed: ${scrapeResult.error}` }
  }

  // ── 3. AI 추출 ────────────────────────────────────────────────────────────
  const extractResult = await extractProductData(scrapeResult.data.markdown, url)

  // raw_candidates에 항상 저장 (성공/실패 모두)
  const { data: rawRow } = await supabase
    .from('raw_candidates')
    .insert({
      source_url: url,
      source_site: site,
      raw_markdown: scrapeResult.data.markdown.slice(0, 10000), // 최대 10KB
      extracted_data: extractResult.success ? extractResult.product : null,
      confidence: extractResult.success ? extractResult.product.confidence : 0,
      validation_status: extractResult.success ? 'pending' : 'failed',
      validation_errors: extractResult.success
        ? null
        : [{ error: extractResult.error }],
    })
    .select('id')
    .single()

  const rawCandidateId: string | undefined = rawRow?.id

  if (!extractResult.success) {
    return {
      status: 'failed',
      reason: `Extraction failed: ${extractResult.error}`,
      rawCandidateId,
    }
  }

  const p = extractResult.product

  // ── 4. 손실 방지 게이트: confidence < 0.7 차단 ───────────────────────────
  if (p.confidence < CONFIDENCE_THRESHOLD) {
    await supabase
      .from('raw_candidates')
      .update({
        validation_status: 'failed',
        validation_errors: [
          {
            error: `confidence ${p.confidence} < threshold ${CONFIDENCE_THRESHOLD}`,
            reasons: p.confidenceReasons,
          },
        ],
      })
      .eq('id', rawCandidateId)

    return {
      status: 'failed',
      reason: `Confidence too low: ${p.confidence} (reasons: ${p.confidenceReasons.join(', ')})`,
      rawCandidateId,
    }
  }

  // ── 5. 실시간 환율 조회 ──────────────────────────────────────────────────
  let exchangeRate = 1350 // fallback
  try {
    const rateRes = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/exchange-rate`
    )
    if (rateRes.ok) {
      const rateJson = await rateRes.json()
      if (rateJson.rate) exchangeRate = rateJson.rate
    }
  } catch {
    // fallback 사용
  }

  // ── 6. 마진 계산 ──────────────────────────────────────────────────────────
  const localShippingCost = 3.0  // 기본값 $3 (iHerb 등)
  const internationalShippingCost = 5000  // KRW
  const domesticShippingCost = 3000       // KRW
  const paymentFee = Math.round(p.overseasPrice * exchangeRate * 0.025)

  // 국내 판매가 = 해외원가 × 환율 × 1.8 (관리자가 나중에 조정)
  const domesticExpectedPrice = Math.round(p.overseasPrice * exchangeRate * 1.8)

  const riskLevel = getRiskLevel(0, p.category === 'other' ? 'health' : p.category)

  const marginResult = calculateMargin({
    overseasPrice: p.overseasPrice,
    exchangeRate,
    localShippingCost,
    internationalShippingCost,
    customsDuty: 0,
    vat: 0,
    domesticShippingCost,
    paymentFee,
    otherCosts: 500,
    domesticExpectedPrice,
  })

  const sniperResult = calculateSniperScore({
    demandScore: p.demandScore,
    priceCompetitivenessScore: p.priceCompetitivenessScore,
    marginRate: marginResult.marginRate,
    shippingStabilityScore: p.shippingStabilityScore,
    riskLevel,
    competitionLevel: p.competitionLevel,
    pageConvincingScore: p.pageConvincingScore,
    automationScore: p.automationScore,
  })

  // ── 7. products 저장 ──────────────────────────────────────────────────────
  const productId = crypto.randomUUID()

  const { error: insertError } = await supabase.from('products').insert({
    id: productId,
    name: p.name,
    category: p.category === 'other' ? 'health' : p.category,
    description: p.description,
    overseas_price: p.overseasPrice,
    local_shipping_cost: localShippingCost,
    international_shipping_cost: internationalShippingCost,
    domestic_expected_price: domesticExpectedPrice,
    tax_estimate: 0,
    payment_fee: paymentFee,
    domestic_shipping_cost: domesticShippingCost,
    other_costs: 500,
    total_cost: marginResult.totalCost,
    expected_margin: marginResult.expectedMargin,
    margin_rate: marginResult.marginRate,
    sniper_score: sniperResult.total,
    risk_level: riskLevel,
    source_url: url,
    competitor_url: '',
    status: 'candidate',
    demand_score: p.demandScore,
    price_competitiveness_score: p.priceCompetitivenessScore,
    shipping_stability_score: p.shippingStabilityScore,
    competition_level: p.competitionLevel,
    page_convincing_score: p.pageConvincingScore,
    automation_score: p.automationScore,
    image_url: p.imageUrl || null,
    // 신규 컬럼
    exchange_rate_snapshot: exchangeRate,
    ai_confidence: p.confidence,
    raw_candidate_id: rawCandidateId,
    source_site: site,
  })

  if (insertError) {
    // unique constraint 위반 = 중복
    if (insertError.code === '23505') {
      return { status: 'duplicate' }
    }
    return { status: 'failed', reason: `DB insert failed: ${insertError.message}`, rawCandidateId }
  }

  // raw_candidate 상태 업데이트
  await supabase
    .from('raw_candidates')
    .update({ validation_status: 'passed' })
    .eq('id', rawCandidateId)

  // price_snapshot 기록
  await supabase.from('price_snapshots').insert({
    product_id: productId,
    exchange_rate: exchangeRate,
    overseas_price: p.overseasPrice,
    total_cost: marginResult.totalCost,
    margin_rate: marginResult.marginRate,
    sniper_score: sniperResult.total,
    trigger: 'discovery',
  })

  return {
    status: 'created',
    productId,
    rawCandidateId,
    sniperScore: sniperResult.total,
    marginRate: marginResult.marginRate,
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/discovery-pipeline.ts
git commit -m "feat: 상품 발굴 파이프라인 오케스트레이터 추가 (손실 방지 게이트 내장)"
```

---

## Task 5: 단건 URL 분석 API

**Files:**
- Create: `app/api/discover/url/route.ts`

- [ ] **Step 1: route.ts 작성**

```typescript
// app/api/discover/url/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { discoverUrl, type DiscoverySite } from '@/lib/discovery-pipeline'
import { notifyAdmin } from '@/lib/notify'

const VALID_SITES: DiscoverySite[] = ['iherb', 'amazon', 'vitacost', 'costco', 'other']

function detectSite(url: string): DiscoverySite {
  if (url.includes('iherb.com')) return 'iherb'
  if (url.includes('amazon.com') || url.includes('amazon.co')) return 'amazon'
  if (url.includes('vitacost.com')) return 'vitacost'
  if (url.includes('costco.com')) return 'costco'
  return 'other'
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  let body: { url?: string; site?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url, site: siteInput } = body

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url 필드가 필요합니다.' }, { status: 400 })
  }

  // URL 유효성 검사
  try {
    new URL(url)
  } catch {
    return NextResponse.json({ error: '유효하지 않은 URL입니다.' }, { status: 400 })
  }

  const site: DiscoverySite =
    siteInput && VALID_SITES.includes(siteInput as DiscoverySite)
      ? (siteInput as DiscoverySite)
      : detectSite(url)

  const result = await discoverUrl(url, site)

  if (result.status === 'created') {
    await notifyAdmin(
      `새 상품 후보 발굴: Score ${result.sniperScore}점 / 마진 ${result.marginRate?.toFixed(1)}%`,
      'info',
      { url, site, sniperScore: result.sniperScore, marginRate: result.marginRate }
    )
    return NextResponse.json({ result }, { status: 201 })
  }

  if (result.status === 'duplicate') {
    return NextResponse.json({ result }, { status: 200 })
  }

  // failed
  return NextResponse.json({ result }, { status: 422 })
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/api/discover/url/route.ts
git commit -m "feat: POST /api/discover/url — 단건 URL 상품 발굴 API"
```

---

## Task 6: 카테고리 스캔 큐 API

**Files:**
- Create: `app/api/discover/scan/route.ts`
- Create: `app/api/discover/jobs/route.ts`

카테고리 스캔은 즉시 처리하지 않고 scan_jobs/scan_items 큐에 저장 후 200 응답. 실제 처리는 Task 7의 process API가 담당.

- [ ] **Step 1: app/api/discover/scan/route.ts 작성**

```typescript
// app/api/discover/scan/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getIherbCategoryUrl } from '@/lib/firecrawl'

// iHerb 카테고리별 베스트셀러 상품 URL 목록 (하드코딩된 시드 목록)
// 실제 운영 시 Firecrawl로 카테고리 페이지 스크래핑 후 상품 URL 추출로 확장 가능
const IHERB_SEED_URLS: Record<string, string[]> = {
  health: [
    'https://www.iherb.com/pr/now-foods-vitamin-d-3-5-000-iu/14888',
    'https://www.iherb.com/pr/jarrow-formulas-methylcobalamin/454',
    'https://www.iherb.com/pr/now-foods-omega-3/389',
    'https://www.iherb.com/pr/natrol-melatonin-fast-dissolve/27081',
    'https://www.iherb.com/pr/california-gold-nutrition-vitamin-c/52970',
  ],
  sports: [
    'https://www.iherb.com/pr/optimum-nutrition-gold-standard-100-whey-protein/27569',
    'https://www.iherb.com/pr/now-foods-l-glutamine-powder/21167',
  ],
  beauty: [
    'https://www.iherb.com/pr/derma-e-vitamin-c-serum/62370',
    'https://www.iherb.com/pr/andalou-naturals-1000-roses/70440',
  ],
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  let body: { site?: string; category?: string; urls?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { site = 'iherb', category = 'health', urls: customUrls } = body

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 503 })
  }

  // URL 목록 결정: 직접 입력 > 시드 목록
  const urlsToScan: string[] =
    customUrls && customUrls.length > 0
      ? customUrls.slice(0, 50)  // 최대 50개
      : (IHERB_SEED_URLS[category] ?? IHERB_SEED_URLS.health)

  // scan_job 생성
  const { data: job, error: jobError } = await supabase
    .from('scan_jobs')
    .insert({
      job_type: 'category_scan',
      source_site: site,
      category,
      status: 'queued',
      total_items: urlsToScan.length,
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Failed to create scan job' }, { status: 500 })
  }

  // scan_items 생성
  const items = urlsToScan.map((url) => ({
    job_id: job.id,
    url,
    status: 'queued' as const,
  }))

  const { error: itemsError } = await supabase.from('scan_items').insert(items)
  if (itemsError) {
    return NextResponse.json({ error: 'Failed to create scan items' }, { status: 500 })
  }

  return NextResponse.json({
    jobId: job.id,
    totalItems: urlsToScan.length,
    message: `${urlsToScan.length}개 상품 스캔 큐에 등록됨. Make.com이 순차 처리합니다.`,
  })
}
```

- [ ] **Step 2: app/api/discover/jobs/route.ts 작성**

```typescript
// app/api/discover/jobs/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ jobs: [] })
  }

  const { data: jobs, error } = await supabase
    .from('scan_jobs')
    .select('id, job_type, source_site, category, status, total_items, processed_items, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: 'Failed to load scan jobs' }, { status: 500 })
  }

  return NextResponse.json({ jobs: jobs ?? [] })
}
```

- [ ] **Step 3: 빌드 확인 + 커밋**

```bash
npx tsc --noEmit
git add app/api/discover/scan/route.ts app/api/discover/jobs/route.ts
git commit -m "feat: 카테고리 스캔 큐 API (scan/jobs) 추가"
```

---

## Task 7: scan_item 처리 API (Make.com 호출 대상)

**Files:**
- Create: `app/api/discover/process/route.ts`

Make.com이 이 엔드포인트를 scan_items 수만큼 순차 호출. 각 호출은 URL 1개를 처리하고 scan_item 상태를 업데이트.

- [ ] **Step 1: app/api/discover/process/route.ts 작성**

```typescript
// app/api/discover/process/route.ts
// Make.com → 이 엔드포인트를 scan_item 1개씩 순차 호출
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { hasValidAutomationSecret } from '@/lib/automation-auth'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { cookies } from 'next/headers'
import { discoverUrl, type DiscoverySite } from '@/lib/discovery-pipeline'
import { notifyAdmin } from '@/lib/notify'

async function isAuthorized(request: Request) {
  if (hasValidAutomationSecret(request)) return true
  const cookieStore = await cookies()
  return isAdminAuthenticated(cookieStore)
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { jobId?: string; itemId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { jobId, itemId } = body
  if (!jobId && !itemId) {
    return NextResponse.json({ error: 'jobId 또는 itemId 필요' }, { status: 400 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // itemId 직접 지정 or jobId로 queued 항목 1개 선택
  let item: { id: string; job_id: string; url: string; status: string } | null = null

  if (itemId) {
    const { data } = await supabase
      .from('scan_items')
      .select('id, job_id, url, status')
      .eq('id', itemId)
      .single()
    item = data
  } else {
    const { data } = await supabase
      .from('scan_items')
      .select('id, job_id, url, status')
      .eq('job_id', jobId)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    item = data
  }

  if (!item) {
    return NextResponse.json({ message: '처리할 항목 없음', done: true })
  }

  if (item.status !== 'queued') {
    return NextResponse.json({ message: `이미 처리됨: ${item.status}`, done: false })
  }

  // processing 상태로 변경
  await supabase
    .from('scan_items')
    .update({ status: 'processing' })
    .eq('id', item.id)

  // 상품 발굴 실행
  const { data: jobRow } = await supabase
    .from('scan_jobs')
    .select('source_site')
    .eq('id', item.job_id)
    .single()

  const site = (jobRow?.source_site ?? 'other') as DiscoverySite
  const result = await discoverUrl(item.url, site)

  const isDone = result.status === 'created' || result.status === 'duplicate' || result.status === 'failed'

  await supabase
    .from('scan_items')
    .update({
      status: isDone ? (result.status === 'failed' ? 'failed' : 'done') : 'failed',
      result_product_id: result.status === 'created' ? result.productId : null,
      error_message: result.status === 'failed' ? result.reason : null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', item.id)

  // job 진행률 업데이트
  await supabase.rpc('increment_scan_job_processed', { job_id_input: item.job_id })
    .catch(() => {
      // RPC 없으면 수동 업데이트
      supabase
        .from('scan_jobs')
        .update({ processed_items: supabase.raw('processed_items + 1') as unknown as number })
        .eq('id', item.job_id)
        .then(() => {})
    })

  // 잔여 queued 항목 수 확인
  const { count: remaining } = await supabase
    .from('scan_items')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', item.job_id)
    .eq('status', 'queued')

  const allDone = (remaining ?? 0) === 0
  if (allDone) {
    await supabase
      .from('scan_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', item.job_id)

    const { count: createdCount } = await supabase
      .from('scan_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', item.job_id)
      .eq('status', 'done')

    await notifyAdmin(
      `스캔 완료: ${createdCount ?? 0}개 후보 발굴`,
      'info',
      { jobId: item.job_id, created: createdCount }
    )
  }

  return NextResponse.json({ result, itemId: item.id, remainingItems: remaining ?? 0 })
}
```

- [ ] **Step 2: scan_job processed_items 증가용 Supabase RPC 생성 (SQL Editor 실행)**

```sql
CREATE OR REPLACE FUNCTION increment_scan_job_processed(job_id_input UUID)
RETURNS void AS $$
BEGIN
  UPDATE scan_jobs
  SET processed_items = processed_items + 1
  WHERE id = job_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 3: 빌드 확인 + 커밋**

```bash
npx tsc --noEmit
git add app/api/discover/process/route.ts
git commit -m "feat: POST /api/discover/process — Make.com scan_item 처리 API"
```

---

## Task 8: 검증된 후보 목록 API

**Files:**
- Create: `app/api/discover/candidates/route.ts`

- [ ] **Step 1: route.ts 작성**

```typescript
// app/api/discover/candidates/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ candidates: [] })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100)

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name, category, source_url, source_site, status, sniper_score, margin_rate, ' +
      'expected_margin, domestic_expected_price, overseas_price, risk_level, ' +
      'ai_confidence, exchange_rate_snapshot, image_url, created_at'
    )
    .eq('status', 'candidate')
    .order('sniper_score', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: 'Failed to load candidates' }, { status: 500 })
  }

  return NextResponse.json({ candidates: data ?? [] })
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/api/discover/candidates/route.ts
git commit -m "feat: GET /api/discover/candidates — 검증된 후보 목록 API"
```

---

## Task 9: 환율 변동 감지 & 마진 재계산 모니터

**Files:**
- Create: `lib/margin-monitor.ts`
- Create: `app/api/discover/monitor/route.ts`

환율이 ±3% 이상 변동되면 active 상품 전체 마진을 재계산하고 15% 미만이면 경보.

- [ ] **Step 1: lib/margin-monitor.ts 작성**

```typescript
// lib/margin-monitor.ts
// 환율 변동 감지 → 마진 재계산 → 손실 경보

import { calculateMargin, calculateSniperScore, getRiskLevel } from './calculator'
import { createServiceClient } from './supabase/server'
import { notifyAdmin } from './notify'

const RATE_CHANGE_THRESHOLD = 0.03   // 3% 이상 변동 시 재계산
const MARGIN_ALERT_THRESHOLD = 15    // 마진율 15% 미만 경보

export interface MonitorResult {
  checkedProducts: number
  recalculated: number
  alerts: number
  currentRate: number
  previousRate: number | null
  rateChangePercent: number
}

export async function runMarginMonitor(currentRate: number): Promise<MonitorResult> {
  const supabase = createServiceClient()
  if (!supabase) throw new Error('Supabase not configured')

  // 직전 환율 스냅샷 (최신)
  const { data: lastSnapshot } = await supabase
    .from('price_snapshots')
    .select('exchange_rate, recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single()

  const previousRate = lastSnapshot?.exchange_rate ?? null
  const rateChangePercent = previousRate
    ? Math.abs((currentRate - previousRate) / previousRate)
    : 0

  // 변동 3% 미만이면 스킵
  if (previousRate && rateChangePercent < RATE_CHANGE_THRESHOLD) {
    return {
      checkedProducts: 0,
      recalculated: 0,
      alerts: 0,
      currentRate,
      previousRate,
      rateChangePercent,
    }
  }

  // 판매중(active) + 후보(candidate) 상품 전체 조회
  const { data: products, error } = await supabase
    .from('products')
    .select(
      'id, name, category, overseas_price, local_shipping_cost, international_shipping_cost, ' +
      'domestic_expected_price, tax_estimate, payment_fee, domestic_shipping_cost, other_costs, ' +
      'demand_score, price_competitiveness_score, shipping_stability_score, ' +
      'competition_level, page_convincing_score, automation_score, risk_level, margin_rate'
    )
    .in('status', ['active', 'candidate'])

  if (error || !products) throw error ?? new Error('No products')

  let recalculated = 0
  let alerts = 0
  const alertMessages: string[] = []

  for (const p of products) {
    const paymentFee = Math.round(p.overseas_price * currentRate * 0.025)

    const margin = calculateMargin({
      overseasPrice: p.overseas_price,
      exchangeRate: currentRate,
      localShippingCost: p.local_shipping_cost,
      internationalShippingCost: p.international_shipping_cost,
      customsDuty: 0,
      vat: 0,
      domesticShippingCost: p.domestic_shipping_cost,
      paymentFee,
      otherCosts: p.other_costs,
      domesticExpectedPrice: p.domestic_expected_price,
    })

    const sniper = calculateSniperScore({
      demandScore: p.demand_score,
      priceCompetitivenessScore: p.price_competitiveness_score,
      marginRate: margin.marginRate,
      shippingStabilityScore: p.shipping_stability_score,
      riskLevel: p.risk_level,
      competitionLevel: p.competition_level,
      pageConvincingScore: p.page_convincing_score,
      automationScore: p.automation_score,
    })

    // DB 업데이트
    await supabase.from('products').update({
      total_cost: margin.totalCost,
      expected_margin: margin.expectedMargin,
      margin_rate: margin.marginRate,
      sniper_score: sniper.total,
      exchange_rate_snapshot: currentRate,
      payment_fee: paymentFee,
    }).eq('id', p.id)

    // 스냅샷 기록
    await supabase.from('price_snapshots').insert({
      product_id: p.id,
      exchange_rate: currentRate,
      overseas_price: p.overseas_price,
      total_cost: margin.totalCost,
      margin_rate: margin.marginRate,
      sniper_score: sniper.total,
      trigger: 'rate_change',
    })

    recalculated++

    // 마진 15% 미만 경보
    if (margin.marginRate < MARGIN_ALERT_THRESHOLD) {
      alerts++
      alertMessages.push(`${p.name}: 마진 ${margin.marginRate.toFixed(1)}%`)

      // agent_findings 생성
      await supabase.from('agent_findings').insert({
        agent_type: 'margin_pricing',
        severity: 'critical',
        title: `마진 위험: ${p.name}`,
        summary: `환율 변동(${previousRate?.toFixed(0)} → ${currentRate})으로 마진율이 ${margin.marginRate.toFixed(1)}%로 하락. 즉시 가격 검토 필요.`,
        target_type: 'product',
        target_id: p.id,
        confidence: 0.95,
        payload: {
          previousMarginRate: p.margin_rate,
          newMarginRate: margin.marginRate,
          exchangeRate: currentRate,
        },
      })
    }
  }

  // 경보 Slack 발송
  if (alerts > 0) {
    await notifyAdmin(
      `🚨 환율 변동 마진 경보\n환율: ${previousRate?.toFixed(0)} → ${currentRate} (+${(rateChangePercent * 100).toFixed(1)}%)\n\n위험 상품 ${alerts}개:\n${alertMessages.join('\n')}`,
      'critical',
      { rateChange: `${(rateChangePercent * 100).toFixed(1)}%`, alertCount: alerts }
    )
  } else if (recalculated > 0) {
    await notifyAdmin(
      `환율 변동 마진 재계산 완료 (${recalculated}개 상품). 위험 상품 없음.`,
      'warning',
      { currentRate, previousRate, recalculated }
    )
  }

  return {
    checkedProducts: products.length,
    recalculated,
    alerts,
    currentRate,
    previousRate,
    rateChangePercent,
  }
}
```

- [ ] **Step 2: app/api/discover/monitor/route.ts 작성**

```typescript
// app/api/discover/monitor/route.ts
// Make.com 스케줄 (매일 1회) → 환율 변동 감지 + 마진 재계산
import { NextResponse } from 'next/server'
import { hasValidAutomationSecret } from '@/lib/automation-auth'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { cookies } from 'next/headers'
import { runMarginMonitor } from '@/lib/margin-monitor'

async function isAuthorized(request: Request) {
  if (hasValidAutomationSecret(request)) return true
  const cookieStore = await cookies()
  return isAdminAuthenticated(cookieStore)
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 실시간 환율 조회
  let currentRate = 1350
  try {
    const rateRes = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/exchange-rate`
    )
    if (rateRes.ok) {
      const rateJson = await rateRes.json()
      if (rateJson.rate) currentRate = rateJson.rate
    }
  } catch {
    // fallback 사용
  }

  try {
    const result = await runMarginMonitor(currentRate)
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[POST /api/discover/monitor]', err)
    return NextResponse.json({ error: 'Monitor failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: 빌드 확인 + 커밋**

```bash
npx tsc --noEmit
git add lib/margin-monitor.ts app/api/discover/monitor/route.ts
git commit -m "feat: 환율 변동 마진 모니터 + 손실 경보 시스템"
```

---

## Task 10: 관리자 발굴 대시보드 UI

**Files:**
- Create: `app/admin/discover/page.tsx`

- [ ] **Step 1: app/admin/discover/page.tsx 작성**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Scan, ExternalLink, CheckCircle, XCircle, Clock, TrendingUp } from 'lucide-react'
import { formatKRW, getCategoryLabel, getStatusLabel } from '@/lib/utils'
import { getSniperGrade } from '@/lib/calculator'

type Candidate = {
  id: string
  name: string
  category: string
  source_url: string
  source_site: string
  sniper_score: number
  margin_rate: number
  expected_margin: number
  domestic_expected_price: number
  overseas_price: number
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  ai_confidence: number
  exchange_rate_snapshot: number
  image_url?: string
  created_at: string
}

type ScanJob = {
  id: string
  job_type: string
  source_site: string
  category: string
  status: string
  total_items: number
  processed_items: number
  created_at: string
}

export default function DiscoverPage() {
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlResult, setUrlResult] = useState<string | null>(null)

  const [scanSite, setScanSite] = useState('iherb')
  const [scanCategory, setScanCategory] = useState('health')
  const [scanLoading, setScanLoading] = useState(false)

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [jobs, setJobs] = useState<ScanJob[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const [candRes, jobsRes] = await Promise.all([
      fetch('/api/discover/candidates'),
      fetch('/api/discover/jobs'),
    ])
    if (candRes.ok) {
      const d = await candRes.json()
      setCandidates(d.candidates ?? [])
    }
    if (jobsRes.ok) {
      const d = await jobsRes.json()
      setJobs(d.jobs ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleUrlAnalyze() {
    if (!urlInput.trim()) return
    setUrlLoading(true)
    setUrlResult(null)
    try {
      const res = await fetch('/api/discover/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })
      const data = await res.json()
      if (res.status === 201) {
        setUrlResult(`✅ 발굴 완료: Sniper Score ${data.result.sniperScore}점`)
        fetchData()
      } else if (res.status === 200) {
        setUrlResult('ℹ️ 이미 등록된 상품입니다.')
      } else {
        setUrlResult(`❌ 실패: ${data.result?.reason ?? data.error}`)
      }
    } catch {
      setUrlResult('❌ 네트워크 오류')
    }
    setUrlLoading(false)
  }

  async function handleCategoryScan() {
    setScanLoading(true)
    try {
      const res = await fetch('/api/discover/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: scanSite, category: scanCategory }),
      })
      const data = await res.json()
      if (res.ok) {
        alert(`스캔 등록 완료: ${data.totalItems}개 항목. Make.com이 처리합니다.`)
        fetchData()
      }
    } catch {
      alert('스캔 등록 실패')
    }
    setScanLoading(false)
  }

  async function handleApprove(productId: string) {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })
    if (res.ok) {
      setCandidates((prev) => prev.filter((c) => c.id !== productId))
    }
  }

  async function handleExclude(productId: string) {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    })
    if (res.ok) {
      setCandidates((prev) => prev.filter((c) => c.id !== productId))
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">상품 발굴</h1>
        <p className="text-muted-foreground mt-1">해외 상품을 자동 분석해 수익 후보를 발굴합니다</p>
      </div>

      {/* URL 단건 분석 */}
      <div className="card-luxury p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Search className="w-4 h-4 text-gold" />
          URL 직접 분석
        </h2>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://www.iherb.com/pr/..."
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-gold/50"
            onKeyDown={(e) => e.key === 'Enter' && handleUrlAnalyze()}
          />
          <button
            onClick={handleUrlAnalyze}
            disabled={urlLoading}
            className="px-4 py-2 bg-gold-gradient text-luxury-bg text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {urlLoading ? '분석 중...' : '분석'}
          </button>
        </div>
        {urlResult && (
          <p className="mt-2 text-sm text-muted-foreground">{urlResult}</p>
        )}
      </div>

      {/* 카테고리 스캔 */}
      <div className="card-luxury p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Scan className="w-4 h-4 text-gold" />
          카테고리 자동 스캔
        </h2>
        <div className="flex gap-2 flex-wrap">
          <select
            value={scanSite}
            onChange={(e) => setScanSite(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-foreground"
          >
            <option value="iherb">iHerb</option>
            <option value="amazon">Amazon</option>
            <option value="vitacost">Vitacost</option>
            <option value="costco">Costco</option>
          </select>
          <select
            value={scanCategory}
            onChange={(e) => setScanCategory(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-foreground"
          >
            <option value="health">건강식품</option>
            <option value="sports">운동용품</option>
            <option value="beauty">뷰티</option>
            <option value="outdoor">아웃도어</option>
          </select>
          <button
            onClick={handleCategoryScan}
            disabled={scanLoading}
            className="px-4 py-2 border border-gold/20 text-gold text-sm rounded-lg hover:bg-gold/5 disabled:opacity-50"
          >
            {scanLoading ? '등록 중...' : '스캔 시작'}
          </button>
        </div>
      </div>

      {/* 스캔 현황 */}
      {jobs.length > 0 && (
        <div className="card-luxury p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            스캔 현황
          </h2>
          <div className="space-y-2">
            {jobs.slice(0, 5).map((job) => (
              <div key={job.id} className="flex items-center justify-between text-xs py-2 border-b border-white/5">
                <span className="text-muted-foreground">
                  {job.source_site} / {job.category}
                </span>
                <span className="text-muted-foreground">
                  {job.processed_items}/{job.total_items}
                </span>
                <span className={
                  job.status === 'completed' ? 'text-green-400' :
                  job.status === 'failed' ? 'text-red-400' :
                  'text-yellow-400'
                }>
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 검증된 후보 목록 */}
      <div className="card-luxury">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gold" />
            검증된 후보 ({candidates.length}개, Sniper Score 순)
          </h2>
          <button onClick={fetchData} className="text-xs text-muted-foreground hover:text-foreground">
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">로딩 중...</div>
        ) : candidates.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            발굴된 후보가 없습니다. URL을 입력하거나 카테고리 스캔을 실행하세요.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {candidates.map((c) => {
              const { grade } = getSniperGrade(c.sniper_score)
              return (
                <div key={c.id} className="p-4 hover:bg-white/2">
                  <div className="flex items-start gap-4">
                    {/* 스코어 */}
                    <div className={`w-12 h-12 rounded-full flex flex-col items-center justify-center shrink-0 text-white ${
                      c.sniper_score >= 75 ? 'bg-green-500' :
                      c.sniper_score >= 60 ? 'bg-blue-500' :
                      c.sniper_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}>
                      <span className="text-xs font-bold">{grade}</span>
                      <span className="text-xs">{c.sniper_score}</span>
                    </div>

                    {/* 정보 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{getCategoryLabel(c.category as never)}</span>
                        <span>원가 ${c.overseas_price}</span>
                        <span>판매가 {formatKRW(c.domestic_expected_price)}</span>
                        <span className={c.margin_rate >= 25 ? 'text-green-400' : c.margin_rate >= 15 ? 'text-blue-400' : 'text-red-400'}>
                          마진 {c.margin_rate.toFixed(1)}%
                        </span>
                        <span className={c.risk_level === 'LOW' ? 'text-green-400' : c.risk_level === 'HIGH' ? 'text-red-400' : 'text-yellow-400'}>
                          {c.risk_level}
                        </span>
                        <span className="text-white/30">AI신뢰도 {(c.ai_confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* 액션 */}
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-muted-foreground hover:text-gold"
                        title="원문 확인"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleExclude(c.id)}
                        className="p-1.5 text-muted-foreground hover:text-red-400"
                        title="제외"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleApprove(c.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-500/10 text-green-400 text-xs font-semibold rounded-lg hover:bg-green-500/20"
                        title="판매 승인"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npx tsc --noEmit && npx next build 2>&1 | tail -20
```

Expected: ✓ Compiled successfully

- [ ] **Step 3: 커밋**

```bash
git add app/admin/discover/page.tsx
git commit -m "feat: /admin/discover — 상품 발굴 관리자 대시보드 UI"
```

---

## Task 11: Vercel & 네비게이션 연결

**Files:**
- Modify: `app/admin/layout.tsx` 또는 네비게이션 컴포넌트 (존재 시)
- Modify: `.env.local` (FIRECRAWL_API_KEY 추가)

- [ ] **Step 1: FIRECRAWL_API_KEY 환경변수 추가**

1. https://firecrawl.dev 에서 무료 계정 생성 → API 키 발급
2. Vercel 대시보드 → sniper-buying-dashboard → Settings → Environment Variables:
   - `FIRECRAWL_API_KEY` = 발급받은 키 (Production + Preview + Development)
3. `.env.local`에도 동일 키 추가 (로컬 테스트용)

- [ ] **Step 2: 네비게이션에 발굴 메뉴 추가**

기존 admin 네비게이션 컴포넌트 찾아서 `/admin/discover` 링크 추가:

```bash
grep -r "admin/margins\|admin/customers" app/ --include="*.tsx" -l
```

찾은 파일에서 기존 링크 패턴 따라 아래 항목 추가:
```tsx
<Link href="/admin/discover">
  <button className="...">
    <Search className="w-4 h-4" />
    상품 발굴
  </button>
</Link>
```

- [ ] **Step 3: Vercel Redeploy 후 동작 확인**

```
1. /admin/discover 접속
2. iHerb 상품 URL 1개 입력 → 분석 실행
3. 결과 확인: Sniper Score + 마진율 표시
4. Approve 클릭 → /admin 대시보드에서 active 상품 확인
```

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "feat: 상품 발굴 시스템 완성 — Firecrawl+AI 파이프라인, 손실 방지 게이트, 마진 모니터"
```

---

## Make.com 연동 설정 (구현 후 수동 설정)

Task 7의 `/api/discover/process`와 Task 9의 `/api/discover/monitor`를 Make.com 스케줄에 연결:

**Scenario 1: 스캔 아이템 처리**
- Trigger: Webhook or Schedule (5분 간격)
- HTTP Module: `POST https://sniper-buying-dashboard.vercel.app/api/discover/process`
- Headers: `X-Automation-Secret: {AUTOMATION_WEBHOOK_SECRET}`
- Body: `{"jobId": "{{jobId}}"}`
- 반복: remaining_items > 0 이면 계속 호출

**Scenario 2: 일일 마진 모니터**
- Trigger: Schedule (매일 오전 9시)
- HTTP Module: `POST https://sniper-buying-dashboard.vercel.app/api/discover/monitor`
- Headers: `X-Automation-Secret: {AUTOMATION_WEBHOOK_SECRET}`
