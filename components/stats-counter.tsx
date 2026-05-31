import { sampleProducts } from '@/data/sample-products'

// 빌드/프리렌더 시 외부 fetch 의존 없이 sampleProducts 기반으로 계산합니다.
// 운영 실시간 통계가 필요한 경우 별도 Client Component + useEffect로 분리하세요.
function computeStats() {
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

export function StatsCounter() {
  const stats = computeStats()

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
