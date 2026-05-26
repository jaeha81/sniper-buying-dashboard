'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Users, BarChart2, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatKRW } from '@/lib/utils'
import type { Customer } from '@/lib/types'

const sampleCustomers: Customer[] = [
  {
    id: 'cust-001',
    name: '김민준',
    email: 'minjun.kim@example.com',
    phone: '010-1234-5678',
    address: '서울특별시 강남구 테헤란로 123',
    totalOrders: 7,
    totalSpent: 420000,
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'cust-002',
    name: '이서연',
    email: 'seoyeon.lee@example.com',
    phone: '010-2345-6789',
    address: '경기도 성남시 분당구 판교로 456',
    totalOrders: 4,
    totalSpent: 248000,
    createdAt: '2024-02-20T14:30:00Z',
  },
  {
    id: 'cust-003',
    name: '박지호',
    email: 'jiho.park@example.com',
    phone: '010-3456-7890',
    address: '부산광역시 해운대구 해운대로 789',
    totalOrders: 12,
    totalSpent: 890000,
    createdAt: '2023-11-05T09:00:00Z',
  },
  {
    id: 'cust-004',
    name: '최수아',
    email: 'sua.choi@example.com',
    phone: '010-4567-8901',
    address: '대구광역시 수성구 범어로 321',
    totalOrders: 2,
    totalSpent: 114000,
    createdAt: '2024-04-08T11:45:00Z',
  },
  {
    id: 'cust-005',
    name: '정도현',
    email: 'dohyun.jung@example.com',
    phone: '010-5678-9012',
    address: '인천광역시 남동구 인하로 654',
    totalOrders: 5,
    totalSpent: 335000,
    createdAt: '2024-03-12T16:20:00Z',
  },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export default function AdminCustomersPage() {
  const [query, setQuery] = useState('')

  const totalCustomers = sampleCustomers.length
  const avgOrderValue =
    totalCustomers > 0
      ? Math.round(
          sampleCustomers.reduce((sum, c) => sum + c.totalSpent, 0) / totalCustomers
        )
      : 0

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
        <h1 className="text-2xl font-bold text-gray-900">고객 관리</h1>
        <p className="text-gray-500 mt-1">등록 고객 현황 및 구매 내역</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">총 고객 수</p>
                <p className="text-3xl font-bold text-gray-900">{totalCustomers}명</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">평균 구매금액</p>
                <p className="text-3xl font-bold text-purple-600">{formatKRW(avgOrderValue)}</p>
              </div>
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <BarChart2 className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="이름 또는 이메일 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 h-10 rounded-md border border-gray-200 bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            고객 목록{' '}
            <span className="text-sm font-normal text-gray-400">총 {totalCustomers}명</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">이름</th>
                  <th className="text-left px-4 py-3 font-medium">이메일</th>
                  <th className="text-center px-4 py-3 font-medium">총 주문수</th>
                  <th className="text-right px-4 py-3 font-medium">총 구매금액</th>
                  <th className="text-left px-4 py-3 font-medium">가입일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sampleCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{customer.name}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{customer.email}</td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {customer.totalOrders}건
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatKRW(customer.totalSpent)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
