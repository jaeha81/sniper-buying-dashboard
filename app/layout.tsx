import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { Crosshair, Package, LayoutDashboard, Mail, Lock, Headphones, Ship } from 'lucide-react'
import './globals.css'
import { CartProvider } from '@/lib/cart-context'
import { CartNavButton } from '@/components/cart-nav-button'
import { AuthNavButton } from '@/components/auth-nav-button'
import { MobileMenu } from '@/components/mobile-menu'

const SITE_URL = 'https://sniper-buying-dashboard.vercel.app'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0f',
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '스나이퍼 구매대행 | 검증된 해외직구 플랫폼',
    template: '%s | 스나이퍼 구매대행',
  },
  description:
    '스나이퍼 스코어 8개 지표로 검증된 해외직구 상품. 평균 마진율 28%, iHerb·Amazon 소싱. 관세 리스크 없이 안전하게.',
  keywords: ['해외구매대행', '직구', '스나이퍼스코어', '마진계산', 'iHerb', 'Amazon', '통관', '해외직구'],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: '스나이퍼 구매대행 | 검증된 해외직구 플랫폼',
    description: '스나이퍼 스코어 8개 지표로 검증된 해외직구. 평균 마진율 28%.',
    url: SITE_URL,
    siteName: '스나이퍼 구매대행',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '스나이퍼 구매대행 | 검증된 해외직구 플랫폼',
    description: '스나이퍼 스코어 8개 지표로 검증된 해외직구. 평균 마진율 28%.',
    site: '@sniper_buying',
  },
  robots: {
    index: true,
    follow: true,
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '스나이퍼 구매대행',
  url: SITE_URL,
  description:
    '스나이퍼 스코어 8개 지표로 검증된 해외직구 상품. 평균 마진율 28%, iHerb·Amazon 소싱.',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/products?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
  publisher: {
    '@type': 'Organization',
    name: '스나이퍼 구매대행',
    url: SITE_URL,
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'dltkddlf231@gmail.com',
      contactType: 'customer service',
      availableLanguage: 'Korean',
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-luxury-bg text-foreground">
        <CartProvider>
          {/* Navigation */}
          <header className="glass-nav sticky top-0 z-50">
            <div className="container mx-auto px-6 h-16 flex items-center justify-between">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-lg bg-gold-gradient flex items-center justify-center shadow-gold-glow">
                  <Crosshair className="w-4 h-4 text-luxury-bg" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-serif text-xl font-semibold text-foreground group-hover:text-gold-light transition-colors">
                    스나이퍼
                  </span>
                  <span className="text-xs text-muted-foreground tracking-widest uppercase">
                    구매대행
                  </span>
                </div>
              </Link>

              {/* Nav links */}
              <nav className="hidden md:flex items-center gap-1">
                {[
                  { href: '/products', label: '상품', icon: Package },
                  { href: '/admin', label: '관리자', icon: LayoutDashboard },
                ].map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-all duration-200"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </Link>
                ))}
              </nav>

              {/* Right actions */}
              <div className="flex items-center gap-3">
                <Link
                  href="/admin/margins"
                  className="hidden md:flex items-center gap-2 px-4 py-2 text-sm border border-gold/30 text-gold hover:bg-gold/10 rounded-lg transition-all duration-200"
                >
                  마진계산기
                </Link>
                <CartNavButton />
                <AuthNavButton />
                <MobileMenu />
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1">{children}</main>

          {/* Footer */}
          <footer className="border-t border-white/5 bg-luxury-surface">
            <div className="container mx-auto px-6 py-16">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
                {/* Brand + contact */}
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-7 h-7 rounded-lg bg-gold-gradient flex items-center justify-center">
                      <Crosshair className="w-3.5 h-3.5 text-luxury-bg" />
                    </div>
                    <span className="font-serif text-lg text-foreground">스나이퍼 구매대행</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mb-6">
                    데이터 기반 스나이퍼 스코어로 검증된 해외 직구 상품만을 엄선합니다.
                    최적의 마진율, 안전한 통관, 빠른 배송을 보장합니다.
                  </p>
                  {/* Contact */}
                  <div className="space-y-2">
                    <a
                      href="mailto:dltkddlf231@gmail.com"
                      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      dltkddlf231@gmail.com
                    </a>
                  </div>
                  {/* Trust signals */}
                  <div className="grid grid-cols-2 gap-2 mt-6">
                    {[
                      { icon: Lock, label: 'Toss 결제' },
                      { icon: Lock, label: '개인정보보호' },
                      { icon: Headphones, label: '1:1 CS 응대' },
                      { icon: Ship, label: '통관 보증' },
                    ].map(({ icon: Icon, label }) => (
                      <div
                        key={label}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/6 bg-luxury-elevated"
                      >
                        <Icon className="w-3.5 h-3.5 text-gold shrink-0" />
                        <span className="text-xs text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-muted-foreground tracking-widest uppercase mb-4">
                    서비스
                  </h4>
                  <ul className="space-y-2.5">
                    {[
                      { href: '/products', label: '전체 상품' },
                      { href: '/admin/margins', label: '마진 계산기' },
                      { href: '/shipping-guide', label: '배송 안내' },
                      { href: '/faq', label: '자주 묻는 질문' },
                    ].map(({ href, label }) => (
                      <li key={href}>
                        <Link href={href} className="text-sm text-muted-foreground hover:text-gold transition-colors">
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-muted-foreground tracking-widest uppercase mb-4">
                    정책
                  </h4>
                  <ul className="space-y-2.5">
                    {[
                      { href: '/policy/privacy', label: '개인정보처리방침' },
                      { href: '/policy/terms', label: '이용약관' },
                      { href: '/policy/refund', label: '환불정책' },
                    ].map(({ href, label }) => (
                      <li key={href}>
                        <Link href={href} className="text-sm text-muted-foreground hover:text-gold transition-colors">
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="border-t border-white/5 mt-12 pt-6 flex flex-col md:flex-row justify-between items-center gap-3">
                <div className="text-center md:text-left space-y-1">
                  <p className="text-xs text-muted-foreground">
                    © 2026 스나이퍼 구매대행. All rights reserved.
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    사업자 등록 예정 · 통신판매업 신고 예정
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  환율 기준: 1 USD = 1,350 KRW · v1.0
                </p>
              </div>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  )
}
