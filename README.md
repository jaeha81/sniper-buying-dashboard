# 🎯 Sniper Buying Dashboard

> **1인 기업 해외 구매대행 쇼핑몰 + 관리자 대시보드 MVP**
> Sniper Score로 수익성 높은 상품만 저격한다.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-green?logo=supabase)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Vercel-black?logo=vercel)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📌 프로젝트 소개

**Sniper Buying Dashboard**는 해외 구매대행 쇼핑몰 운영자를 위한 올인원 MVP 플랫폼입니다.

단순히 상품을 나열하는 것에서 벗어나, **Sniper Score**라는 독자적인 100점 만점 수익성 평가 지표를 통해 마진이 보장되는 상품만 선별하여 판매합니다. 소비자에게는 빠르고 안전한 해외직구 경험을, 운영자에게는 데이터 기반의 상품 관리와 자동화 도구를 제공합니다.

### 핵심 철학
- **저격(Sniper)**: 아무 상품이나 팔지 않는다. 수익성 검증된 상품만 취급한다.
- **무료/저비용 우선**: Supabase Free, Vercel Hobby, Make.com Free 활용으로 초기 비용 최소화
- **자동화 우선**: 반복 작업(재고 확인, 환율 업데이트, 주문 알림)은 Make.com으로 자동화
- **1인 운영 최적화**: 오프라인 판매 없음, 재고 미보유(드롭쉬핑 또는 소량 사입), 복잡한 물류 제외

---

## 🏗️ 기술 스택

| 영역 | 기술 | 선택 이유 |
|------|------|----------|
| 프론트엔드 | Next.js 15 + TypeScript | App Router, SSR/SSG, 타입 안정성 |
| UI | Tailwind CSS + shadcn/ui | 빠른 개발, 일관된 디자인 |
| 백엔드 | Next.js API Routes | 서버리스, 별도 백엔드 불필요 |
| DB / Auth | Supabase (PostgreSQL) | 무료 티어, 실시간 구독, Auth 내장 |
| 배포 | Vercel | GitHub 연동 자동 배포, 무료 티어 |
| 자동화 | Make.com | 환율 업데이트, 재고 체크, 알림 |
| 버전 관리 | GitHub | 코드 이력, CI/CD 트리거 |

---

## 📁 폴더 구조

```
sniper-buying-dashboard/
├── app/                          # Next.js App Router
│   ├── (store)/                  # 쇼핑몰 레이아웃 그룹
│   │   ├── page.tsx              # 메인 홈
│   │   ├── products/
│   │   │   ├── page.tsx          # 상품 목록
│   │   │   └── [id]/page.tsx     # 상품 상세
│   │   ├── cart/page.tsx         # 장바구니
│   │   ├── checkout/page.tsx     # 결제
│   │   ├── order-complete/page.tsx
│   │   ├── shipping-guide/page.tsx
│   │   ├── faq/page.tsx
│   │   └── policy/
│   │       ├── privacy/page.tsx
│   │       ├── terms/page.tsx
│   │       └── refund/page.tsx
│   ├── admin/                    # 관리자 대시보드 레이아웃 그룹
│   │   ├── page.tsx              # 관리자 홈 (KPI 대시보드)
│   │   ├── products/page.tsx     # 상품 관리
│   │   ├── product-candidates/page.tsx  # 상품 후보 (Sniper Score)
│   │   ├── orders/page.tsx       # 주문 관리
│   │   ├── customers/page.tsx    # 고객 관리
│   │   ├── margins/page.tsx      # 마진 계산기
│   │   ├── automation-logs/page.tsx     # 자동화 로그
│   │   └── settings/page.tsx     # 설정
│   ├── api/                      # API Routes
│   │   ├── products/route.ts
│   │   ├── orders/route.ts
│   │   ├── margins/route.ts
│   │   └── sniper-score/route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/                   # 공통 컴포넌트
│   ├── ui/                       # shadcn/ui 컴포넌트
│   ├── store/                    # 쇼핑몰 전용 컴포넌트
│   └── admin/                    # 관리자 전용 컴포넌트
├── lib/                          # 유틸리티
│   ├── supabase.ts               # Supabase 클라이언트
│   ├── margin-calculator.ts      # 마진 계산 함수
│   ├── sniper-score.ts           # Sniper Score 계산 엔진
│   └── utils.ts
├── types/                        # TypeScript 타입 정의
│   ├── product.ts
│   ├── order.ts
│   └── margin.ts
├── docs/                         # 문서
│   ├── PRD.md
│   ├── BUSINESS_MODEL.md
│   └── MARKET_RESEARCH.md
├── supabase/                     # DB 스키마 및 마이그레이션
│   └── migrations/
├── .env.local.example            # 환경변수 예시
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

---

## 🚀 빠른 시작 (Quick Start)

### 사전 요구사항
- Node.js 18+
- npm 또는 pnpm
- Supabase 프로젝트 (무료 계정)
- Vercel 계정 (배포용, 로컬 개발 불필요)

### 1. 저장소 클론
```bash
git clone https://github.com/jaeha81/sniper-buying-dashboard.git
cd sniper-buying-dashboard
```

### 2. 의존성 설치
```bash
npm install
# 또는
pnpm install
```

### 3. 환경변수 설정
```bash
cp .env.local.example .env.local
```

`.env.local` 파일을 열고 아래 값을 입력하세요:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_EMAIL=your_admin_email@example.com
```

### 4. 데이터베이스 초기화
```bash
npx supabase db push
```

### 5. 개발 서버 실행
```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

관리자 대시보드: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## ✨ 주요 기능

### 쇼핑몰 (고객 화면)
- **상품 목록**: Sniper Score 순 정렬, 카테고리/가격 필터
- **상품 상세**: 해외 원산지, 마진 포함 국내가, 예상 배송일, 통관 안내
- **장바구니**: localStorage 기반 임시 저장, 수량 변경
- **결제**: 토스페이먼츠 또는 아임포트 연동 (Phase 2)
- **배송 가이드**: 국제배송 → 통관 → 국내배송 흐름 시각화
- **FAQ / 정책 페이지**: 구매대행 특화 자주묻는질문

### 관리자 대시보드
- **KPI 대시보드**: 월별 매출, 마진율, 주문 수, 상위 상품 요약
- **상품 후보 관리**: Sniper Score 자동 계산, 등록/미등록 분류
- **마진 계산기**: 항목별 비용 입력 → 순마진/마진율 실시간 계산
- **주문 관리**: 주문 상태(접수→결제→소싱→배송→완료) 추적
- **자동화 로그**: Make.com 시나리오 실행 이력 확인

---

## 💰 마진 공식

```
총원가 = 해외원가 + 현지배송비 + 국제배송비 + 관세예상
        + 부가세예상 + 국내배송비 + 결제수수료 + 기타비용

예상순마진 = 국내판매가 - 총원가

마진율(%) = (예상순마진 / 국내판매가) × 100
```

**목표 마진율**: 최소 25% 이상 (Sniper Score 반영)

---

## 🎯 Sniper Score 항목표

| # | 항목 | 최대 점수 | 평가 기준 |
|---|------|-----------|----------|
| 1 | 국내 수요 | 20점 | 네이버 검색량, 커머스 판매량 추정 |
| 2 | 해외 가격 경쟁력 | 20점 | 국내 동일/유사 제품 대비 가격 우위 |
| 3 | 마진율 | 15점 | 25% 미만=0 / 30%+=10 / 40%+=15 |
| 4 | 배송 안정성 | 10점 | 소싱처 배송 리뷰, 분실/파손율 |
| 5 | 통관 리스크 | 10점 | 금지품목 여부, 식품/화장품 인증 필요도 |
| 6 | 경쟁 강도 | 10점 | 국내 동일 상품 판매자 수 (적을수록 높은 점수) |
| 7 | 상세페이지 설득력 | 10점 | 차별화 포인트, 후기 전환 가능성 |
| 8 | 자동화 적합도 | 5점 | 재소싱 주기, 가격 변동성, 단종 위험 |
| **합계** | | **100점** | **70점 이상: 등록 권장** |

---

## 🗺️ 로드맵

### Phase 1 — MVP (현재)
- [x] 프로젝트 구조 설계
- [ ] Supabase DB 스키마 구성
- [ ] 상품 목록/상세 페이지
- [ ] 관리자 대시보드 (마진 계산기, Sniper Score)
- [ ] 주문 관리 기본 기능
- [ ] Vercel 배포

### Phase 2 — 수익화 강화
- [ ] 결제 모듈 연동 (토스페이먼츠)
- [ ] 회원가입/로그인 (Supabase Auth)
- [ ] 주문 이메일 자동 발송
- [ ] Make.com 환율/재고 자동화
- [ ] SEO 최적화 (메타태그, sitemap.xml)

### Phase 3 — SaaS 확장
- [ ] 멀티 테넌트 구조 (구매대행자 계정별 분리)
- [ ] 구독 플랜 (Stripe 연동)
- [ ] Sniper Score 자동 계산 API
- [ ] 소싱 플랫폼 가격 크롤링 연동

---

## 🤝 기여 가이드

1. 이슈를 먼저 생성하거나 기존 이슈를 확인하세요.
2. `feature/기능명` 또는 `fix/이슈번호` 브랜치를 생성하세요.
3. 변경 사항을 커밋하고 PR을 생성하세요.
4. PR 제목은 `[feat]`, `[fix]`, `[docs]`, `[refactor]` 접두사를 사용하세요.

---

## 📄 라이선스

이 프로젝트는 [MIT License](LICENSE) 하에 배포됩니다.

---

> Made with ❤️ by [@jaeha81](https://github.com/jaeha81)
> 구매대행 사업 문의: dltkddlf231@gmail.com
