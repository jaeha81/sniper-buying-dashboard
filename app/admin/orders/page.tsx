'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ShoppingCart,
  TrendingUp,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  Package,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatKRW } from '@/lib/utils'
import type { Order } from '@/lib/types'
import { sampleOrders } from '@/data/sample-orders'

type OrderStatus = Order['status']

const STATUS_TABS: { key: 'all' | OrderStatus; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '결제대기' },
  { key: 'ordered', label: '주문완료' },
  { key: 'shipping', label: '배송중' },
  { key: 'delivered', label: '배송완료' },
  { key: 'cancelled', label: '취소' },
]

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: '결제대기',
  ordered: '주문완료',
  shipping: '배송중',
  delivered: '배송완료',
  cancelled: '취소',
}

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  ordered: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  shipping: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  delivered: 'bg-green-500/15 text-green-400 border border-green-500/30',
  cancelled: 'bg-white/8 text-white/40 border border-white/10',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SkeletonRow() {
  return (
    <tr className="border-b border-white/5">
      {[...Array(8)].map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3 bg-white/8 rounded animate-pulse" style={{ width: `${60 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  )
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | OrderStatus>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/orders')
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders ?? data)
      } else {
        setOrders(sampleOrders)
      }
    } catch {
      setOrders(sampleOrders)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus, updatedAt: new Date().toISOString() } : o))
        )
      }
    } catch {
      // silent fail — UI stays unchanged
    } finally {
      setUpdatingId(null)
    }
  }

  const filtered = activeTab === 'all' ? orders : orders.filter((o) => o.status === activeTab)

  const pending = orders.filter((o) => o.status === 'pending').length
  const shipping = orders.filter((o) => o.status === 'shipping').length
  const delivered = orders.filter((o) => o.status === 'delivered').length
  const totalRevenue = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.totalPrice, 0)

  const summaryCards = [
    {
      label: '전체 주문',
      value: `${orders.length}건`,
      icon: ShoppingCart,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: '결제대기',
      value: `${pending}건`,
      icon: Clock,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
    },
    {
      label: '배송중',
      value: `${shipping}건`,
      icon: Truck,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      label: '배송완료',
      value: `${delivered}건`,
      icon: CheckCircle,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
    },
    {
      label: '총 매출',
      value: formatKRW(totalRevenue),
      icon: TrendingUp,
      color: 'text-[#C9A84C]',
      bg: 'bg-[#C9A84C]/10',
    },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="mb-7">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          관리자 대시보드
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">주문 관리</h1>
            <p className="text-white/40 mt-1 text-sm">전체 주문 현황 및 상태 관리</p>
          </div>
          <button
            onClick={fetchOrders}
            className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            새로고침
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-7">
        {summaryCards.map((card) => (
          <Card key={card.label} className="bg-white/4 border-white/8">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-white/40">{card.label}</p>
                <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
                </div>
              </div>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 상태 필터 탭 */}
      <div className="flex items-center gap-0.5 mb-4 border-b border-white/8 overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.key === 'all' ? orders.length : orders.filter((o) => o.status === tab.key).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-[#C9A84C] text-[#C9A84C]'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-50">({count})</span>
            </button>
          )
        })}
      </div>

      {/* 주문 테이블 */}
      <Card className="bg-white/4 border-white/8">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wide">
                    주문번호
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wide">
                    상품명
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wide">
                    수량
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wide">
                    금액
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wide">
                    고객명
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wide">
                    상태
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wide">
                    주문일시
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wide">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading
                  ? [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
                  : filtered.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-white/3 transition-colors"
                      >
                        <td className="px-4 py-3.5 font-mono text-xs text-white/40">
                          {order.id}
                        </td>
                        <td className="px-4 py-3.5 max-w-[200px]">
                          <p className="font-medium text-white truncate">{order.productName}</p>
                        </td>
                        <td className="px-4 py-3.5 text-center text-white/60">
                          {order.quantity}개
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-white">
                          {formatKRW(order.totalPrice)}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-white/80 font-medium">{order.customerName}</p>
                          <p className="text-xs text-white/30 mt-0.5">{order.customerEmail}</p>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[order.status]}`}
                          >
                            {STATUS_LABELS[order.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-white/40">
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <select
                            value={order.status}
                            disabled={updatingId === order.id}
                            onChange={(e) =>
                              handleStatusChange(order.id, e.target.value as OrderStatus)
                            }
                            className="text-xs bg-white/6 border border-white/12 rounded-md px-2 py-1.5 text-white/70 focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-40 cursor-pointer transition-colors"
                          >
                            {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                              <option key={s} value={s} className="bg-[#0f0f1a]">
                                {STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>

            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-white/30">
                <Package className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">해당 상태의 주문이 없습니다.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
