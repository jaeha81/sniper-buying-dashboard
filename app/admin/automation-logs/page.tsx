'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, CheckCircle, XCircle, Clock, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type LogStatus = 'success' | 'error' | 'running'

interface AutomationLog {
  id: string
  timestamp: string
  scenario: string
  status: LogStatus
  message: string
  duration: number
}

const sampleLogs: AutomationLog[] = [
  {
    id: 'log-001',
    timestamp: '2024-05-22T08:00:00Z',
    scenario: '상품 가격 모니터링',
    status: 'success',
    message: '10개 상품 가격 업데이트 완료. 변동 감지: 2건.',
    duration: 3420,
  },
  {
    id: 'log-002',
    timestamp: '2024-05-22T08:05:00Z',
    scenario: '마진 계산 자동화',
    status: 'success',
    message: '전체 상품 마진율 재계산 완료. 환율 적용: 1,350원/USD.',
    duration: 1280,
  },
  {
    id: 'log-003',
    timestamp: '2024-05-22T09:00:00Z',
    scenario: '주문 알림',
    status: 'success',
    message: '신규 주문 3건 카카오 알림톡 발송 완료.',
    duration: 870,
  },
  {
    id: 'log-004',
    timestamp: '2024-05-22T10:00:00Z',
    scenario: '통관 리스크 체크',
    status: 'error',
    message: 'API 응답 오류: 관세청 OpenAPI 연결 실패 (timeout).',
    duration: 15000,
  },
  {
    id: 'log-005',
    timestamp: '2024-05-22T11:00:00Z',
    scenario: '상품 가격 모니터링',
    status: 'success',
    message: '10개 상품 가격 업데이트 완료. 변동 없음.',
    duration: 3100,
  },
  {
    id: 'log-006',
    timestamp: '2024-05-22T12:00:00Z',
    scenario: '재고 동기화',
    status: 'error',
    message: '소스 사이트 503 오류. 재시도 예약됨 (15분 후).',
    duration: 8200,
  },
  {
    id: 'log-007',
    timestamp: '2024-05-22T13:00:00Z',
    scenario: '일간 마진 리포트',
    status: 'success',
    message: '일간 마진 리포트 생성 및 이메일 발송 완료.',
    duration: 2450,
  },
  {
    id: 'log-008',
    timestamp: '2024-05-22T14:00:00Z',
    scenario: '상품 가격 모니터링',
    status: 'running',
    message: '가격 데이터 수집 중... (6/10 완료)',
    duration: 0,
  },
]

const statusTabs = [
  { key: 'all', label: '전체' },
  { key: 'success', label: '성공' },
  { key: 'error', label: '오류' },
  { key: 'running', label: '실행중' },
]

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(ms: number): string {
  if (ms === 0) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function StatusIcon({ status }: { status: LogStatus }) {
  if (status === 'success')
    return <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
  if (status === 'error')
    return <XCircle className="w-5 h-5 text-red-500 shrink-0" />
  return <Clock className="w-5 h-5 text-yellow-500 shrink-0 animate-pulse" />
}

function getStatusLabel(status: LogStatus): string {
  if (status === 'success') return '성공'
  if (status === 'error') return '오류'
  return '실행중'
}

function getStatusBadgeClass(status: LogStatus): string {
  if (status === 'success') return 'bg-green-100 text-green-700'
  if (status === 'error') return 'bg-red-100 text-red-700'
  return 'bg-yellow-100 text-yellow-700'
}

export default function AutomationLogsPage() {
  const [activeTab, setActiveTab] = useState<string>('all')

  const filtered =
    activeTab === 'all' ? sampleLogs : sampleLogs.filter((l) => l.status === activeTab)

  const successCount = sampleLogs.filter((l) => l.status === 'success').length
  const totalFinished = sampleLogs.filter((l) => l.status !== 'running').length
  const successRate = totalFinished > 0 ? Math.round((successCount / totalFinished) * 100) : 0

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
        <h1 className="text-2xl font-bold text-gray-900">자동화 로그</h1>
        <p className="text-gray-500 mt-1">Make.com 자동화 시나리오 실행 이력</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">성공률</p>
                <p className="text-3xl font-bold text-green-600">{successRate}%</p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500 mb-1">성공</p>
            <p className="text-3xl font-bold text-gray-900">{successCount}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500 mb-1">오류</p>
            <p className="text-3xl font-bold text-red-500">
              {sampleLogs.filter((l) => l.status === 'error').length}건
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {statusTabs.map((tab) => {
          const count =
            tab.key === 'all'
              ? sampleLogs.length
              : sampleLogs.filter((l) => l.status === tab.key).length
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

      <div className="space-y-3">
        {filtered.map((log) => (
          <Card key={log.id}>
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <StatusIcon status={log.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-gray-900 text-sm">{log.scenario}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(log.status)}`}
                    >
                      {getStatusLabel(log.status)}
                    </span>
                    {log.duration > 0 && (
                      <span className="text-xs text-gray-400">
                        {formatDuration(log.duration)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{log.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatTimestamp(log.timestamp)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-gray-400">
              해당 상태의 로그가 없습니다.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
