'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Home, Package } from 'lucide-react'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { formatKRW } from '@/lib/utils'
import type { Order } from '@/lib/types'

const steps = ['주문접수', '구매대행', '국제배송', '국내배송', '배달완료']

function OrderCompleteContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderId) { setLoading(false); return }

    // Fetch from API (Supabase-backed), fall back to localStorage
    fetch(`/api/orders?ref=${encodeURIComponent(orderId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.order) {
          setOrder(data.order)
        } else {
          // localStorage fallback for offline / unconfigured environments
          try {
            const raw = localStorage.getItem('sniper_orders')
            if (raw) {
              const orders = JSON.parse(raw) as Array<{ id: string }>
              const found = orders.find((o) => o.id === orderId)
              if (found) setOrder(found as unknown as Order)
            }
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [orderId])

  const displayOrderId = order?.orderRef ?? orderId ?? 'SB-2026-001234'
  const orderDate = order?.createdAt
    ? new Date(order.createdAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        주문 정보를 불러오는 중...
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">주문이 완료되었습니다!</h1>
          <p className="text-gray-500 text-sm">
            주문해 주셔서 감사합니다. 빠르게 처리해 드리겠습니다.
          </p>
        </div>

        <Card className="mb-4">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">주문 정보</h2>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">주문번호</span>
              <span className="font-medium text-gray-900 font-mono">{displayOrderId}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">주문일시</span>
              <span className="font-medium text-gray-900">{orderDate}</span>
            </div>
            {order?.customerName && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">주문자</span>
                <span className="font-medium text-gray-900">{order.customerName}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">예상 배송</span>
              <span className="font-medium text-gray-900">주문일로부터 7~14일 소요</span>
            </div>
          </CardContent>
        </Card>

        {order && (
          <Card className="mb-4">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">주문 내역</h2>
              <div className="space-y-2 pb-3 border-b border-dashed border-gray-100">
                <div className="flex justify-between items-start gap-2">
                  <p className="text-xs text-gray-700 leading-snug flex-1">
                    {order.productName}
                    {order.quantity > 1 && (
                      <span className="text-gray-400"> x{order.quantity}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-900 font-medium shrink-0">
                    {formatKRW(order.totalPrice)}
                  </p>
                </div>
              </div>
              <div className="pt-3 space-y-1.5">
                <div className="flex justify-between font-bold text-gray-900 pt-1">
                  <span>결제 금액</span>
                  <span className="text-blue-600">{formatKRW(order.totalPrice)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-8">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">배송 진행 단계</h2>
            <div className="flex items-center justify-between">
              {steps.map((step, idx) => (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <span
                      className={`text-xs mt-1.5 whitespace-nowrap ${
                        idx === 0 ? 'text-blue-600 font-medium' : 'text-gray-400'
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`h-0.5 w-6 mx-1 mb-4 ${idx === 0 ? 'bg-blue-600' : 'bg-gray-200'}`}
                    />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/" className="flex-1">
            <Button variant="outline" className="w-full">
              <Home className="w-4 h-4 mr-2" />
              홈으로
            </Button>
          </Link>
          <Link href="/products" className="flex-1">
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              <Package className="w-4 h-4 mr-2" />
              쇼핑 계속하기
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function OrderCompletePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-gray-400">로딩 중...</div>}>
      <OrderCompleteContent />
    </Suspense>
  )
}
