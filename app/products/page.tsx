'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/components/product-card'
import { sampleProducts } from '@/data/sample-products'
import { getCategoryLabel } from '@/lib/utils'
import type { Product } from '@/lib/types'

type SortKey = 'sniperScore' | 'marginRate' | 'domesticExpectedPrice' | 'name'
type FilterCategory = 'all' | Product['category']
type FilterStatus = 'all' | Product['status']

const categories: { value: FilterCategory; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'health', label: '건강식품' },
  { value: 'sports', label: '운동용품' },
  { value: 'beauty', label: '뷰티' },
  { value: 'outdoor', label: '아웃도어' },
  { value: 'electronics', label: '전자기기' },
]

const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'sniperScore', label: '스나이퍼 스코어 높은순' },
  { value: 'marginRate', label: '마진율 높은순' },
  { value: 'domesticExpectedPrice', label: '국내가 낮은순' },
  { value: 'name', label: '이름순' },
]

const STATUS_LABELS: Record<string, string> = {
  all: '전체', active: '판매중', candidate: '검토중', paused: '일시중지',
}

export default function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('all')
  const [selectedSort, setSelectedSort] = useState<SortKey>('sniperScore')
  const [selectedStatus, setSelectedStatus] = useState<FilterStatus>('all')

  const filteredProducts = useMemo(() => {
    let products = [...sampleProducts]
    if (selectedCategory !== 'all') products = products.filter((p) => p.category === selectedCategory)
    if (selectedStatus !== 'all') products = products.filter((p) => p.status === selectedStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      products = products.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || getCategoryLabel(p.category).includes(q)
      )
    }
    products.sort((a, b) => {
      switch (selectedSort) {
        case 'sniperScore': return b.sniperScore - a.sniperScore
        case 'marginRate': return b.marginRate - a.marginRate
        case 'domesticExpectedPrice': return a.domesticExpectedPrice - b.domesticExpectedPrice
        case 'name': return a.name.localeCompare(b.name, 'ko')
        default: return 0
      }
    })
    return products
  }, [searchQuery, selectedCategory, selectedSort, selectedStatus])

  return (
    <div className="min-h-screen bg-luxury-bg">
      {/* Page header */}
      <div className="border-b border-white/5 bg-luxury-surface">
        <div className="container mx-auto px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-xs text-gold tracking-widest uppercase font-medium mb-3">
              전체 상품
            </p>
            <h1 className="font-serif text-4xl font-medium">
              스나이퍼 검증 상품 목록
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              8개 지표로 엄선된 해외 직구 상품 · 스코어 60점 이상만 등재
            </p>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Filter panel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="border border-white/6 bg-luxury-surface rounded-2xl p-5 mb-8 space-y-4"
        >
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="상품명, 카테고리 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-luxury-elevated border-white/8 focus:border-gold/30 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-3 py-1.5 text-xs rounded-full font-medium transition-all duration-200 ${
                  selectedCategory === cat.value
                    ? 'bg-gold text-luxury-bg shadow-gold-glow'
                    : 'bg-luxury-elevated text-muted-foreground border border-white/6 hover:border-gold/20 hover:text-foreground'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Status + sort */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-muted-foreground">상태:</span>
              {(['all', 'active', 'candidate', 'paused'] as FilterStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedStatus(s)}
                  className={`px-2.5 py-1 text-xs rounded-full transition-all duration-200 font-medium ${
                    selectedStatus === s
                      ? 'bg-white/15 text-foreground border border-white/20'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={selectedSort}
                onChange={(e) => setSelectedSort(e.target.value as SortKey)}
                className="text-xs border border-white/8 rounded-lg px-3 py-1.5 bg-luxury-elevated text-foreground focus:outline-none focus:border-gold/30"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-6">
          총 <span className="font-semibold text-foreground">{filteredProducts.length}</span>개 상품
        </p>

        {/* Product grid */}
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium text-foreground">검색 결과가 없습니다</p>
            <p className="text-sm mt-1">다른 키워드나 카테고리를 선택해보세요.</p>
            <Button
              variant="outline"
              className="mt-5 border-white/10 hover:border-gold/30 hover:text-gold"
              onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setSelectedStatus('all') }}
            >
              필터 초기화
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
