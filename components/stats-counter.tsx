'use client'

import { useState, useEffect } from 'react'
import { sampleProducts } from '@/data/sample-products'

interface StatItem {
  value: string
  label: string
}

function buildItems(totalProducts: number, avgMarginRate: number): StatItem[] {
  return [
    { value: `${totalProducts}+`, label: '검증 상품' },
    { value: `${avgMarginRate}%`, label: '평균 마진율' },
    { value: '8개', label: '스코어 지표' },
    { value: '60+', label: '통과 기준점' },
  ]
}

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

// Static fallback (sampleProducts 기반 — 빌드/SSR 안전)
function staticItems(): StatItem[] {
  const count = sampleProducts.length
  const avgMargin =
    count > 0
      ? Math.round(sampleProducts.reduce((sum, p) => sum + p.marginRate, 0) / count)
      : 28
  return buildItems(count, avgMargin)
}

// Phase 3: 실시간 통계 Client Component — 마운트 후 /api/products로 갱신
export function StatsCounter() {
  const [items, setItems] = useState<StatItem[]>(staticItems)

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
