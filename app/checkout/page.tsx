'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreditCard, Building2, ArrowLeft, Package, AlertCircle, CheckSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { useCart } from '@/lib/cart-context'
import { formatKRW } from '@/lib/utils'

const DOMESTIC_SHIPPING = 3000

const CONSENT_ITEMS = [
  {
    key: 'overseas',
    text: '해당 상품이 해외 구매대행 상품이며, 주문 후 해외 판매처 구매가 진행될 경우 단순변심 취소가 제한될 수 있음을 확인했습니다.',
    required: true,
  },
  {
    key: 'customs',
    text: '상품 가격·발송국·품목·수량·통관 기준에 따라 관부가세가 발생할 수 있음을 확인했습니다.',
    required: true,
  },
  {
    key: 'customsId',
    text: '개인통관고유부호와 수령자 정보가 정확해야 하며, 정보 오류로 인한 통관 지연 또는 반송이 발생할 수 있음을 확인했습니다.',
    required: true,
  },
  {
    key: 'privacy',
    text: '개인정보 수집·이용에 동의합니다. (필수)',
    required: true,
  },
  {
    key: 'refund',
    text: '환불·반품 정책을 확인했습니다. (필수)',
    required: true,
  },
]

export default function CheckoutPage() {
  const router = useRouter()
  const { items, totalPrice, clearCart } = useCart()
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    customsId: '',
    zipcode: '',
    address: '',
    addressDetail: '',
    paymentMethod: 'card' as 'card' | 'transfer',
    requests: '',
  })
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [consentError, setConsentError] = useState(false)

  const total = totalPrice + (items.length > 0 ? DOMESTIC_SHIPPING : 0)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const toggleConsent = (key: string) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }))
    setConsentError(false)
  }

  const allRequired = CONSENT_ITEMS.filter((c) => c.required).every((c) => consents[c.key])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (items.length === 0) return

    if (!allRequired) {
      setConsentError(true)
      return
    }

    setIsSubmitting(true)

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

            {/* 수령자 정보 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">수령자 정보</CardTitle>
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
                  <Label htmlFor="email">이메일 * (주문내역 발송)</Label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="your@email.com"
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <Label htmlFor="customsId">개인통관고유부호 * (해외 구매대행 필수)</Label>
                  <input
                    id="customsId"
                    name="customsId"
                    type="text"
                    required
                    value={form.customsId}
                    onChange={handleChange}
                    placeholder="P000000000000"
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    관세청 개인통관고유부호 발급:{' '}
                    <a
                      href="https://unipass.customs.go.kr"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 underline"
                    >
                      unipass.customs.go.kr
                    </a>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* 배송지 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">배송지 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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

                <div>
                  <Label htmlFor="requests">요청사항 (선택)</Label>
                  <textarea
                    id="requests"
                    name="requests"
                    value={form.requests}
                    onChange={handleChange}
                    placeholder="배송 관련 요청사항을 입력해주세요"
                    rows={2}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 결제 수단 */}
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
                  <span className="text-sm font-medium text-gray-800">계좌이체 (무통장입금)</span>
                </label>
              </CardContent>
            </Card>

            {/* 동의 항목 */}
            <Card className={consentError ? 'border-red-300' : ''}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckSquare className="w-4 h-4" />
                  구매 전 필수 동의
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {consentError && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    모든 필수 항목에 동의해주세요.
                  </div>
                )}
                {CONSENT_ITEMS.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-start gap-3 cursor-pointer group"
                  >
                    <div className="mt-0.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={!!consents[item.key]}
                        onChange={() => toggleConsent(item.key)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-800 transition-colors">
                      {item.text}
                    </span>
                  </label>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* 주문 요약 */}
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
                  <div className="flex justify-between text-xs text-amber-600">
                    <span>관부가세</span>
                    <span>주문 검수 후 안내</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-bold text-gray-900">
                    <span>결제 예정금액</span>
                    <span className="text-blue-600">{formatKRW(total)}</span>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '처리 중...' : '주문 접수하기'}
                </Button>

                <p className="text-xs text-gray-400 text-center leading-relaxed">
                  주문 접수 후 담당자 검수를 거쳐 최종 결제 안내를 드립니다.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
