export interface Product {
  id: string
  name: string
  category: 'health' | 'sports' | 'beauty' | 'outdoor' | 'electronics'
  description: string
  overseasPrice: number // USD
  localShippingCost: number // USD (현지배송비)
  internationalShippingCost: number // KRW (국제배송비)
  domesticExpectedPrice: number // KRW (국내판매가)
  taxEstimate: number // KRW (관세+부가세)
  paymentFee: number // KRW (결제수수료)
  domesticShippingCost: number // KRW (국내배송비)
  otherCosts: number // KRW
  totalCost: number // KRW (자동계산)
  expectedMargin: number // KRW (자동계산)
  marginRate: number // % (자동계산)
  sniperScore: number // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  sourceUrl: string
  competitorUrl: string
  status: 'candidate' | 'active' | 'paused' | 'discontinued'
  // Sniper Score 세부
  demandScore: number // 1-5
  priceCompetitivenessScore: number // 1-5
  shippingStabilityScore: number // 1-5
  competitionLevel: 'low' | 'medium' | 'high'
  pageConvincingScore: number // 1-5
  automationScore: number // 1-5
  imageUrl?: string
  createdAt?: string
  updatedAt?: string
}

export interface Order {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number // KRW
  totalPrice: number // KRW
  status: 'pending' | 'ordered' | 'shipping' | 'delivered' | 'cancelled'
  customerName: string
  customerEmail: string
  shippingAddress: string
  createdAt: string
  updatedAt: string
}

export interface Customer {
  id: string
  name: string
  email: string
  phone?: string
  address?: string
  totalOrders: number
  totalSpent: number // KRW
  createdAt: string
}

export interface MarginInput {
  overseasPrice: number // USD
  exchangeRate: number // KRW per USD
  localShippingCost: number // USD
  internationalShippingCost: number // KRW
  customsDuty: number // KRW
  vat: number // KRW
  domesticShippingCost: number // KRW
  paymentFee: number // KRW
  otherCosts: number // KRW
  domesticExpectedPrice: number // KRW
}

export interface MarginResult {
  overseasPriceKRW: number
  localShippingCostKRW: number
  totalCost: number
  expectedMargin: number
  marginRate: number
  taxEstimate: number
}

export interface SniperInput {
  demandScore: number // 1-5
  priceCompetitivenessScore: number // 1-5
  marginRate: number // %
  shippingStabilityScore: number // 1-5
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  competitionLevel: 'low' | 'medium' | 'high'
  pageConvincingScore: number // 1-5
  automationScore: number // 1-5
}

export interface SniperScoreResult {
  total: number
  breakdown: {
    demand: number // max 20
    priceCompetitiveness: number // max 20
    margin: number // max 20
    shippingStability: number // max 15
    customsRisk: number // max 10
    competition: number // max 5
    pageConvincing: number // max 5
    automation: number // max 5
  }
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export type CategoryLabel = {
  health: '건강식품'
  sports: '운동용품'
  beauty: '뷰티'
  outdoor: '아웃도어'
  electronics: '전자기기'
}
