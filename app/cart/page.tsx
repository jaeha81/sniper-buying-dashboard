'use client'

import Link from 'next/link'
import { Trash2, ShoppingCart, ArrowRight, Package, Minus, Plus } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { useCart } from '@/lib/cart-context'
import { formatKRW, getCategoryLabel } from '@/lib/utils'

const DOMESTIC_SHIPPING = 3000

export default function CartPage() {
  const { items, updateQuantity, removeItem, totalPrice } = useCart()

  const total = totalPrice + (items.length > 0 ? DOMESTIC_SHIPPING : 0)

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingCart className="w-5 h-5 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">장바구니</h1>
        </div>
        <p className="text-sm text-gray-500">{items.length}개 상품</p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <Package className="w-16 h-16 mx-auto text-gray-200 mb-4" />
          <p className="text-gray-500 text-lg font-medium">장바구니가 비어있습니다</p>
          <p className="text-gray-400 text-sm mt-1 mb-6">스나이퍼 검증 상품을 담아보세요.</p>
          <Link href="/products">
            <Button>상품 둘러보기</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {items.map(({ product, quantity }) => (
              <Card key={product.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center shrink-0">
                      <Package className="w-7 h-7 text-gray-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {getCategoryLabel(product.category)}
                      </span>
                      <p className="font-medium text-gray-900 mt-1 text-sm leading-snug">
                        {product.name}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        단가: {formatKRW(product.domesticExpectedPrice)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center border rounded-md">
                        <button
                          onClick={() => updateQuantity(product.id, quantity - 1)}
                          className="p-1.5 hover:bg-gray-100 rounded-l-md transition-colors"
                          aria-label="수량 줄이기"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-3 py-1.5 text-sm font-medium min-w-[36px] text-center">
                          {quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(product.id, quantity + 1)}
                          className="p-1.5 hover:bg-gray-100 rounded-r-md transition-colors"
                          aria-label="수량 늘리기"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-right min-w-[90px]">
                        <p className="font-semibold text-gray-900 text-sm">
                          {formatKRW(product.domesticExpectedPrice * quantity)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeItem(product.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors p-1"
                        aria-label="상품 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="pt-2">
              <Link href="/products">
                <Button variant="outline" className="text-sm">
                  ← 쇼핑 계속하기
                </Button>
              </Link>
            </div>
          </div>

          <div>
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="text-base">주문 요약</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>상품 금액</span>
                  <span>{formatKRW(totalPrice)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>국내 배송비</span>
                  <span>{formatKRW(DOMESTIC_SHIPPING)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between font-bold text-gray-900">
                  <span>합계</span>
                  <span className="text-blue-600 text-lg">{formatKRW(total)}</span>
                </div>

                <Link href="/checkout" className="block mt-4">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    주문하기
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
