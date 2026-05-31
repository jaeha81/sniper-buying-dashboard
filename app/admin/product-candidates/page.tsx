'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, XCircle, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { sampleProducts } from '@/data/sample-products'
import { getRiskLevelLabel, formatKRW } from '@/lib/utils'
import { getSniperGrade } from '@/lib/calculator'
import type { Product } from '@/lib/types'

function getBarColor(value: number, max: number): string {
  const ratio = value / max
  if (ratio >= 0.75) return 'bg-green-500'
  if (ratio >= 0.5) return 'bg-blue-500'
  if (ratio >= 0.25) return 'bg-yellow-500'
  return 'bg-red-500'
}

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

export default function ProductCandidatesPage() {
  const [actionLog, setActionLog] = useState<Record<string, 'approved' | 'rejected'>>({})

  // candidate 상품만 스나이퍼 스코어 내림차순 정렬
  const candidates = [...sampleProducts]
    .filter((p) => p.status === 'candidate')
    .sort((a, b) => b.sniperScore - a.sniperScore)

  const avgScore =
    candidates.length > 0
      ? Math.round(candidates.reduce((sum, p) => sum + p.sniperScore, 0) / candidates.length)
      : 0

  const handleApprove = async (id: string, name: string) => {
    try {
      await fetch('/api/agent-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType: 'product_discovery',
          actionType: 'approve_product',
          title: `상품 승인 요청: ${name}`,
          recommendation: '후보 검토 화면에서 관리자가 승인 요청을 생성했습니다.',
          targetType: 'product',
          targetId: id,
          priority: 'high',
        }),
      })
    } catch {
      // 작업 생성 실패 시에도 로컬 상태는 갱신
    }
    setActionLog((prev) => ({ ...prev, [id]: 'approved' }))
  }

  const handleReject = async (id: string, name: string) => {
    try {
      await fetch('/api/agent-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType: 'product_discovery',
          actionType: 'review_candidate',
          title: `후보 거절: ${name}`,
          recommendation: '후보 검토 화면에서 관리자가 거절 처리했습니다.',
          targetType: 'product',
          targetId: id,
          priority: 'low',
        }),
      })
    } catch {
      // 작업 생성 실패 시에도 로컬 상태는 갱신
    }
    setActionLog((prev) => ({ ...prev, [id]: 'rejected' }))
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          대시보드
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">상품 후보 검토</h1>
        <p className="text-gray-500 mt-1">
          스나이퍼 스코어 기준으로 정렬된 후보 상품을 검토하고 승인 또는 거절합니다
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">검토 대기</p>
                <p className="text-3xl font-bold text-gray-900">{candidates.length}개</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500 mb-1">평균 스나이퍼 스코어</p>
            <p className="text-3xl font-bold text-blue-600">{avgScore}점</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500 mb-1">이번 세션 처리</p>
            <p className="text-3xl font-bold text-gray-900">
              {Object.keys(actionLog).length}건
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              승인 {Object.values(actionLog).filter((v) => v === 'approved').length} /
              거절 {Object.values(actionLog).filter((v) => v === 'rejected').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 후보 상품 목록 */}
      {candidates.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-gray-400 py-12">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            검토중인 상품이 없습니다.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {candidates.map((product, idx) => {
          const { grade, label, color } = getSniperGrade(product.sniperScore)
          const action = actionLog[product.id]
          return (
            <Card
              key={product.id}
              className={`transition-all ${
                action === 'approved'
                  ? 'border-green-200 bg-green-50/30'
                  : action === 'rejected'
                  ? 'border-red-200 bg-red-50/30 opacity-60'
                  : ''
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* 순위 */}
                    <div className="w-6 text-center text-sm font-bold text-gray-300">
                      #{idx + 1}
                    </div>
                    {/* 스코어 원 */}
                    <div
                      className={`w-12 h-12 rounded-full flex flex-col items-center justify-center text-white shrink-0 ${getSniperScoreBg(product.sniperScore)}`}
                    >
                      <span className="text-xs font-medium">{grade}</span>
                      <span className="text-sm font-bold leading-none">{product.sniperScore}</span>
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{product.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-sm font-medium ${color}`}>{label}</span>
                        <span className="text-gray-300">•</span>
                        <Badge variant={getRiskBadgeVariant(product.riskLevel)}>
                          리스크 {getRiskLevelLabel(product.riskLevel)}
                        </Badge>
                        <span className="text-gray-300">•</span>
                        <span
                          className={`text-sm font-medium ${
                            product.marginRate >= 25
                              ? 'text-green-600'
                              : product.marginRate >= 15
                              ? 'text-blue-600'
                              : 'text-red-600'
                          }`}
                        >
                          마진 {product.marginRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 승인/거절 버튼 */}
                  {action ? (
                    <div
                      className={`text-sm font-medium px-3 py-1.5 rounded-full shrink-0 ${
                        action === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {action === 'approved' ? '승인됨' : '거절됨'}
                    </div>
                  ) : (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(product.id, product.name)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(product.id, product.name)}
                        className="border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        거절
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                {/* 점수 구성 요소 바 차트 */}
                <div className="space-y-2.5">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>수요점수</span>
                      <span>{product.demandScore} / 5</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getBarColor(product.demandScore, 5)}`}
                        style={{ width: `${(product.demandScore / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>경쟁강도</span>
                      <span>
                        {product.competitionLevel === 'low'
                          ? '낮음'
                          : product.competitionLevel === 'medium'
                          ? '보통'
                          : '높음'}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          product.competitionLevel === 'low'
                            ? 'bg-green-500'
                            : product.competitionLevel === 'medium'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{
                          width:
                            product.competitionLevel === 'low'
                              ? '33%'
                              : product.competitionLevel === 'medium'
                              ? '66%'
                              : '100%',
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>마진율</span>
                      <span>{product.marginRate.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getBarColor(Math.max(0, product.marginRate), 40)}`}
                        style={{ width: `${Math.min(100, Math.max(0, (product.marginRate / 40) * 100))}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>배송안정성</span>
                      <span>{product.shippingStabilityScore} / 5</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getBarColor(product.shippingStabilityScore, 5)}`}
                        style={{ width: `${(product.shippingStabilityScore / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>통관리스크</span>
                      <span>{getRiskLevelLabel(product.riskLevel)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          product.riskLevel === 'LOW'
                            ? 'bg-green-500'
                            : product.riskLevel === 'MEDIUM'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{
                          width:
                            product.riskLevel === 'LOW'
                              ? '33%'
                              : product.riskLevel === 'MEDIUM'
                              ? '66%'
                              : '100%',
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                  <span>예상 판매가 {formatKRW(product.domesticExpectedPrice)}</span>
                  <Link href={`/products/${product.id}`} className="text-blue-500 hover:underline">
                    상세 보기 →
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
