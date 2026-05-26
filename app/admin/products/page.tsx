'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Plus, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { sampleProducts } from '@/data/sample-products'
import { getCategoryLabel, getRiskLevelLabel, getStatusLabel } from '@/lib/utils'
import { getSniperGrade } from '@/lib/calculator'

export default function AdminProductsPage() {
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered =
    statusFilter === 'all'
      ? sampleProducts
      : sampleProducts.filter((p) => p.status === statusFilter)

  const statusFilters = [
    { key: 'all', label: '전체', count: sampleProducts.length },
    {
      key: 'active',
      label: '판매중',
      count: sampleProducts.filter((p) => p.status === 'active').length,
    },
    {
      key: 'candidate',
      label: '검토중',
      count: sampleProducts.filter((p) => p.status === 'candidate').length,
    },
    {
      key: 'paused',
      label: '일시중지',
      count: sampleProducts.filter((p) => p.status === 'paused').length,
    },
    {
      key: 'discontinued',
      label: '중단',
      count: sampleProducts.filter((p) => p.status === 'discontinued').length,
    },
  ]

  function getSniperScoreBg(score: number): string {
    if (score >= 80) return 'bg-green-500'
    if (score >= 65) return 'bg-blue-500'
    if (score >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  function getRiskBadgeVariant(risk: string): 'success' | 'warning' | 'danger' {
    if (risk === 'LOW') return 'success'
    if (risk === 'MEDIUM') return 'warning'
    return 'danger'
  }

  function getStatusBadgeClass(status: string): string {
    if (status === 'active') return 'bg-green-100 text-green-700 border-green-200'
    if (status === 'candidate') return 'bg-blue-100 text-blue-700 border-blue-200'
    if (status === 'paused') return 'bg-gray-100 text-gray-600 border-gray-200'
    return 'bg-red-100 text-red-700 border-red-200'
  }

  function getMarginColor(rate: number): string {
    if (rate >= 25) return 'text-green-600'
    if (rate >= 15) return 'text-blue-600'
    if (rate >= 0) return 'text-yellow-600'
    return 'text-red-600'
  }

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
            <h1 className="text-2xl font-bold text-gray-900">상품 관리</h1>
            <p className="text-gray-500 mt-1">전체 상품 목록 및 상태 관리</p>
          </div>
          <Button onClick={() => alert('TODO: 상품 추가 모달')}>
            <Plus className="w-4 h-4 mr-2" />
            상품 추가
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {statusFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
            <span className={`ml-1.5 text-xs ${statusFilter === f.key ? 'text-blue-100' : 'text-gray-400'}`}>
              ({f.count})
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            상품 목록{' '}
            <span className="text-sm font-normal text-gray-400">
              총 {filtered.length}개
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">상품명</th>
                  <th className="text-left px-4 py-3 font-medium">카테고리</th>
                  <th className="text-center px-4 py-3 font-medium">스나이퍼 스코어</th>
                  <th className="text-right px-4 py-3 font-medium">마진율</th>
                  <th className="text-center px-4 py-3 font-medium">상태</th>
                  <th className="text-center px-4 py-3 font-medium">리스크</th>
                  <th className="text-center px-4 py-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((product) => {
                  const { grade } = getSniperGrade(product.sniperScore)
                  return (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 max-w-xs truncate">
                          {product.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          등급 {grade}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {getCategoryLabel(product.category)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ${getSniperScoreBg(product.sniperScore)}`}
                          >
                            {product.sniperScore}
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${getMarginColor(product.marginRate)}`}>
                        {product.marginRate.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(product.status)}`}
                        >
                          {getStatusLabel(product.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={getRiskBadgeVariant(product.riskLevel)}>
                          {getRiskLevelLabel(product.riskLevel)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link href={`/products/${product.id}`}>
                            <button
                              className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                              title="상세 보기"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </Link>
                          <button
                            onClick={() => alert(`TODO: ${product.name} 수정`)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                            title="수정"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => alert(`TODO: ${product.name} 삭제`)}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      조건에 맞는 상품이 없습니다.
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
