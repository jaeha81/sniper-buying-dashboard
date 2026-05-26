'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ExternalLink,
  ShoppingCart,
  Package,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getProductById } from '@/data/sample-products'
import { useCart } from '@/lib/cart-context'
import { formatKRW, formatUSD, getCategoryLabel, getRiskLevelLabel, getStatusLabel } from '@/lib/utils'
import { getSniperGrade } from '@/lib/calculator'
import { useState } from 'react'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  const product = getProductById(id)

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <h1 className="text-xl font-bold text-gray-700 mb-2">상품을 찾을 수 없습니다</h1>
        <p className="text-gray-400 mb-6">삭제되었거나 잘못된 주소입니다.</p>
        <Link href="/products">
          <Button variant="outline">상품 목록으로</Button>
        </Link>
      </div>
    )
  }

  const gradeInfo = getSniperGrade(product.sniperScore)

  const handleAddToCart = () => {
    addItem(product)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const riskColors = {
    LOW: 'text-green-600 bg-green-50',
    MEDIUM: 'text-yellow-600 bg-yellow-50',
    HIGH: 'text-red-600 bg-red-50',
  }

  const scoreItems = [
    { label: '국내수요', value: product.demandScore, max: 5 },
    { label: '가격경쟁력', value: product.priceCompetitivenessScore, max: 5 },
    { label: '마진율', value: Math.min(5, Math.max(1, Math.floor(product.marginRate / 6))), max: 5 },
    { label: '배송안정성', value: product.shippingStabilityScore, max: 5 },
    {
      label: '통관리스크',
      value: product.riskLevel === 'LOW' ? 5 : product.riskLevel === 'MEDIUM' ? 3 : 1,
      max: 5,
    },
    {
      label: '경쟁강도',
      value: product.competitionLevel === 'low' ? 5 : product.competitionLevel === 'medium' ? 3 : 1,
      max: 5,
    },
    { label: '페이지설득력', value: product.pageConvincingScore, max: 5 },
    { label: '자동화적합도', value: product.automationScore, max: 5 },
  ]

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Link
        href="/products"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        상품 목록으로
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 이미지 + 스코어 */}
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl h-64 flex items-center justify-center">
            <Package className="w-24 h-24 text-gray-400" />
          </div>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">스나이퍼 스코어</span>
                <div
                  className={`px-2.5 py-1 rounded-full text-sm font-bold ${
                    product.sniperScore >= 80
                      ? 'bg-green-100 text-green-700'
                      : product.sniperScore >= 65
                      ? 'bg-blue-100 text-blue-700'
                      : product.sniperScore >= 50
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {gradeInfo.grade} 등급
                </div>
              </div>
              <div className="text-5xl font-bold text-center my-4 text-gray-900">
                {product.sniperScore}
                <span className="text-2xl text-gray-400">/100</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                <div
                  className={`h-2 rounded-full ${
                    product.sniperScore >= 80
                      ? 'bg-green-500'
                      : product.sniperScore >= 65
                      ? 'bg-blue-500'
                      : product.sniperScore >= 50
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${product.sniperScore}%` }}
                />
              </div>

              <div className="space-y-2">
                {scoreItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0">{item.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-blue-400"
                        style={{ width: `${(item.value / item.max) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 w-8 text-right">
                      {item.value}/{item.max}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 오른쪽: 상품 상세 */}
        <div className="lg:col-span-2 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {getCategoryLabel(product.category)}
              </span>
              <Badge
                variant={
                  product.status === 'active'
                    ? 'success'
                    : product.status === 'candidate'
                    ? 'secondary'
                    : 'warning'
                }
              >
                {getStatusLabel(product.status)}
              </Badge>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColors[product.riskLevel]}`}>
                통관 {getRiskLevelLabel(product.riskLevel)}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{product.name}</h1>
            <p className="text-gray-500 mt-2 text-sm leading-relaxed">{product.description}</p>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">가격 분석</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">해외 구매가</p>
                  <p className="text-lg font-bold text-gray-900">{formatUSD(product.overseasPrice)}</p>
                  <p className="text-xs text-gray-400">≈ {formatKRW(Math.round(product.overseasPrice * 1350))}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-400">국내 판매 예정가</p>
                  <p className="text-lg font-bold text-blue-700">{formatKRW(product.domesticExpectedPrice)}</p>
                </div>
              </div>

              <div className="border-t pt-3 space-y-1.5">
                {[
                  ['현지 배송비', formatUSD(product.localShippingCost)],
                  ['국제 배송비', formatKRW(product.internationalShippingCost)],
                  ['관세·부가세', formatKRW(product.taxEstimate)],
                  ['결제 수수료', formatKRW(product.paymentFee)],
                  ['국내 배송비', formatKRW(product.domesticShippingCost)],
                  ['기타 비용', formatKRW(product.otherCosts)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-xs text-gray-500">
                    <span>{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                  <span className="text-gray-700">총 원가</span>
                  <span className="text-gray-900">{formatKRW(product.totalCost)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-gray-700">예상 순마진</span>
                  <span className={product.expectedMargin > 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatKRW(product.expectedMargin)} ({product.marginRate.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {product.riskLevel !== 'LOW' && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {product.riskLevel === 'HIGH'
                  ? '이 상품은 통관 리스크가 높습니다. 관세·전파인증 등 추가 비용이 발생할 수 있습니다.'
                  : '통관 시 추가 서류 또는 검사가 필요할 수 있습니다.'}
              </span>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700 min-w-[160px]"
              onClick={handleAddToCart}
              disabled={product.status === 'paused' || product.status === 'discontinued'}
            >
              {added ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  담겼습니다!
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  {product.status === 'paused' ? '일시 중지된 상품' : '장바구니 담기'}
                </>
              )}
            </Button>
            <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                원본 보기
              </Button>
            </a>
            <Link href="/cart">
              <Button variant="outline">장바구니 보기</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
