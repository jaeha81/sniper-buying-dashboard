'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, CheckCircle, XCircle, Clock, Activity, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

type LogStatus = 'success' | 'failed' | 'running' | 'partial'

interface AutomationLog {
  id: string
  scenario_name: string
  trigger_type: string | null
  status: LogStatus
  ops_consumed: number
  records_processed: number
  error_message: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
}

const STATUS_TABS = [
  { key: 'all', label: '전체' },
  { key: 'success', label: '성공' },
  { key: 'failed', label: '오류' },
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

function formatDuration(ms: number | null): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function StatusIcon({ status }: { status: LogStatus }) {
  if (status === 'success')
    return <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
  if (status === 'failed')
    return <XCircle className="w-5 h-5 text-red-500 shrink-0" />
  if (status === 'partial')
    return <XCircle className="w-5 h-5 text-yellow-500 shrink-0" />
  return <Clock className="w-5 h-5 text-yellow-500 shrink-0 animate-pulse" />
}

function getStatusLabel(status: LogStatus): string {
  if (status === 'success') return '성공'
  if (status === 'failed') return '오류'
  if (status === 'partial') return '부분 성공'
  return '실행중'
}

function getStatusBadgeClass(status: LogStatus): string {
  if (status === 'success') return 'bg-green-100 text-green-700'
  if (status === 'failed') return 'bg-red-100 text-red-700'
  if (status === 'partial') return 'bg-yellow-100 text-yellow-700'
  return 'bg-blue-100 text-blue-700'
}

export default function AutomationLogsPage() {
  const [logs, setLogs] = useState<AutomationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/automation-logs')
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs ?? [])
      } else if (res.status === 401) {
        setFetchError('인증이 필요합니다. 다시 로그인해주세요.')
      } else {
        setFetchError(`로그를 불러오지 못했습니다. (HTTP ${res.status})`)
      }
    } catch {
      setFetchError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const filtered =
    activeTab === 'all' ? logs : logs.filter((l) => l.status === activeTab)

  const successCount = logs.filter((l) => l.status === 'success').length
  const failedCount = logs.filter((l) => l.status === 'failed').length
  const totalFinished = logs.filter((l) => l.status !== 'running').length
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">자동화 로그</h1>
            <p className="text-gray-500 mt-1">Make.com 자동화 시나리오 실행 이력</p>
          </div>
          <button
            onClick={fetchLogs}
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">성공률</p>
                <p className="text-3xl font-bold text-green-600">
                  {loading ? '—' : `${successRate}%`}
                </p>
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
            <p className="text-3xl font-bold text-gray-900">{loading ? '—' : `${successCount}건`}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500 mb-1">오류</p>
            <p className="text-3xl font-bold text-red-500">{loading ? '—' : `${failedCount}건`}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.key === 'all'
              ? logs.length
              : logs.filter((l) => l.status === tab.key).length
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

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-gray-200 rounded-full animate-pulse shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-48" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-72" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((log) => (
            <Card key={log.id}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <StatusIcon status={log.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-gray-900 text-sm">{log.scenario_name}</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(log.status)}`}
                      >
                        {getStatusLabel(log.status)}
                      </span>
                      {log.duration_ms !== null && (
                        <span className="text-xs text-gray-400">{formatDuration(log.duration_ms)}</span>
                      )}
                      {log.ops_consumed > 0 && (
                        <span className="text-xs text-gray-400">{log.ops_consumed} ops</span>
                      )}
                    </div>
                    {log.error_message && (
                      <p className="text-sm text-red-600">{log.error_message}</p>
                    )}
                    {log.records_processed > 0 && (
                      <p className="text-sm text-gray-600">{log.records_processed}건 처리</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{formatTimestamp(log.started_at)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && !fetchError && (
            <Card>
              <CardContent className="py-12 text-center text-gray-400">
                {logs.length === 0
                  ? 'Make.com 자동화 시나리오가 아직 실행되지 않았습니다.'
                  : '해당 상태의 로그가 없습니다.'}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
