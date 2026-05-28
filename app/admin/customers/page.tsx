'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Users, BarChart2, Search, XCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatKRW } from '@/lib/utils'

interface CustomerRow {
  email: string
  name: string
  totalOrders: number
  totalSpent: number
  lastOrderAt: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/customers')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers ?? [])
      } else if (res.status === 401) {
        setFetchError('인증이 필요합니다. 다시 로그인해주세요.')
      } else {
        setFetchError(`고객 목록을 불러오지 못했습니다. (HTTP ${res.status})`)
      }
    } catch {
      setFetchError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.email.toLowerCase().includes(query.toLowerCase())
  )

  const totalCustomers = customers.length
  const avgSpent =
    totalCustomers > 0
      ? Math.round(customers.reduce((s, c) => s + c.totalSpent, 0) / totalCustomers)
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">고객 관리</h1>
            <p className="text-gray-500 mt-1">등록 고객 현황 및 구매 내역</p>
          </div>
          <button
            onClick={fetchCustomers}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            새로고침
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <XCircle className="w-4 h-4 shrink-0" />
          {fetchError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">총 고객 수</p>
                <p className="text-3xl font-bold text-gray-900">
                  {loading ? '—' : `${totalCustomers}명`}
                </p>
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
                <p className="text-3xl font-bold text-purple-600">
                  {loading ? '—' : formatKRW(avgSpent)}
                </p>
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
            <span className="text-sm font-normal text-gray-400">총 {loading ? '…' : totalCustomers}명</span>
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
                  <th className="text-left px-4 py-3 font-medium">최근 주문</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading
                  ? [...Array(4)].map((_, i) => (
                      <tr key={i}>
                        {[...Array(5)].map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + (j % 3) * 20}%` }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : filtered.map((c) => (
                      <tr key={c.email} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{c.name}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{c.email}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{c.totalOrders}건</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatKRW(c.totalSpent)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(c.lastOrderAt)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loading && filtered.length === 0 && !fetchError && (
              <div className="py-12 text-center text-gray-400 text-sm">
                {customers.length === 0 ? '아직 주문한 고객이 없습니다.' : '검색 결과가 없습니다.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
