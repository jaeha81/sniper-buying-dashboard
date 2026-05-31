'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  ChevronRight,
  Zap,
  TrendingDown,
  PackageX,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AGENT_TYPE_LABELS, AGENT_TYPE_DESCRIPTIONS } from '@/lib/agents'
import type { AgentType, AgentTask, AgentFinding, AgentTaskStatus } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentSummary {
  agentType: AgentType
  label: string
  pendingTasks: number
  criticalFindings: number
  failedRuns: number
}

interface FailedLog {
  id: string
  scenario_name: string
  trigger_type: string | null
  status: string
  error_message: string | null
  started_at: string
}

interface LowMarginProduct {
  id: string
  name: string
  margin_rate: number
  sniper_score: number
  status: string
}

interface DelayedOrder {
  id: string
  order_ref: string | null
  product_name: string
  status: string
  total_price: number
  created_at: string
}

interface CommandData {
  agents: AgentSummary[]
  pendingTasks: AgentTask[]
  criticalFindings: AgentFinding[]
  failedAutomationLogs: FailedLog[]
  lowMarginProducts: LowMarginProduct[]
  delayedOrders: DelayedOrder[]
  source: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<AgentType, string> = {
  product_discovery: '🔍',
  margin_pricing: '💹',
  order_ops: '📦',
  compliance_risk: '🛡️',
  command_center: '🎯',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  review_candidate: '후보 검토',
  approve_product: '상품 승인',
  update_price: '가격 변경',
  pause_product: '상품 일시중지',
  update_order_status: '주문 상태 변경',
  send_customer_notice: '고객 알림 발송',
  inspect_risk: '리스크 점검',
  review_automation_failure: '자동화 실패 검토',
}

function formatKRW(amount: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount)
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentSummary }) {
  const hasIssues = agent.pendingTasks > 0 || agent.criticalFindings > 0 || agent.failedRuns > 0
  return (
    <Card className={`transition-all ${hasIssues ? 'border-orange-200' : 'border-green-100'}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl shrink-0">{AGENT_ICONS[agent.agentType]}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm text-gray-900">{agent.label}</span>
              {hasIssues ? (
                <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              ) : (
                <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
              )}
            </div>
            <p className="text-xs text-gray-400 leading-snug mb-2 line-clamp-2">
              {AGENT_TYPE_DESCRIPTIONS[agent.agentType]}
            </p>
            <div className="flex gap-3 text-xs">
              <span className={`${agent.pendingTasks > 0 ? 'text-orange-600 font-semibold' : 'text-gray-400'}`}>
                대기 {agent.pendingTasks}
              </span>
              <span className={`${agent.criticalFindings > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                위험 {agent.criticalFindings}
              </span>
              <span className={`${agent.failedRuns > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                실패 {agent.failedRuns}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TaskActionButtons({
  task,
  onAction,
  acting,
}: {
  task: AgentTask
  onAction: (id: string, action: 'approve' | 'reject' | 'cancel', note?: string) => Promise<void>
  acting: boolean
}) {
  if (task.status !== 'pending') {
    const statusMap: Record<AgentTaskStatus, { label: string; cls: string }> = {
      approved: { label: '승인됨', cls: 'text-green-700 bg-green-50' },
      rejected: { label: '거절됨', cls: 'text-red-700 bg-red-50' },
      running: { label: '실행중', cls: 'text-blue-700 bg-blue-50' },
      completed: { label: '완료', cls: 'text-gray-700 bg-gray-50' },
      failed: { label: '실패', cls: 'text-red-700 bg-red-50' },
      cancelled: { label: '취소됨', cls: 'text-gray-500 bg-gray-50' },
      pending: { label: '대기중', cls: 'text-orange-700 bg-orange-50' },
    }
    const s = statusMap[task.status]
    return (
      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>
    )
  }

  return (
    <div className="flex gap-1.5 shrink-0">
      <Button
        size="sm"
        disabled={acting}
        onClick={() => onAction(task.id, 'approve')}
        className="h-7 px-2.5 text-xs bg-green-600 hover:bg-green-700 text-white"
      >
        <CheckCircle className="w-3 h-3 mr-1" />
        승인
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={acting}
        onClick={() => onAction(task.id, 'reject')}
        className="h-7 px-2.5 text-xs border-red-200 text-red-600 hover:bg-red-50"
      >
        <XCircle className="w-3 h-3 mr-1" />
        거절
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={acting}
        onClick={() => onAction(task.id, 'cancel')}
        className="h-7 px-2.5 text-xs text-gray-500 hover:bg-gray-50"
      >
        보류
      </Button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentCommandPage() {
  const [data, setData] = useState<CommandData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingIds, setActingIds] = useState<Set<string>>(new Set())
  const [activeSection, setActiveSection] = useState<'tasks' | 'findings' | 'logs' | 'margins' | 'orders'>('tasks')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/agent-command')
      if (res.status === 401) {
        setError('인증이 필요합니다. 다시 로그인해주세요.')
        return
      }
      if (!res.ok) {
        setError(`데이터를 불러오지 못했습니다. (HTTP ${res.status})`)
        return
      }
      const json: CommandData = await res.json()
      setData(json)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleTaskAction = useCallback(async (
    id: string,
    action: 'approve' | 'reject' | 'cancel',
    note?: string
  ) => {
    setActingIds((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/agent-tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewerNote: note }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData((prev) => {
        if (!prev) return prev
        const newStatus: AgentTaskStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'
        return {
          ...prev,
          pendingTasks: prev.pendingTasks.map((t) =>
            t.id === id ? { ...t, status: newStatus } : t
          ),
        }
      })
    } catch {
      // silently keep button enabled
    } finally {
      setActingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }, [])

  const totalPending = data?.pendingTasks.filter((t) => t.status === 'pending').length ?? 0
  const totalCritical = data?.criticalFindings.length ?? 0
  const totalFailed = data?.failedAutomationLogs.length ?? 0

  const SECTIONS = [
    { key: 'tasks' as const, label: '승인 대기', count: totalPending },
    { key: 'findings' as const, label: '위험 발견', count: totalCritical },
    { key: 'logs' as const, label: '실패 자동화', count: totalFailed },
    { key: 'margins' as const, label: '저마진 상품', count: data?.lowMarginProducts.length ?? 0 },
    { key: 'orders' as const, label: '지연 주문', count: data?.delayedOrders.length ?? 0 },
  ]

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🎯 에이전트 운영 지휘
          </h1>
          <p className="text-gray-500 mt-1 text-sm">오늘의 에이전트 현황과 우선순위 작업을 관리합니다</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Agent Status Cards */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-4">
                <div className="space-y-2">
                  <div className="h-6 w-6 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-20" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {(data?.agents ?? []).map((agent) => (
            <AgentCard key={agent.agentType} agent={agent} />
          ))}
        </div>
      )}

      {/* Summary Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {SECTIONS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`rounded-xl border px-3 py-2 text-left transition-all ${
              activeSection === key
                ? 'bg-blue-50 border-blue-200'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-xs text-gray-500 mb-0.5">{label}</p>
            <p className={`text-xl font-bold ${count > 0 ? 'text-red-600' : 'text-gray-400'}`}>{loading ? '—' : count}</p>
          </button>
        ))}
      </div>

      {/* Content Sections */}
      {!loading && data && (
        <>
          {/* 승인 대기 작업 */}
          {activeSection === 'tasks' && (
            <div className="space-y-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-500" />
                승인 대기 작업
                <span className="text-xs text-gray-400 font-normal">({data.pendingTasks.length}건)</span>
              </h2>
              {data.pendingTasks.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-gray-400">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    승인 대기 작업이 없습니다.
                  </CardContent>
                </Card>
              ) : (
                data.pendingTasks.map((task) => (
                  <Card key={task.id} className={task.priority === 'critical' ? 'border-red-200' : ''}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 mt-0.5 text-lg">{AGENT_ICONS[task.agentType]}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-medium text-sm text-gray-900">{task.title}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[task.priority]}`}>
                              {PRIORITY_LABELS[task.priority]}
                            </span>
                            <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                              {ACTION_TYPE_LABELS[task.actionType] ?? task.actionType}
                            </span>
                          </div>
                          {task.recommendation && (
                            <p className="text-xs text-gray-500 mb-1 line-clamp-2">{task.recommendation}</p>
                          )}
                          <p className="text-xs text-gray-400">
                            {AGENT_TYPE_LABELS[task.agentType]} · {formatTime(task.createdAt)}
                          </p>
                        </div>
                        <TaskActionButtons
                          task={task}
                          onAction={handleTaskAction}
                          acting={actingIds.has(task.id)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* 위험 발견 */}
          {activeSection === 'findings' && (
            <div className="space-y-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                위험 발견
                <span className="text-xs text-gray-400 font-normal">({data.criticalFindings.length}건)</span>
              </h2>
              {data.criticalFindings.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-gray-400">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    위험 발견 사항이 없습니다.
                  </CardContent>
                </Card>
              ) : (
                data.criticalFindings.map((finding) => (
                  <Card key={finding.id} className="border-red-100">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm text-gray-900">{finding.title}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
                              위험
                            </span>
                          </div>
                          {finding.summary && (
                            <p className="text-xs text-gray-500 mb-1">{finding.summary}</p>
                          )}
                          <p className="text-xs text-gray-400">
                            {AGENT_TYPE_LABELS[finding.agentType as AgentType]} · {formatTime(finding.createdAt)}
                          </p>
                        </div>
                        {finding.confidence != null && (
                          <span className="text-xs text-gray-400 shrink-0">
                            신뢰도 {Math.round(finding.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* 실패 자동화 */}
          {activeSection === 'logs' && (
            <div className="space-y-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                실패 자동화 로그
                <span className="text-xs text-gray-400 font-normal">({data.failedAutomationLogs.length}건)</span>
              </h2>
              {data.failedAutomationLogs.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-gray-400">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    실패한 자동화가 없습니다.
                  </CardContent>
                </Card>
              ) : (
                data.failedAutomationLogs.map((log) => (
                  <Card key={log.id} className="border-yellow-100">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-gray-900">{log.scenario_name}</span>
                          {log.error_message && (
                            <p className="text-xs text-red-500 mt-0.5">{log.error_message}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">{formatTime(log.started_at)}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* 저마진 상품 */}
          {activeSection === 'margins' && (
            <div className="space-y-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-orange-500" />
                마진 15% 미만 활성 상품
                <span className="text-xs text-gray-400 font-normal">({data.lowMarginProducts.length}건)</span>
              </h2>
              {data.lowMarginProducts.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-gray-400">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    저마진 상품이 없습니다.
                  </CardContent>
                </Card>
              ) : (
                data.lowMarginProducts.map((p) => (
                  <Card key={p.id} className="border-orange-100">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <TrendingDown className="w-4 h-4 text-orange-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-gray-900">{p.name}</span>
                        </div>
                        <span className={`text-sm font-bold ${p.margin_rate < 0 ? 'text-red-600' : 'text-orange-600'}`}>
                          {p.margin_rate?.toFixed(1)}%
                        </span>
                        <span className="text-xs text-gray-400">스코어 {p.sniper_score}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* 지연 주문 */}
          {activeSection === 'orders' && (
            <div className="space-y-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <PackageX className="w-4 h-4 text-blue-500" />
                24시간 이상 미처리 주문
                <span className="text-xs text-gray-400 font-normal">({data.delayedOrders.length}건)</span>
              </h2>
              {data.delayedOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-gray-400">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    지연 주문이 없습니다.
                  </CardContent>
                </Card>
              ) : (
                data.delayedOrders.map((order) => (
                  <Card key={order.id} className="border-blue-100">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <PackageX className="w-4 h-4 text-blue-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-gray-900">{order.product_name}</span>
                          {order.order_ref && (
                            <span className="text-xs text-gray-400 ml-2">{order.order_ref}</span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-700">{formatKRW(order.total_price)}</span>
                        <span className="text-xs text-gray-400">{formatTime(order.created_at)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </>
      )}

      {loading && !data && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-gray-200 rounded-full animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-48" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-72" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
