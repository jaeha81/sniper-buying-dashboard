import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '스나이퍼 검증 상품 목록',
  description:
    '스나이퍼 스코어 8개 지표로 엄선된 해외직구 상품 목록. 스코어 60점 이상 검증 상품만 등재. 마진율, 통관 리스크 완전 분석.',
  alternates: {
    canonical: 'https://sniper-buying-dashboard.vercel.app/products',
  },
  openGraph: {
    title: '스나이퍼 검증 상품 목록 | 스나이퍼 구매대행',
    description:
      '스나이퍼 스코어 8개 지표로 엄선된 해외직구 상품. 마진율·통관 리스크 완전 분석.',
    url: 'https://sniper-buying-dashboard.vercel.app/products',
    type: 'website',
  },
}

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
