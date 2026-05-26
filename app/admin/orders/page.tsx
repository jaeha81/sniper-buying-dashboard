'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, ShoppingCart, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatKRW } from '@/lib/utils'
import type { Order } from '@/lib/types'

const sampleOrders: Order[] = [
  {
    id: 'ORD-2024-001',
    productId: 'prod-001',
    productName: '나우푸즈 비타민D3 5000IU 240소프트젤',
    quantity: 3,
    unitPrice: 35000,
    totalPrice: 105000,
    status: 'delivered',
    customerName: '김민준',
    customerEmail: 'minjun.kim@example.com',
    shippingAddress: '서울특별시 강남구 테헤란로 123',
    createdAt: '2024-05-10T09:23:00Z',
    updatedAt: '2024-05-15T14:00:00Z',
  },
  {
    id: 'ORD-2024-002',
    productId: 'prod-004',
    productName: '세라비 스킨케어 비타민C 세럼 30ml',
    quantity: 2,
    unitPrice: 42000,
    totalPrice: 84000,
    status: 'shipping',
    customerName: '이서연',
    customerEmail: 'seoyeon.lee@example.com',
    shippingAddress: '경기도 성남시 분당구 판교로 456',
    createdAt: '2024-05-18T11:05:00Z',
    updatedAt: '2024-05-20T08:30:00Z',
  },
  {
    id: 'ORD-2024-003',
    productId: 'prod-002',
    productName: '옵티멈 뉴트리션 골드 스탠다드 웨이 프로틴 5파운드',
    quantity: 1,
    unitPrice: 110000,
    totalPrice: 110000,
    status: 'ordered',
    customerName: '박지호',
    customerEmail: 'jiho.park@example.com',
    shippingAddress: '부산광역시 해운대구 해운대로 789',
    createdAt: '2024-05-21T15:40:00Z',
    updatedAt: '2024-05-21T15:40:00Z',
  },
  {
    id: 'ORD-2024-004',
    productId: 'prod-005',
    productName: '저항밴드 세트 5단계 강도 운동 탄성밴드',
    quantity: 2,
    unitPrice: 38000,
    totalPrice: 76000,
    status: 'pending',
    customerName: '최수아',
    customerEmail: 'sua.choi@example.com',
    shippingAddress: '대구광역시 수성구 범어로 321',
    createdAt: '2024-05-22T08:15:00Z',
    updatedAt: '2024-05-22T08:15:00Z',
  },
  {
    id: 'ORD-2024-005',
    productId: 'prod-003',
    productName: '요가매트 TPE 6mm 논슬립 친환경 에코 요가매트',
    quantity: 1,
    unitPrice: 65000,
    totalPrice: 65000,
    status: 'cancelled',
    customerName: '정도현',
    customerEmail: 'dohyun.jung@example.com',
    shippingAddress: '인천광역시 남동구 인하로 654',
    createdAt: '2024-05-19T13:22:00Z',
    updatedAt: '2024-05-20T10:00:00Z',
  },
]

const statusTabs = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '결제대기' },
  { key: 'ordered', label: '주문확인' },
  { key: 'shipping', label: '배송중' },
  { key: 'delivered', label: '배송완료' },
  { key: 'cancelled', label: '취소' },
]

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-gray-100 text-gray-600'
    case 'ordered':
      return 'bg-blue-100 text-blue-700'
    case 'shipping':
      return 'bg-yellow-100 text-yellow-700'
    case 'delivered':
      return 'bg-green-100 text-green-700'
    case 'cancelled':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return '결제대기'
    case 'ordered': return '주문확인'
    case 'shipping': return '배송중'
    case 'delivered': return '배송완료'
    case 'cancelled': return '취소'
    default: return status
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export default function AdminOrdersPage() {
  const [activeTab, setActiveTab] = useState('all')

  const filtered =
    activeTab === 'all' ? sampleOrders : sampleOrders.filter((o) => o.status === activeTab)

  const totalRevenue = sampleOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalPrice, 0)

  const totalOrders = sampleOrders.filter((o) => o.status !== 'cancelled').length

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          대시보드
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">주문 관리</h1>
        <p className="text-gray-500 mt-1">전체 주문 현황 및 상태 관리</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">총 주문 수 (취소 제외)</p>
                <p className="text-3xl font-bold text-gray-900">{totalOrders}건</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">총 매출 (취소 제외)</p>
                <p className="text-3xl font-bold text-green-600">{formatKRW(totalRevenue)}</p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {statusTabs.map((tab) => {
          const count =
            tab.key === 'all'
              ? sampleOrders.length
              : sampleOrders.filter((o) => o.status === tab.key).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">주문번호</th>
                  <th className="text-left px-4 py-3 font-medium">상품명</th>
                  <th className="text-center px-4 py-3 font-medium">수량</th>
                  <th className="text-right px-4 py-3 font-medium">금액</th>
                  <th className="text-center px-4 py-3 font-medium">상태</th>
                  <th className="text-left px-4 py-3 font-medium">주문일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{order.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 max-w-xs truncate">
                        {order.productName}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{order.customerName}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{order.quantity}개</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatKRW(order.totalPrice)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(order.status)}`}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      해당 상태의 주문이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
