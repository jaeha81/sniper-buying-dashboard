'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { motion } from 'framer-motion'
import {
  Crosshair,
  TrendingUp,
  Shield,
  Zap,
  BarChart2,
  ArrowRight,
  Package,
  Target,
  CheckCircle2,
  Lock,
  Headphones,
  Ship,
  CreditCard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProductCard } from '@/components/product-card'
import { getTopProductsByScore } from '@/data/sample-products'
import { StatsCounter } from '@/components/stats-counter'

const HeroSpline = dynamic(() => import('@/components/hero-spline'), { ssr: false })

const FEATURES = [
  {
    icon: Target,
    title: '스나이퍼 스코어',
    desc: '8개 지표를 종합한 100점 만점 검증으로 수익성 높은 상품만 엄선합니다.',
  },
  {
    icon: TrendingUp,
    title: '실시간 마진 계산',
    desc: '환율·관세·배송비를 반영한 정확한 마진율을 즉시 확인합니다.',
  },
  {
    icon: Shield,
    title: '통관 리스크 분석',
    desc: '카테고리별 통관 위험도와 관세율을 사전에 파악해 안전하게 주문합니다.',
  },
  {
    icon: Zap,
    title: 'Make.com 자동화',
    desc: '주문 처리부터 재고 관리까지 완전 자동화된 운영 시스템을 제공합니다.',
  },
]

const SCORE_ITEMS = [
  { label: '국내수요', pts: 20, icon: BarChart2, color: '#3B82F6' },
  { label: '가격경쟁력', pts: 20, icon: TrendingUp, color: '#8B5CF6' },
  { label: '마진율', pts: 20, icon: TrendingUp, color: '#10B981' },
  { label: '배송안정성', pts: 15, icon: Shield, color: '#14B8A6' },
  { label: '통관리스크', pts: 10, icon: Shield, color: '#F59E0B' },
  { label: '경쟁강도', pts: 5, icon: BarChart2, color: '#EC4899' },
  { label: '페이지설득력', pts: 5, icon: Zap, color: '#A855F7' },
  { label: '자동화적합도', pts: 5, icon: Zap, color: '#EAB308' },
]

const GRADES = [
  { grade: 'S', range: '85+', color: '#A855F7', label: '최우선' },
  { grade: 'A', range: '75+', color: '#22C55E', label: '추천' },
  { grade: 'B', range: '65+', color: '#3B82F6', label: '검토' },
  { grade: 'C', range: '50+', color: '#F59E0B', label: '주의' },
  { grade: 'D', range: '~49', color: '#EF4444', label: '비추천' },
]

const VP = { once: true, margin: '-60px' } as const
function fadeIn(delay = 0) {
  return {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: VP,
    transition: { duration: 0.55, delay },
  }
}
function heroFade(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay },
  }
}

export default function HomePage() {
  const topProducts = getTopProductsByScore(6)

  return (
    <div className="bg-luxury-bg">
      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <HeroSpline />
        </div>
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '200px 200px',
          }}
        />

        <div className="container mx-auto px-6 relative z-10 py-24">
          <div className="max-w-2xl">
            <motion.div {...heroFade(0)} className="mb-8">
              <span className="inline-flex items-center gap-2 border border-gold/30 text-gold text-xs font-medium tracking-widest uppercase px-4 py-2 rounded-full bg-gold/5">
                <Crosshair className="w-3 h-3" />
                데이터 기반 해외 구매대행
              </span>
            </motion.div>

            <motion.h1
              {...heroFade(0.15)}
              className="font-serif text-5xl md:text-7xl font-medium leading-[1.08] mb-6"
            >
              스나이퍼처럼
              <br />
              <span className="text-gold-gradient">정확하게</span>
              <br />
              검증된 상품만
            </motion.h1>

            <motion.p
              {...heroFade(0.3)}
              className="text-muted-foreground text-lg leading-relaxed mb-10 max-w-lg"
            >
              8가지 지표를 종합한 스나이퍼 스코어로 마진율과 수요를 동시에 검증한 상품만 취급합니다.
              관세 리스크 없이 안전하게 직구하세요.
            </motion.p>

            <motion.div {...heroFade(0.45)} className="flex flex-col sm:flex-row gap-3">
              <Link href="/products">
                <Button
                  size="lg"
                  className="bg-gold hover:bg-gold-light text-luxury-bg font-semibold px-8 h-12 text-sm tracking-wide"
                >
                  <Package className="w-4 h-4 mr-2" />
                  전체 상품 보기
                </Button>
              </Link>
              <Link href="/admin/margins">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/15 hover:border-gold/40 hover:text-gold h-12 px-8 text-sm"
                >
                  마진 계산기
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </motion.div>

            <motion.div
              {...heroFade(0.6)}
              className="grid grid-cols-4 gap-6 mt-16 pt-10 border-t border-white/8"
            >
              <Suspense
                fallback={
                  <>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    ))}
                  </>
                }
              >
                <StatsCounter />
              </Suspense>
            </motion.div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-luxury-bg to-transparent pointer-events-none" />
      </section>

      {/* ── FEATURES ── */}
      <section className="py-24 border-t border-white/5">
        <div className="container mx-auto px-6">
          <motion.div {...fadeIn()} className="text-center mb-16">
            <p className="text-xs text-gold tracking-widest uppercase font-medium mb-4">
              왜 스나이퍼인가
            </p>
            <h2 className="font-serif text-4xl md:text-5xl font-medium">
              검증된 시스템으로
              <br />
              수익을 만들어드립니다
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                {...fadeIn(i * 0.1)}
                className="card-luxury rounded-2xl p-6 space-y-4"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}
                >
                  <f.icon className="w-5 h-5 text-gold" />
                </div>
                <h3 className="font-serif text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST SIGNALS ── */}
      <section className="py-16 border-t border-white/5 bg-luxury-surface/40">
        <div className="container mx-auto px-6">
          <motion.div {...fadeIn()} className="text-center mb-10">
            <p className="text-xs text-gold tracking-widest uppercase font-medium mb-3">
              안전 결제
            </p>
            <h2 className="font-serif text-2xl md:text-3xl font-medium">
              고객 보호를 최우선으로
            </h2>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              {
                icon: CreditCard,
                title: 'Toss 결제',
                desc: '안전한 토스페이먼츠 연동',
              },
              {
                icon: Lock,
                title: '개인정보보호',
                desc: 'SSL 암호화 전송 보장',
              },
              {
                icon: Headphones,
                title: '1:1 CS 응대',
                desc: '구매 전후 전담 상담',
              },
              {
                icon: Ship,
                title: '통관 보증',
                desc: '통관 실패 시 전액 환불',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                {...fadeIn(i * 0.08)}
                className="flex flex-col items-center text-center p-5 rounded-2xl border border-white/6 bg-luxury-elevated hover:border-gold/20 transition-colors"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}
                >
                  <item.icon className="w-5 h-5 text-gold" />
                </div>
                <p className="text-sm font-semibold text-foreground mb-1">{item.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SHIPPING PROCESS ── */}
      <section className="py-24 border-t border-white/5">
        <div className="container mx-auto px-6">
          <motion.div {...fadeIn()} className="text-center mb-14">
            <p className="text-xs text-gold tracking-widest uppercase font-medium mb-4">
              배송 프로세스
            </p>
            <h2 className="font-serif text-4xl md:text-5xl font-medium">
              소싱부터 배송까지
              <br />
              5단계로 완성
            </h2>
          </motion.div>

          <div className="max-w-5xl mx-auto">
            {/* Desktop: horizontal flow */}
            <div className="hidden md:flex items-center justify-between gap-0">
              {[
                {
                  step: '01',
                  label: '소싱',
                  desc: '스나이퍼 스코어로\n상품 검증',
                  color: '#A855F7',
                },
                {
                  step: '02',
                  label: '결제',
                  desc: 'Toss 결제·\n해외 카드 대행',
                  color: '#3B82F6',
                },
                {
                  step: '03',
                  label: '해외입고',
                  desc: '미국·일본 창고\n수령 완료',
                  color: '#10B981',
                },
                {
                  step: '04',
                  label: '통관',
                  desc: '관세사 연동\n안전 통관',
                  color: '#F59E0B',
                },
                {
                  step: '05',
                  label: '배송',
                  desc: '국내 택배\n3~7일 수령',
                  color: '#C9A84C',
                },
              ].map((item, i) => (
                <div key={i} className="flex items-center flex-1">
                  <motion.div
                    {...fadeIn(i * 0.12)}
                    className="flex flex-col items-center text-center flex-1"
                  >
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 text-lg font-bold"
                      style={{
                        background: `${item.color}18`,
                        border: `1px solid ${item.color}40`,
                        color: item.color,
                      }}
                    >
                      {item.step}
                    </div>
                    <p className="text-sm font-semibold text-foreground mb-1">{item.label}</p>
                    <p
                      className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line"
                    >
                      {item.desc}
                    </p>
                  </motion.div>
                  {i < 4 && (
                    <div className="flex items-center px-1 shrink-0">
                      <ArrowRight className="w-4 h-4 text-white/20" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Mobile: vertical list */}
            <div className="flex md:hidden flex-col gap-0">
              {[
                {
                  step: '01',
                  label: '소싱',
                  desc: '스나이퍼 스코어로 상품 검증',
                  color: '#A855F7',
                },
                {
                  step: '02',
                  label: '결제',
                  desc: 'Toss 결제 · 해외 카드 대행',
                  color: '#3B82F6',
                },
                {
                  step: '03',
                  label: '해외입고',
                  desc: '미국·일본 창고 수령 완료',
                  color: '#10B981',
                },
                {
                  step: '04',
                  label: '통관',
                  desc: '관세사 연동 안전 통관',
                  color: '#F59E0B',
                },
                {
                  step: '05',
                  label: '배송',
                  desc: '국내 택배 3~7일 수령',
                  color: '#C9A84C',
                },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center">
                  <motion.div
                    {...fadeIn(i * 0.1)}
                    className="flex items-center gap-4 w-full max-w-sm p-4 rounded-2xl border border-white/6 bg-luxury-surface"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center font-bold shrink-0"
                      style={{
                        background: `${item.color}18`,
                        border: `1px solid ${item.color}40`,
                        color: item.color,
                      }}
                    >
                      {item.step}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </motion.div>
                  {i < 4 && (
                    <div className="w-px h-4 bg-white/10 my-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TOP PRODUCTS ── */}
      <section className="py-24 border-t border-white/5">
        <div className="container mx-auto px-6">
          <motion.div {...fadeIn()} className="flex items-end justify-between mb-12">
            <div>
              <p className="text-xs text-gold tracking-widest uppercase font-medium mb-3">
                스나이퍼 픽
              </p>
              <h2 className="font-serif text-4xl font-medium">이달의 추천 상품</h2>
              <p className="text-muted-foreground text-sm mt-2">
                스코어 상위 6개 · 평균 마진율 28%+
              </p>
            </div>
            <Link href="/products">
              <Button
                variant="outline"
                className="border-white/10 hover:border-gold/30 hover:text-gold text-muted-foreground text-sm"
              >
                전체보기
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {topProducts.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── SNIPER SCORE ── */}
      <section className="py-24 border-t border-white/5">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <motion.div {...fadeIn()} className="text-center mb-14">
              <span className="inline-flex items-center gap-2 border border-gold/25 text-gold text-xs font-medium tracking-widest uppercase px-4 py-2 rounded-full bg-gold/5 mb-6">
                <Crosshair className="w-3 h-3" />
                스나이퍼 스코어 시스템
              </span>
              <h2 className="font-serif text-4xl md:text-5xl font-medium mb-4">
                100점 만점의
                <br />
                엄격한 검증 기준
              </h2>
              <p className="text-muted-foreground text-base max-w-lg mx-auto">
                모든 상품은 8가지 지표로 점수화되어, 60점 이상 상품만 판매 목록에 등재됩니다.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
              {SCORE_ITEMS.map((item, i) => (
                <motion.div
                  key={i}
                  {...fadeIn(i * 0.06)}
                  className="flex items-center gap-4 p-4 rounded-xl border border-white/6 bg-luxury-surface hover:border-white/10 transition-colors"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm"
                    style={{ background: `${item.color}15`, border: `1px solid ${item.color}30`, color: item.color }}
                  >
                    {item.pts}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                  </div>
                  <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: item.color }} />
                </motion.div>
              ))}
            </div>

            <motion.div
              {...fadeIn(0.2)}
              className="border border-gold/20 rounded-2xl p-6 bg-luxury-surface"
            >
              <h3 className="text-sm font-medium text-gold mb-5 tracking-widest uppercase">
                등급 기준
              </h3>
              <div className="grid grid-cols-5 gap-3">
                {GRADES.map((g) => (
                  <div key={g.grade} className="text-center p-3 rounded-xl bg-luxury-elevated">
                    <div className="font-serif text-2xl font-bold mb-1" style={{ color: g.color }}>
                      {g.grade}
                    </div>
                    <div className="text-xs text-muted-foreground">{g.range}점</div>
                    <div className="text-xs font-medium text-foreground mt-0.5">{g.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="py-24 border-t border-white/5">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.7 }}
            className="relative rounded-3xl overflow-hidden border border-gold/20 bg-luxury-surface text-center py-20 px-8"
          >
            <div
              className="hero-orb hero-orb-gold absolute"
              style={{ top: '-100px', left: '50%', transform: 'translateX(-50%)', opacity: 0.4 }}
            />
            <p className="text-xs text-gold tracking-widest uppercase font-medium mb-5 relative z-10">
              지금 시작하기
            </p>
            <h2 className="font-serif text-4xl md:text-5xl font-medium mb-6 relative z-10">
              해외 직구, 이제
              <br />
              <span className="text-gold-gradient">스나이퍼처럼</span> 하세요
            </h2>
            <p className="text-muted-foreground mb-10 max-w-md mx-auto relative z-10">
              검증된 상품, 정확한 마진 계산, 안전한 통관 — 1인 기업도 프로처럼 운영할 수 있습니다.
            </p>
            <Link href="/products" className="relative z-10 inline-block">
              <Button
                size="lg"
                className="bg-gold hover:bg-gold-light text-luxury-bg font-semibold px-10 text-sm tracking-wide"
              >
                상품 탐색 시작
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
