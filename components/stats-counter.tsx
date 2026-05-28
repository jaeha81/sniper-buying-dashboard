import { sampleProducts } from '@/data/sample-products'

interface StatsData {
  totalProducts: number
  avgMarginRate: number
  scoreIndicators: number
  minPassScore: number
}

async function fetchStats(): Promise<StatsData> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sniper-buying-dashboard.vercel.app'
    const res = await fetch(`${baseUrl}/api/products`, {
      next: { revalidate: 300 }, // cache for 5 minutes
    })
    if (!res.ok) throw new Error('fetch failed')
    const data = await res.json()
    const products: Array<{ marginRate: number }> = Array.isArray(data)
      ? data
      : (data.products ?? [])

    const count = products.length
    const avgMargin =
      count > 0
        ? products.reduce((sum: number, p: { marginRate: number }) => sum + p.marginRate, 0) / count
        : 28

    return {
      totalProducts: count,
      avgMarginRate: Math.round(avgMargin),
      scoreIndicators: 8,
      minPassScore: 60,
    }
  } catch {
    // Fallback to sample data counts
    const count = sampleProducts.length
    const avgMargin =
      count > 0
        ? sampleProducts.reduce((sum, p) => sum + p.marginRate, 0) / count
        : 28
    return {
      totalProducts: count,
      avgMarginRate: Math.round(avgMargin),
      scoreIndicators: 8,
      minPassScore: 60,
    }
  }
}

export async function StatsCounter() {
  const stats = await fetchStats()

  const items = [
    { value: `${stats.totalProducts}+`, label: '검증 상품' },
    { value: `${stats.avgMarginRate}%`, label: '평균 마진율' },
    { value: `${stats.scoreIndicators}개`, label: '스코어 지표' },
    { value: `${stats.minPassScore}+`, label: '통과 기준점' },
  ]

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
