'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bot, OctagonX, Play, ShieldCheck, History } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AUTONOMY_LEVELS,
  AUTONOMY_LEVEL_LABELS,
  AUTONOMY_LEVEL_DESCRIPTIONS,
  type AutonomyLevel,
  type AutonomyPolicy,
} from '@/lib/autonomy'

interface RecentAutoAction {
  id: string
  title: string
  action_type: string
  status: string
  decision_reason: string | null
  executed_at: string | null
}

interface AutonomyData {
  policy: AutonomyPolicy
  source: 'supabase' | 'default_manual'
  autoActionsLast24h: number
  recentAutoActions: RecentAutoAction[]
}

const LEVEL_COLORS: Record<AutonomyLevel, string> = {
  manual: 'bg-gray-100 text-gray-700 border-gray-300',
  assisted: 'bg-blue-50 text-blue-700 border-blue-300',
  autopilot: 'bg-purple-50 text-purple-700 border-purple-300',
}

function formatTime(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function AutonomyPanel() {
  const [data, setData] = useState<AutonomyData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showGuardrails, setShowGuardrails] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [guardrails, setGuardrails] = useState({
    maxDailyAutoActions: '30',
    maxPriceChangePct: '10',
    minApproveSniperScore: '80',
  })

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/autonomy')
      if (!res.ok) {
        setError(`자율 설정을 불러오지 못했습니다. (HTTP ${res.status})`)
        return
      }
      const json: AutonomyData = await res.json()
      setData(json)
      setGuardrails({
        maxDailyAutoActions: String(json.policy.maxDailyAutoActions),
        maxPriceChangePct: String(json.policy.maxPriceChangePct),
        minApproveSniperScore: String(json.policy.minApproveSniperScore),
      })
      setError(null)
    } catch {
      setError('자율 설정 로드 중 네트워크 오류가 발생했습니다.')
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const updatePolicy = useCallback(async (updates: Record<string, unknown>) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/autonomy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? `설정 저장에 실패했습니다. (HTTP ${res.status})`)
        return
      }
      await fetchData()
    } catch {
      setError('설정 저장 중 네트워크 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }, [fetchData])

  if (!data) {
    return (
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="h-5 bg-gray-100 rounded animate-pulse w-64" />
        </CardContent>
      </Card>
    )
  }

  const { policy } = data
  const killed = policy.killSwitch

  return (
    <Card className={`mb-6 ${killed ? 'border-red-300 bg-red-50/40' : policy.autonomyLevel === 'autopilot' ? 'border-purple-200' : ''}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Bot className={`w-5 h-5 ${killed ? 'text-red-500' : 'text-purple-600'}`} />
            <span className="font-semibold text-sm text-gray-900">자율 운영 엔진</span>
            {data.source === 'default_manual' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                마이그레이션 필요 (수동 폴백)
              </span>
            )}
            {killed && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-semibold">
                킬스위치 작동중
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>
              최근 24시간 자율 실행 <b className="text-gray-800">{data.autoActionsLast24h}</b> / {policy.maxDailyAutoActions}건
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => updatePolicy({ killSwitch: !killed })}
              className={`h-7 px-2.5 text-xs ${killed
                ? 'border-green-300 text-green-700 hover:bg-green-50'
                : 'border-red-300 text-red-600 hover:bg-red-50'}`}
            >
              {killed ? <Play className="w-3 h-3 mr-1" /> : <OctagonX className="w-3 h-3 mr-1" />}
              {killed ? '자율 실행 재개' : '긴급 정지'}
            </Button>
          </div>
        </div>

        {/* 자율 레벨 선택 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          {AUTONOMY_LEVELS.map((level) => {
            const active = policy.autonomyLevel === level
            return (
              <button
                key={level}
                disabled={saving || killed}
                onClick={() => updatePolicy({ autonomyLevel: level })}
                className={`rounded-lg border px-3 py-2 text-left transition-all disabled:opacity-50 ${
                  active ? LEVEL_COLORS[level] : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-semibold mb-0.5 ${active ? '' : 'text-gray-700'}`}>
                  {AUTONOMY_LEVEL_LABELS[level]}
                  {active && ' ✓'}
                </p>
                <p className="text-xs text-gray-500 leading-snug">{AUTONOMY_LEVEL_DESCRIPTIONS[level]}</p>
              </button>
            )
          })}
        </div>

        {error && (
          <p className="text-xs text-red-600 mb-2">{error}</p>
        )}

        <div className="flex gap-3 text-xs">
          <button
            onClick={() => setShowGuardrails((v) => !v)}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            가드레일 {showGuardrails ? '닫기' : '설정'}
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800"
          >
            <History className="w-3.5 h-3.5" />
            자율 실행 이력 {showHistory ? '닫기' : `(${data.recentAutoActions.length})`}
          </button>
        </div>

        {showGuardrails && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs text-gray-500">일일 자율 실행 한도</Label>
              <Input
                type="number"
                value={guardrails.maxDailyAutoActions}
                onChange={(e) => setGuardrails((g) => ({ ...g, maxDailyAutoActions: e.target.value }))}
                className="h-8 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">가격 변동 한도 (±%)</Label>
              <Input
                type="number"
                value={guardrails.maxPriceChangePct}
                onChange={(e) => setGuardrails((g) => ({ ...g, maxPriceChangePct: e.target.value }))}
                className="h-8 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">자동 승인 최소 스코어</Label>
              <Input
                type="number"
                value={guardrails.minApproveSniperScore}
                onChange={(e) => setGuardrails((g) => ({ ...g, minApproveSniperScore: e.target.value }))}
                className="h-8 text-sm mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={policy.allowCustomerNotice}
                  disabled={saving}
                  onChange={(e) => updatePolicy({ allowCustomerNotice: e.target.checked })}
                />
                고객 알림 자동 발송
              </label>
              <Button
                size="sm"
                disabled={saving}
                onClick={() => updatePolicy({
                  maxDailyAutoActions: Number(guardrails.maxDailyAutoActions),
                  maxPriceChangePct: Number(guardrails.maxPriceChangePct),
                  minApproveSniperScore: Number(guardrails.minApproveSniperScore),
                })}
                className="h-8 px-3 text-xs"
              >
                저장
              </Button>
            </div>
          </div>
        )}

        {showHistory && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
            {data.recentAutoActions.length === 0 ? (
              <p className="text-xs text-gray-400">아직 자율 실행 이력이 없습니다.</p>
            ) : (
              data.recentAutoActions.map((action) => (
                <div key={action.id} className="flex items-center gap-2 text-xs">
                  <span className={action.status === 'completed' ? 'text-green-600' : 'text-red-500'}>
                    {action.status === 'completed' ? '✅' : '❌'}
                  </span>
                  <span className="text-gray-800 font-medium truncate">{action.title}</span>
                  {action.decision_reason && (
                    <span className="text-gray-400 truncate hidden sm:inline">— {action.decision_reason}</span>
                  )}
                  <span className="text-gray-400 ml-auto shrink-0">{formatTime(action.executed_at)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
