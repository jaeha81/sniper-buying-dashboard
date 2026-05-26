'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ExternalLink, ShoppingCart, CheckCircle2, TrendingUp, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Product } from '@/lib/types'
import {
  formatKRW,
  formatUSD,
  getCategoryLabel,
  getRiskLevelLabel,
  getStatusLabel,
  getProductImage,
} from '@/lib/utils'
import { useCart } from '@/lib/cart-context'
import { useState } from 'react'

interface ProductCardProps {
  product: Product
  showAdminInfo?: boolean
  index?: number
}

const riskColors = {
  LOW: 'text-emerald-400',
  MEDIUM: 'text-amber-400',
  HIGH: 'text-red-400',
}

export function ProductCard({ product, showAdminInfo = false, index = 0 }: ProductCardProps) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const imageUrl = getProductImage(product)

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    addItem(product)
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
  }

  const isUnavailable = product.status === 'paused' || product.status === 'discontinued'

  const scorePercent = product.sniperScore
  const scoreColor =
    scorePercent >= 80 ? '#22C55E' : scorePercent >= 65 ? '#C9A84C' : scorePercent >= 50 ? '#F59E0B' : '#EF4444'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: 'easeOut' }}
    >
      <Link href={`/products/${product.id}`} className="block group">
        <div className="card-luxury rounded-2xl overflow-hidden cursor-pointer">
          {/* Product image */}
          <div className="product-img-wrap relative h-52 bg-luxury-elevated">
            {!imgError ? (
              <Image
                src={imageUrl}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-luxury-elevated">
                <span className="text-5xl opacity-40">{getCategoryEmoji(product.category)}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-luxury-surface via-transparent to-transparent opacity-60" />

            {/* Badges */}
            <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
              <span className="text-[10px] font-medium tracking-widest uppercase bg-black/50 text-gold-light backdrop-blur-sm px-2 py-1 rounded-md border border-gold/20">
                {getCategoryLabel(product.category)}
              </span>
              {product.status !== 'active' && (
                <span className="text-[10px] font-medium bg-black/50 backdrop-blur-sm px-2 py-1 rounded-md text-muted-foreground border border-white/10">
                  {getStatusLabel(product.status)}
                </span>
              )}
            </div>

            {/* Score ring */}
            <div className="absolute bottom-3 right-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{
                  background: `conic-gradient(${scoreColor} ${scorePercent * 3.6}deg, rgba(255,255,255,0.08) ${scorePercent * 3.6}deg)`,
                  boxShadow: `0 0 16px ${scoreColor}40`,
                }}
              >
                <div
                  className="w-8 h-8 rounded-full bg-luxury-surface flex items-center justify-center text-[10px] font-bold"
                  style={{ color: scoreColor }}
                >
                  {scorePercent}
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            <h3 className="font-serif text-base font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-gold-light transition-colors">
              {product.name}
            </h3>

            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">해외 소싱가</p>
                <p className="text-sm text-muted-foreground">{formatUSD(product.overseasPrice)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground mb-0.5">국내 판매가</p>
                <p className="text-lg font-bold text-foreground">
                  {formatKRW(product.domesticExpectedPrice)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-gold" />
                <span className="text-sm font-semibold text-gold">
                  마진 {product.marginRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-muted-foreground" />
                <span className={`text-xs font-medium ${riskColors[product.riskLevel]}`}>
                  {getRiskLevelLabel(product.riskLevel)}
                </span>
              </div>
            </div>

            {showAdminInfo && (
              <div className="bg-luxury-elevated rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">총원가</span>
                  <span className="text-foreground">{formatKRW(product.totalCost)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">예상 순마진</span>
                  <span className={product.expectedMargin > 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatKRW(product.expectedMargin)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1" onClick={(e) => e.preventDefault()}>
              <Button
                size="sm"
                className="flex-1 bg-gold hover:bg-gold-light text-luxury-bg font-semibold text-xs transition-all"
                onClick={handleAddToCart}
                disabled={isUnavailable}
              >
                {added ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    담김
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                    담기
                  </>
                )}
              </Button>
              <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 hover:border-gold/30 hover:text-gold text-muted-foreground"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

function getCategoryEmoji(category: string) {
  const map: Record<string, string> = {
    health: '💊',
    sports: '🏋️',
    beauty: '✨',
    outdoor: '🏕️',
    electronics: '⚡',
  }
  return map[category] || '📦'
}
