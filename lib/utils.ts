import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatKRW(amount: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount)
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    health: '건강식품',
    sports: '운동용품',
    beauty: '뷰티',
    outdoor: '아웃도어',
    electronics: '전자기기',
  }
  return labels[category] ?? category
}

export function getRiskLevelLabel(risk: string): string {
  const labels: Record<string, string> = {
    LOW: '낮음',
    MEDIUM: '보통',
    HIGH: '높음',
  }
  return labels[risk] ?? risk
}

export function getRiskLevelColor(risk: string): string {
  const colors: Record<string, string> = {
    LOW: 'text-green-600 bg-green-50',
    MEDIUM: 'text-yellow-600 bg-yellow-50',
    HIGH: 'text-red-600 bg-red-50',
  }
  return colors[risk] ?? 'text-gray-600 bg-gray-50'
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    candidate: '검토중',
    active: '판매중',
    paused: '일시중지',
    discontinued: '중단',
  }
  return labels[status] ?? status
}

export function getSniperScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 65) return 'text-blue-600'
  if (score >= 50) return 'text-yellow-600'
  return 'text-red-600'
}

export function getMarginRateColor(marginRate: number): string {
  if (marginRate >= 30) return 'text-green-600 bg-green-50'
  if (marginRate >= 20) return 'text-blue-600 bg-blue-50'
  if (marginRate >= 10) return 'text-yellow-600 bg-yellow-50'
  return 'text-red-600 bg-red-50'
}

const CATEGORY_IMAGES: Record<string, string> = {
  health: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&q=80',
  sports: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80',
  beauty: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&q=80',
  outdoor: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&q=80',
  electronics: 'https://images.unsplash.com/photo-1593359677879-a4bb92f4834c?w=600&q=80',
}

const PRODUCT_IMAGES: Record<string, string> = {
  'prod-001': 'https://images.unsplash.com/photo-1616671276441-2f2c277b8bf6?w=600&q=80',
  'prod-002': 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=600&q=80',
  'prod-003': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&q=80',
  'prod-004': 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=600&q=80',
  'prod-005': 'https://images.unsplash.com/photo-1598971639058-fab3c3109a28?w=600&q=80',
  'prod-006': 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600&q=80',
  'prod-007': 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=80',
  'prod-008': 'https://images.unsplash.com/photo-1586495777744-4e6232bf5ad8?w=600&q=80',
  'prod-009': 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=600&q=80',
  'prod-010': 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?w=600&q=80',
}

import type { Product } from '@/lib/types'

export function getProductImage(product: Product): string {
  if (product.imageUrl) return product.imageUrl
  return PRODUCT_IMAGES[product.id] ?? CATEGORY_IMAGES[product.category] ?? CATEGORY_IMAGES.health
}
