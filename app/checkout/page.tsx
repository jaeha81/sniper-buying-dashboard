'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreditCard, Building2, ArrowLeft, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { useCart } from '@/lib/cart-context'
import { formatKRW } from '@/lib/utils'

const DOMESTIC_SHIPPING = 3000

export default function CheckoutPage() {
  const router = useRouter()
  const { items, totalPrice, clearCart } = useCart()
  const [form, setForm] = useState({
    name: '',
    phone: '',
    zipcode: '',
    address: '',
    addressDetail: '',
    paymentMethod: 'card' as 'card' | 'transfer',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const total = totalPrice + (items.length > 0 ? DOMESTIC_SHIPPING : 0)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (items.length === 0) return
    setIsSubmitting(true)

    // 주문 저장 (localStorage)
    const orderId = `SB-${Date.now()}`
    const order = {
      id: orderId,
      items: items.map((i) => ({
        productId: i.product.id,
        name: i.product.name,
        quantity: i.quantity,
        unitPrice: i.product.domesticExpectedPrice,
        totalPrice: i.product.domesticExpectedPrice * i.quantity,
      })),
      subtotal: totalPrice,
      shipping: DOMESTIC_SHIPPING,
      total,
      customer: form,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    try {
      const existing = JSON.parse(localStorage.getItem('sniper_orders') || '[]')
      localStorage.setItem('sniper_orders', JSON.stringify([order, ...existing]))
    } catch {}

    clearCart()
    setTimeout(() => {
      router.push(`/order-complete?orderId=${orderId}`)
    }, 600)
  }

  if (items.length === 0 && !isSubmitting) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <Package className="w-16 h-16 mx-auto mb-4 text-gray-200" />
        <h1 className="text-xl font-bold text-gray-700 mb-2">장바구니가 비어있습니다</h1>
        <Link href="/products">
          <Button className="mt-4">상품 둘러보기</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          장바구니로 돌아가기
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">주문 / 결제</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">배송지 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">받는 분 이름 *</Label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      value={form.name}
                      onChange={handleChange}
                      placeholder="홍길동"
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">전화번호 *</Label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      required
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="010-0000-0000"
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <Label>주소 *</Label>
                  <div className="mt-1 flex gap-2">
                    <input
                      name="zipcode"
                      type="text"
                      required
                      value={form.zipcode}
                      onChange={handleChange}
                      placeholder="우편번호"
                      className="w-32 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button type="button" variant="outline" className="text-sm shrink-0">
                      우편번호 찾기
                    </Button>
                  </div>
                  <input
                    name="address"
                    type="text"
                    required
                    value={form.address}
                    onChange={handleChange}
                    placeholder="기본 주소"
                    className="mt-2 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    name="addressDetail"
                    type="text"
                    value={form.addressDetail}
                    onChange={handleChange}
                    placeholder="상세 주소 (동/호수 등)"
                    className="mt-2 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">결제 수단</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    form.paymentMethod === 'card'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="card"
                    checked={form.paymentMethod === 'card'}
                    onChange={handleChange}
                    className="text-blue-600"
                  />
                  <CreditCard className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-800">신용 / 체크카드</span>
                </label>
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    form.paymentMethod === 'transfer'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="transfer"
                    checked={form.paymentMethod === 'transfer'}
                    onChange={handleChange}
                    className="text-blue-600"
                  />
                  <Building2 className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-800">계좌이체</span>
                </label>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="text-base">주문 요약</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 pb-3 border-b border-dashed border-gray-100">
                  {items.map(({ product, quantity }) => (
                    <div key={product.id} className="text-sm">
                      <p className="text-gray-700 leading-snug text-xs">{product.name}</p>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {formatKRW(product.domesticExpectedPrice)} × {quantity}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>상품 금액</span>
                    <span>{formatKRW(totalPrice)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>배송비</span>
                    <span>{formatKRW(DOMESTIC_SHIPPING)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-bold text-gray-900">
                    <span>최종 결제금액</span>
                    <span className="text-blue-600">{formatKRW(total)}</span>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '처리 중...' : '결제하기'}
                </Button>

                <p className="text-xs text-gray-400 text-center">
                  주문 전 이용약관 및 환불정책을 확인해주세요.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
