'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Package,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Calculator,
  ExternalLink,
  Plus,
  Pencil,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { sampleProducts } from '@/data/sample-products'
import { formatKRW, getCategoryLabel, getStatusLabel } from '@/lib/utils'
import { getSniperGrade } from '@/lib/calculator'
import { ProductFormModal } from '@/components/product-form-modal'
import type { Product } from '@/lib/types'

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>(sampleProducts)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products')
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      // API returns { products: [...] } or array directly
      const list: Product[] = Array.isArray(data) ? data : (data.products ?? [])
      if (list.length > 0) setProducts(list)
    } catch {
      // Fall back to sample data
      setProducts(sampleProducts)
    }
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  function openAdd() {
    setEditingProduct(null)
    setModalOpen(true)
  }

  function openEdit(product: Product) {
    setEditingProduct(product)
    setModalOpen(true)
  }

  const activeProducts = products.filter((p) => p.status === 'active')
  const candidateProducts = products.filter((p) => p.status === 'candidate')
  const pausedProducts = products.filter((p) => p.status === 'paused')

  const avgMarginRate =
    activeProducts.length > 0
      ? activeProducts.reduce((sum, p) => sum + p.marginRate, 0) / activeProducts.length
      : 0

  const totalExpectedMargin = activeProducts.reduce((sum, p) => sum + p.expectedMargin, 0)

  const topProducts = [...products].sort((a, b) => b.sniperScore - a.sniperScore).slice(0, 8)
  const highRiskProducts = products.filter((p) => p.riskLevel === 'HIGH')

  const summaryCards = [
    {
      title: '전체 상품',
      value: products.length,
      subValue: `판매중 ${activeProducts.length}개`,
      icon: Package,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      title: '검토중 상품',
      value: candidateProducts.length,
      subValue: `일시중지 ${pausedProducts.length}개`,
      icon: AlertTriangle,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
    },
    {
      title: '평균 마진율',
      value: `${avgMarginRate.toFixed(1)}%`,
      subValue: '판매중 상품 기준',
      icon: TrendingUp,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
    },
    {
      title: '예상 총 마진',
      value: formatKRW(totalExpectedMargin),
      subValue: '판매중 상품 합계',
      icon: CheckCircle,
      color: 'text-gold',
      bg: 'bg-gold/10',
    },
  ]

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">관리자 대시보드</h1>
            <p className="text-muted-foreground mt-1">상품 현황 및 수익 분석</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-luxury-bg text-sm font-semibold rounded-lg hover:opacity-90 transition-all shadow-gold-glow"
            >
              <Plus className="w-4 h-4" />
              상품 추가
            </button>
            <Link href="/admin/margins">
              <Button variant="outline" className="border-white/10 text-muted-foreground hover:text-foreground">
                <Calculator className="w-4 h-4 mr-2" />
                마진 계산기
              </Button>
            </Link>
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {summaryCards.map((card, i) => (
            <div key={i} className="card-luxury p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.subValue}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 스나이퍼 스코어 상위 상품 */}
          <div className="lg:col-span-2">
            <div className="card-luxury">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
                <h2 className="text-sm font-semibold text-foreground">스나이퍼 스코어 상위 상품</h2>
              </div>
              <div className="p-4 space-y-1">
                {topProducts.map((product, i) => {
                  const { grade } = getSniperGrade(product.sniperScore)
                  return (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/3 transition-colors group"
                    >
                      {/* 순위 */}
                      <div className="w-6 text-center text-sm font-bold text-muted-foreground">
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
                        <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {getCategoryLabel(product.category)}
                          </span>
                          <span className="text-xs text-white/20">•</span>
                          <span
                            className={`text-xs font-medium ${
                              product.marginRate >= 25
                                ? 'text-green-400'
                                : product.marginRate >= 15
                                ? 'text-blue-400'
                                : 'text-red-400'
                            }`}
                          >
                            마진 {product.marginRate.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* 상태 + 편집 + 링크 */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            product.status === 'active'
                              ? 'bg-green-500/10 text-green-400'
                              : product.status === 'candidate'
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-white/5 text-muted-foreground'
                          }`}
                        >
                          {getStatusLabel(product.status)}
                        </span>
                        <button
                          onClick={() => openEdit(product)}
                          className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-gold hover:bg-gold/10 transition-all"
                          title="편집"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <Link href={`/products/${product.id}`}>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-gold transition-colors" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 오른쪽 패널 */}
          <div className="space-y-6">
            {/* 카테고리별 현황 */}
            <div className="card-luxury p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">카테고리별 현황</h2>
              {(['health', 'sports', 'beauty', 'outdoor', 'electronics'] as const).map((cat) => {
                const catProducts = products.filter((p) => p.category === cat)
                const activeCount = catProducts.filter((p) => p.status === 'active').length
                const avgScore =
                  catProducts.length > 0
                    ? Math.round(catProducts.reduce((sum, p) => sum + p.sniperScore, 0) / catProducts.length)
                    : 0
                const scoreBarWidth = `${avgScore}%`
                const scoreColor =
                  avgScore >= 80 ? '#22C55E' : avgScore >= 65 ? '#C9A84C' : avgScore >= 50 ? '#F59E0B' : '#EF4444'

                return (
                  <div key={cat} className="py-2.5 border-b border-white/5 last:border-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <span className="text-sm font-medium text-foreground">{getCategoryLabel(cat)}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {catProducts.length}개 ({activeCount} 판매중)
                        </span>
                      </div>
                      <span className="text-sm font-bold" style={{ color: scoreColor }}>
                        {avgScore}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: scoreBarWidth, backgroundColor: scoreColor }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 고위험 상품 경고 */}
            {highRiskProducts.length > 0 && (
              <div className="card-luxury p-5 border-red-500/20">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-red-400 mb-4">
                  <AlertTriangle className="w-4 h-4" />
                  통관 고위험 상품
                </h2>
                <div className="space-y-2">
                  {highRiskProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-sm p-2 bg-red-500/5 rounded-lg group"
                    >
                      <p className="text-red-300 truncate flex-1 mr-2 text-xs">{p.name}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(p)}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-gold transition-all"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <Link href={`/products/${p.id}`}>
                          <ExternalLink className="w-3.5 h-3.5 text-red-400/60 hover:text-red-400" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 빠른 링크 */}
            <div className="card-luxury p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">빠른 메뉴</h2>
              <div className="space-y-2">
                <Link href="/admin/margins" className="block">
                  <button className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 rounded-lg transition-all">
                    <Calculator className="w-4 h-4" />
                    마진 계산기
                  </button>
                </Link>
                <Link href="/products" className="block">
                  <button className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 rounded-lg transition-all">
                    <Package className="w-4 h-4" />
                    전체 상품 목록
                  </button>
                </Link>
                <button
                  onClick={openAdd}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gold border border-gold/20 hover:bg-gold/5 rounded-lg transition-all"
                >
                  <Plus className="w-4 h-4" />
                  새 상품 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Form Modal */}
      <ProductFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        product={editingProduct}
        onSuccess={fetchProducts}
      />
    </>
  )
}
