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
  MessageSquare,
  Truck,
  FileText,
  Shield,
  BarChart2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getProductById } from '@/data/sample-products'
import { useCart } from '@/lib/cart-context'
import { formatKRW, getCategoryLabel, getRiskLevelLabel, getStatusLabel } from '@/lib/utils'
import { getSniperGrade } from '@/lib/calculator'
import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

function marginScore(marginRate: number): number {
  if (marginRate >= 30) return 20
  if (marginRate >= 25) return 16
  if (marginRate >= 20) return 12
  if (marginRate >= 15) return 8
  if (marginRate >= 10) return 4
  return 0
}

function riskScore(riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'): number {
  if (riskLevel === 'LOW') return 10
  if (riskLevel === 'MEDIUM') return 6
  return 2
}

function competitionScore(competitionLevel: 'low' | 'medium' | 'high'): number {
  if (competitionLevel === 'low') return 5
  if (competitionLevel === 'medium') return 3
  return 1
}

function getBarColor(value: number, max: number): string {
  const pct = value / max
  if (pct >= 0.8) return '#C9A84C'
  if (pct >= 0.6) return '#D4A853'
  if (pct >= 0.4) return '#8B7355'
  return '#5C4A32'
}

interface ScoreIndicator {
  label: string
  key: string
  max: number
  value: number
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]?.payload as ScoreIndicator
    return (
      <div className="bg-[#1a1a2e] border border-white/20 rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-white/70 mb-0.5">{data.label}</p>
        <p className="text-[#C9A84C] font-bold">
          {data.value}점 / {data.max}점 만점
        </p>
      </div>
    )
  }
  return null
}

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

  const isActive = product.status === 'active'
  const isCandidate = product.status === 'candidate'
  const isUnavailable = product.status === 'paused' || product.status === 'discontinued'

  const riskColors = {
    LOW: 'text-green-600 bg-green-50',
    MEDIUM: 'text-yellow-600 bg-yellow-50',
    HIGH: 'text-red-600 bg-red-50',
  }

  const estimatedTotal = product.domesticExpectedPrice
  const estimatedShipping = product.internationalShippingCost + product.domesticShippingCost

  const scoreIndicators: ScoreIndicator[] = [
    {
      label: '국내수요',
      key: 'demand',
      max: 20,
      value: Math.min(5, Math.max(1, product.demandScore)) * 4,
    },
    {
      label: '가격경쟁력',
      key: 'priceCompetitiveness',
      max: 20,
      value: Math.min(5, Math.max(1, product.priceCompetitivenessScore)) * 4,
    },
    {
      label: '마진율',
      key: 'margin',
      max: 20,
      value: marginScore(product.marginRate),
    },
    {
      label: '배송안정성',
      key: 'shippingStability',
      max: 15,
      value: Math.min(5, Math.max(1, product.shippingStabilityScore)) * 3,
    },
    {
      label: '통관리스크',
      key: 'customsRisk',
      max: 10,
      value: riskScore(product.riskLevel),
    },
    {
      label: '경쟁강도',
      key: 'competition',
      max: 5,
      value: competitionScore(product.competitionLevel),
    },
    {
      label: '페이지설득력',
      key: 'pageConvincing',
      max: 5,
      value: Math.min(5, Math.max(1, product.pageConvincingScore)),
    },
    {
      label: '자동화적합도',
      key: 'automation',
      max: 5,
      value: Math.min(5, Math.max(1, product.automationScore)),
    },
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
                <span className="text-sm font-semibold text-gray-700">검증 등급</span>
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
              <p className="text-xs text-gray-400 text-center">
                수익성·배송·통관·경쟁도 종합 검증 점수
              </p>
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

          {/* 고객용 예상 비용 안내 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                예상 비용 안내
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-400 mb-1">예상 구매가 (관부가세 포함)</p>
                  <p className="text-2xl font-bold text-blue-700">{formatKRW(estimatedTotal)}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" />
                    예상 배송비 (국제+국내)
                  </span>
                  <span className="font-medium text-gray-700">{formatKRW(estimatedShipping)}</span>
                </div>
                {product.taxEstimate > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      예상 관부가세
                    </span>
                    <span className="font-medium text-amber-600">{formatKRW(product.taxEstimate)}</span>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 leading-relaxed">
                본 상품은 해외 구매대행 상품입니다. 상품 가격·수량·발송국 등에 따라
                관부가세가 달라질 수 있으며, 개인통관고유부호가 필요합니다.
              </div>
            </CardContent>
          </Card>

          {/* 통관 위험 경고 */}
          {product.riskLevel !== 'LOW' && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {product.riskLevel === 'HIGH'
                  ? '이 상품은 통관 리스크가 높습니다. 관세·전파인증 등 추가 확인이 필요합니다. 주문 전 담당자 검토 후 안내 드립니다.'
                  : '통관 시 추가 서류 또는 검사가 필요할 수 있습니다.'}
              </span>
            </div>
          )}

          {/* 검토중 안내 */}
          {isCandidate && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              이 상품은 현재 통관, 재고, 가격 조건을 검토 중입니다. 바로 주문은 불가하며,
              견적 문의를 남겨주시면 구매 가능 여부를 확인해 드립니다.
            </div>
          )}
        </div>
      </div>

      {/* 스나이퍼 스코어 세부 분석 */}
      <div className="mt-8">
        <Card className="bg-[#0f0f1a] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-white">
              <BarChart2 className="w-4 h-4 text-[#C9A84C]" />
              스나이퍼 스코어 세부 분석
            </CardTitle>
            <p className="text-xs text-white/40 mt-0.5">8개 지표별 점수 분포</p>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={scoreIndicators}
                  layout="vertical"
                  margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                  barCategoryGap="28%"
                >
                  <XAxis
                    type="number"
                    domain={[0, 20]}
                    tick={{ fill: '#ffffff40', fontSize: 11 }}
                    axisLine={{ stroke: '#ffffff15' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={72}
                    tick={{ fill: '#ffffff80', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff08' }} />
                  <Bar dataKey="max" fill="#ffffff08" radius={[0, 3, 3, 0]} isAnimationActive={false} />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {scoreIndicators.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.value, entry.max)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 세부 점수 카드 그리드 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
              {scoreIndicators.map((indicator) => {
                const pct = indicator.value / indicator.max
                return (
                  <div
                    key={indicator.key}
                    className="bg-white/5 border border-white/8 rounded-lg p-3"
                  >
                    <p className="text-[11px] text-white/50 mb-1 leading-tight">{indicator.label}</p>
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-lg font-bold text-white">{indicator.value}</span>
                      <span className="text-xs text-white/30">/{indicator.max}</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1">
                      <div
                        className="h-1 rounded-full transition-all"
                        style={{
                          width: `${pct * 100}%`,
                          backgroundColor: getBarColor(indicator.value, indicator.max),
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 상품 액션 */}
      <div className="mt-6 flex gap-3 flex-wrap">
        {isActive && (
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 min-w-[160px]"
            onClick={handleAddToCart}
          >
            {added ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                담겼습니다!
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                장바구니 담기
              </>
            )}
          </Button>
        )}

        {isCandidate && (
          <Button className="flex-1 min-w-[160px] bg-amber-600 hover:bg-amber-700">
            <MessageSquare className="w-4 h-4 mr-2" />
            견적 문의하기
          </Button>
        )}

        {isUnavailable && (
          <Button className="flex-1 min-w-[160px]" disabled>
            {product.status === 'paused' ? '일시 중지된 상품' : '판매 종료'}
          </Button>
        )}

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
  )
}
