import Link from 'next/link'
import {
  Package,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Calculator,
  ExternalLink,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { sampleProducts } from '@/data/sample-products'
import { formatKRW, formatUSD, getCategoryLabel, getRiskLevelLabel, getStatusLabel } from '@/lib/utils'
import { getSniperGrade } from '@/lib/calculator'

export default function AdminPage() {
  const activeProducts = sampleProducts.filter((p) => p.status === 'active')
  const candidateProducts = sampleProducts.filter((p) => p.status === 'candidate')
  const pausedProducts = sampleProducts.filter((p) => p.status === 'paused')

  const avgMarginRate =
    activeProducts.length > 0
      ? activeProducts.reduce((sum, p) => sum + p.marginRate, 0) / activeProducts.length
      : 0

  const totalExpectedRevenue = activeProducts.reduce(
    (sum, p) => sum + p.domesticExpectedPrice,
    0
  )

  const totalExpectedMargin = activeProducts.reduce((sum, p) => sum + p.expectedMargin, 0)

  // Sniper Score 상위 상품
  const topProducts = [...sampleProducts]
    .sort((a, b) => b.sniperScore - a.sniperScore)
    .slice(0, 8)

  // 위험 상품
  const highRiskProducts = sampleProducts.filter((p) => p.riskLevel === 'HIGH')

  const summaryCards = [
    {
      title: '전체 상품',
      value: sampleProducts.length,
      subValue: `판매중 ${activeProducts.length}개`,
      icon: Package,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: '검토중 상품',
      value: candidateProducts.length,
      subValue: `일시중지 ${pausedProducts.length}개`,
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
    },
    {
      title: '평균 마진율',
      value: `${avgMarginRate.toFixed(1)}%`,
      subValue: '판매중 상품 기준',
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      title: '예상 총 마진',
      value: formatKRW(totalExpectedMargin),
      subValue: '판매중 상품 합계',
      icon: CheckCircle,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">관리자 대시보드</h1>
          <p className="text-gray-500 mt-1">상품 현황 및 수익 분석</p>
        </div>
        <Link href="/admin/margins">
          <Button>
            <Calculator className="w-4 h-4 mr-2" />
            마진 계산기
          </Button>
        </Link>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {summaryCards.map((card, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">{card.title}</p>
                <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.subValue}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 스나이퍼 스코어 상위 상품 */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">스나이퍼 스코어 상위 상품</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topProducts.map((product, i) => {
                  const { grade, color } = getSniperGrade(product.sniperScore)
                  return (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {/* 순위 */}
                      <div className="w-6 text-center text-sm font-bold text-gray-400">
                        {i + 1}
                      </div>

                      {/* 스나이퍼 스코어 */}
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${
                          product.sniperScore >= 80
                            ? 'bg-green-500'
                            : product.sniperScore >= 65
                            ? 'bg-blue-500'
                            : product.sniperScore >= 50
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                      >
                        {product.sniperScore}
                      </div>

                      {/* 상품 정보 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">
                            {getCategoryLabel(product.category)}
                          </span>
                          <span className="text-xs text-gray-300">•</span>
                          <span
                            className={`text-xs font-medium ${
                              product.marginRate >= 25
                                ? 'text-green-600'
                                : product.marginRate >= 15
                                ? 'text-blue-600'
                                : 'text-red-600'
                            }`}
                          >
                            마진 {product.marginRate.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* 상태 + 링크 */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            product.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : product.status === 'candidate'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {getStatusLabel(product.status)}
                        </span>
                        <Link href={`/products/${product.id}`}>
                          <ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-blue-600" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 오른쪽 패널 */}
        <div className="space-y-6">
          {/* 카테고리별 현황 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">카테고리별 현황</CardTitle>
            </CardHeader>
            <CardContent>
              {(['health', 'sports', 'beauty', 'outdoor', 'electronics'] as const).map((cat) => {
                const products = sampleProducts.filter((p) => p.category === cat)
                const activeCount = products.filter((p) => p.status === 'active').length
                const avgScore =
                  products.length > 0
                    ? Math.round(
                        products.reduce((sum, p) => sum + p.sniperScore, 0) / products.length
                      )
                    : 0

                return (
                  <div
                    key={cat}
                    className="flex items-center justify-between py-2 border-b border-dashed border-gray-100 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {getCategoryLabel(cat)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {products.length}개 ({activeCount}개 판매중)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-blue-600">avg {avgScore}</p>
                      <p className="text-xs text-gray-400">스코어</p>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* 고위험 상품 경고 */}
          {highRiskProducts.length > 0 && (
            <Card className="border-red-100">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                  통관 고위험 상품
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {highRiskProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-sm p-2 bg-red-50 rounded"
                    >
                      <p className="text-red-800 truncate flex-1 mr-2">{p.name}</p>
                      <Link href={`/products/${p.id}`}>
                        <ExternalLink className="w-3.5 h-3.5 text-red-400" />
                      </Link>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 빠른 링크 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">빠른 메뉴</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/admin/margins" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Calculator className="w-4 h-4 mr-2" />
                  마진 계산기
                </Button>
              </Link>
              <Link href="/products" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Package className="w-4 h-4 mr-2" />
                  전체 상품 목록
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
