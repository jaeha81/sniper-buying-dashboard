'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Script from 'next/script'
import {
  CreditCard,
  Building2,
  ArrowLeft,
  Package,
  AlertCircle,
  CheckSquare,
  Smartphone,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { useCart } from '@/lib/cart-context'
import { formatKRW } from '@/lib/utils'

const DOMESTIC_SHIPPING = 3000
const TOSS_CLIENT_KEY =
  process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eon'

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

type PaymentMethod = 'card' | 'transfer' | 'kakaopay'

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paymentFailed = searchParams.get('failed') === 'true'

  const { items, totalPrice, clearCart } = useCart()
  const [tossLoaded, setTossLoaded] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    customsId: '',
    zipcode: '',
    address: '',
    addressDetail: '',
    paymentMethod: 'card' as PaymentMethod,
    requests: '',
  })
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  const total = totalPrice + (items.length > 0 ? DOMESTIC_SHIPPING : 0)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setForm((prev) => ({ ...prev, paymentMethod: method }))
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

    if (!tossLoaded) {
      setPaymentError('결제 모듈이 로드되지 않았습니다. 잠시 후 다시 시도해주세요.')
      return
    }

    setIsSubmitting(true)
    setPaymentError('')

    try {
      // 1. Create pending order
      const orderId = `SB-${Date.now()}`
      const orderPayload = {
        productId: items[0]?.product.id ?? 'multi',
        productName: items.map((i) => i.product.name).join(', ').slice(0, 100),
        quantity: items.reduce((s, i) => s + i.quantity, 0),
        unitPrice: totalPrice,
        totalPrice: total,
        customerName: form.name,
        customerEmail: form.email,
        customsId: form.customsId,
        shippingAddress: `${form.zipcode} ${form.address} ${form.addressDetail}`.trim(),
        paymentMethod: form.paymentMethod,
        requests: form.requests,
      }

      // Best-effort order creation (Supabase may not be configured)
      try {
        await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...orderPayload, orderRef: orderId }),
        })
      } catch {
        // Non-fatal — proceed with payment
      }

      // 2. Trigger Toss Payments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const TossPayments = (window as any).TossPayments
      if (!TossPayments) {
        throw new Error('결제 모듈을 불러올 수 없습니다.')
      }

      const toss = TossPayments(TOSS_CLIENT_KEY)

      const methodMap: Record<PaymentMethod, string> = {
        card: '카드',
        transfer: '계좌이체',
        kakaopay: '카카오페이',
      }

      await toss.requestPayment(methodMap[form.paymentMethod], {
        amount: total,
        orderId,
        orderName: items.map((i) => i.product.name).join(', ').slice(0, 100),
        customerName: form.name,
        customerEmail: form.email,
        successUrl: `${window.location.origin}/order-complete?orderId=${orderId}`,
        failUrl: `${window.location.origin}/checkout?failed=true`,
        ...(form.paymentMethod === 'kakaopay' && {
          easyPay: { easyPayType: 'KAKAOPAY' },
        }),
      })

      clearCart()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '결제 처리 중 오류가 발생했습니다.'
      // User-cancelled payment — don't show error
      if (!msg.includes('PAY_PROCESS_CANCELED')) {
        setPaymentError(msg)
      }
      setIsSubmitting(false)
    }
  }

  if (items.length === 0 && !isSubmitting) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <Package className="w-16 h-16 mx-auto mb-4 text-white/10" />
        <h1 className="text-xl font-bold text-foreground mb-2">장바구니가 비어있습니다</h1>
        <Link href="/products">
          <Button className="mt-4 bg-gold-gradient text-luxury-bg hover:opacity-90">
            상품 둘러보기
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Toss Payments CDN */}
      <Script
        src="https://js.tosspayments.com/v1/payment"
        strategy="afterInteractive"
        onLoad={() => setTossLoaded(true)}
      />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <Link
            href="/cart"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            장바구니로 돌아가기
          </Link>
          <h1 className="text-2xl font-bold text-foreground">주문 / 결제</h1>
        </div>

        {/* Payment failed banner */}
        {paymentFailed && (
          <div className="flex items-center gap-3 p-4 mb-6 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            <XCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-medium">결제가 실패하였습니다.</p>
              <p className="text-xs text-red-400/70 mt-0.5">
                카드 정보를 확인하시거나 다른 결제 수단을 이용해 주세요.
              </p>
            </div>
          </div>
        )}

        {/* Payment error */}
        {paymentError && (
          <div className="flex items-center gap-3 p-4 mb-6 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {paymentError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">

              {/* 수령자 정보 */}
              <div className="card-luxury p-6">
                <h2 className="text-base font-semibold text-foreground mb-5">수령자 정보</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name" className="text-xs text-muted-foreground">받는 분 이름 *</Label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        value={form.name}
                        onChange={handleChange}
                        placeholder="홍길동"
                        className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-xs text-muted-foreground">전화번호 *</Label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        required
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="010-0000-0000"
                        className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-xs text-muted-foreground">이메일 * (주문내역 발송)</Label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="your@email.com"
                      className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all"
                    />
                  </div>

                  <div>
                    <Label htmlFor="customsId" className="text-xs text-muted-foreground">개인통관고유부호 * (해외 구매대행 필수)</Label>
                    <input
                      id="customsId"
                      name="customsId"
                      type="text"
                      required
                      value={form.customsId}
                      onChange={handleChange}
                      placeholder="P000000000000"
                      className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      관세청 개인통관고유부호 발급:{' '}
                      <a
                        href="https://unipass.customs.go.kr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gold hover:text-gold-light underline transition-colors"
                      >
                        unipass.customs.go.kr
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              {/* 배송지 */}
              <div className="card-luxury p-6">
                <h2 className="text-base font-semibold text-foreground mb-5">배송지 정보</h2>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">주소 *</Label>
                    <div className="mt-1 flex gap-2">
                      <input
                        name="zipcode"
                        type="text"
                        required
                        value={form.zipcode}
                        onChange={handleChange}
                        placeholder="우편번호"
                        className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all"
                      />
                      <button
                        type="button"
                        className="px-3 py-2 text-sm border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 rounded-lg transition-all shrink-0"
                      >
                        우편번호 찾기
                      </button>
                    </div>
                    <input
                      name="address"
                      type="text"
                      required
                      value={form.address}
                      onChange={handleChange}
                      placeholder="기본 주소"
                      className="mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all"
                    />
                    <input
                      name="addressDetail"
                      type="text"
                      value={form.addressDetail}
                      onChange={handleChange}
                      placeholder="상세 주소 (동/호수 등)"
                      className="mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all"
                    />
                  </div>

                  <div>
                    <Label htmlFor="requests" className="text-xs text-muted-foreground">요청사항 (선택)</Label>
                    <textarea
                      id="requests"
                      name="requests"
                      value={form.requests}
                      onChange={handleChange}
                      placeholder="배송 관련 요청사항을 입력해주세요"
                      rows={2}
                      className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* 결제 수단 — Toss Payments */}
              <div className="card-luxury p-6">
                <h2 className="text-base font-semibold text-foreground mb-5">결제 수단</h2>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      { method: 'card' as PaymentMethod, icon: CreditCard, label: '카드결제' },
                      { method: 'transfer' as PaymentMethod, icon: Building2, label: '계좌이체' },
                      { method: 'kakaopay' as PaymentMethod, icon: Smartphone, label: '카카오페이' },
                    ] as const
                  ).map(({ method, icon: Icon, label }) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => handlePaymentMethodChange(method)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                        form.paymentMethod === method
                          ? 'border-gold/60 bg-gold/5 text-gold'
                          : 'border-white/10 text-muted-foreground hover:border-white/20 hover:bg-white/3'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>

                {!tossLoaded && (
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                    <span className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin inline-block" />
                    결제 모듈 로드 중...
                  </p>
                )}
              </div>

              {/* 동의 항목 */}
              <div className={`card-luxury p-6 ${consentError ? 'border-red-500/30' : ''}`}>
                <h2 className="text-base font-semibold text-foreground mb-5 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4" />
                  구매 전 필수 동의
                </h2>
                {consentError && (
                  <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    모든 필수 항목에 동의해주세요.
                  </div>
                )}
                <div className="space-y-3">
                  {CONSENT_ITEMS.map((item) => (
                    <label key={item.key} className="flex items-start gap-3 cursor-pointer group">
                      <div className="mt-0.5 shrink-0">
                        <input
                          type="checkbox"
                          checked={!!consents[item.key]}
                          onChange={() => toggleConsent(item.key)}
                          className="w-4 h-4 rounded border-white/20 bg-white/5 text-gold focus:ring-gold/30"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 주문 요약 */}
            <div>
              <div className="card-luxury p-5 sticky top-20">
                <h2 className="text-base font-semibold text-foreground mb-4">주문 요약</h2>

                <div className="space-y-2 pb-3 border-b border-white/5">
                  {items.map(({ product, quantity }) => (
                    <div key={product.id} className="text-sm">
                      <p className="text-foreground/80 text-xs leading-snug">{product.name}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {formatKRW(product.domesticExpectedPrice)} × {quantity}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 mt-3">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>상품 금액</span>
                    <span>{formatKRW(totalPrice)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>배송비</span>
                    <span>{formatKRW(DOMESTIC_SHIPPING)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-amber-400/80">
                    <span>관부가세</span>
                    <span>주문 검수 후 안내</span>
                  </div>
                  <div className="border-t border-white/5 pt-2 flex justify-between font-bold text-foreground">
                    <span>결제 예정금액</span>
                    <span className="text-gold">{formatKRW(total)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-gold-gradient text-luxury-bg text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all shadow-gold-glow"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="w-4 h-4 border-2 border-luxury-bg/30 border-t-luxury-bg rounded-full animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {isSubmitting ? '결제 처리 중...' : '결제하기'}
                </button>

                <p className="text-xs text-muted-foreground text-center mt-3 leading-relaxed">
                  토스페이먼츠를 통한 안전한 결제
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutContent />
    </Suspense>
  )
}
