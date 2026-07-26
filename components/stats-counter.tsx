'use client'

import { useState, useEffect } from 'react'

interface StatItem {
  value: string
  label: string
}

function buildItems(totalProducts: number, avgMarginRate: number): StatItem[] {
  return [
    { value: `${totalProducts}`, label: '검증 상품' },
    { value: `${avgMarginRate}%`, label: '평균 마진율' },
    // 아래 둘은 상품 데이터가 아니라 스코어 규칙 자체에서 온 상수다.
    { value: '8개', label: '스코어 지표' },
    { value: '60+', label: '통과 기준점' },
  ]
}

// 지시서 §2·§19: 실데이터가 없으면 0 또는 '데이터 없음'으로 표시한다.
// 이전에는 하드코딩된 샘플 상품 30개로 상품 수와 평균 마진율을 계산해
// 실적처럼 보여줬다.
const EMPTY_ITEMS: StatItem[] = [
  { value: '—', label: '검증 상품' },
  { value: '—', label: '평균 마진율' },
  { value: '8개', label: '스코어 지표' },
  { value: '60+', label: '통과 기준점' },
]

function StatItems({ items }: { items: StatItem[] }) {
  return (
    <>
      {items.map(({ value, label }) => (
        <div key={label}>
          <div className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
            {value}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      ))}
    </>
  )
}

// 실 DB 집계만 표시한다. 조회 전·실패·0건은 전부 '—'로 둔다.
export function StatsCounter() {
  const [items, setItems] = useState<StatItem[]>(EMPTY_ITEMS)

  useEffect(() => {
    fetch('/api/products')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        const products: Array<{ marginRate: number }> = data.products ?? []
        const count = products.length
        if (count === 0) return
        const avgMargin = Math.round(
          products.reduce((sum, p) => sum + (p.marginRate ?? 0), 0) / count
        )
        setItems(buildItems(count, avgMargin))
      })
      .catch(() => {})
  }, [])

  return <StatItems items={items} />
}
