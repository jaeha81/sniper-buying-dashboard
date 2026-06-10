'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowLeft, Save, CheckCircle, XCircle, ToggleLeft, ToggleRight,
  Send, Copy, ExternalLink, Bot,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AutonomyPanel } from '@/components/admin/autonomy-panel'

type Tab = '기본설정' | 'API연동' | '알림설정' | '자율엔진'

interface BasicSettings {
  exchangeRate: string
  targetMarginRate: string
  domesticShippingCost: string
  paymentFeeRate: string
}

interface NotificationSetting {
  key: string
  label: string
  description: string
  enabled: boolean
}

const tabs: Tab[] = ['기본설정', 'API연동', '알림설정', '자율엔진']

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('기본설정')

  const [basicSettings, setBasicSettings] = useState<BasicSettings>({
    exchangeRate: '1350',
    targetMarginRate: '25',
    domesticShippingCost: '3000',
    paymentFeeRate: '2',
  })

  const [savedBasic, setSavedBasic] = useState(false)

  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    { key: 'new-order', label: '신규주문 알림', description: '새 주문이 들어오면 즉시 알림을 받습니다.', enabled: true },
    { key: 'margin-drop', label: '마진율 하락 알림', description: '상품 마진율이 설정값 이하로 떨어지면 알립니다.', enabled: true },
    { key: 'customs-risk', label: '통관 리스크 알림', description: '통관 위험도가 높아진 상품이 감지되면 알립니다.', enabled: false },
    { key: 'price-change', label: '가격 변동 알림', description: '해외 소스 가격이 변동되면 알림을 받습니다.', enabled: false },
  ])

  const [slackTesting, setSlackTesting] = useState(false)
  const [slackResult, setSlackResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const makeWebhookPath = '/api/agent-runs'

  function handleBasicChange(key: keyof BasicSettings, value: string) {
    setBasicSettings((prev) => ({ ...prev, [key]: value }))
    setSavedBasic(false)
  }

  function handleSaveBasic() {
    setSavedBasic(true)
    setTimeout(() => setSavedBasic(false), 2500)
  }

  function toggleNotification(key: string) {
    setNotifications((prev) =>
      prev.map((item) => item.key === key ? { ...item, enabled: !item.enabled } : item)
    )
  }

  async function handleSlackTest() {
    setSlackTesting(true)
    setSlackResult(null)
    try {
      const res = await fetch('/api/notify/test', { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (res.ok) {
        setSlackResult({ ok: true, message: json?.message ?? 'Slack 테스트 메시지가 발송되었습니다.' })
      } else {
        setSlackResult({ ok: false, message: json?.error ?? '알 수 없는 오류가 발생했습니다.' })
      }
    } catch {
      setSlackResult({ ok: false, message: '네트워크 오류가 발생했습니다.' })
    } finally {
      setSlackTesting(false)
    }
  }

  function handleCopyWebhook() {
    navigator.clipboard.writeText(makeWebhookPath).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
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
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
        <p className="text-gray-500 mt-1">시스템 기본값 및 외부 연동 설정</p>
      </div>

      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab === '자율엔진' ? (
              <span className="inline-flex items-center gap-1">
                <Bot className="w-3.5 h-3.5" />
                {tab}
              </span>
            ) : tab}
          </button>
        ))}
      </div>

      {/* ── 기본설정 ── */}
      {activeTab === '기본설정' && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">기본 계산 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {(
              [
                { key: 'exchangeRate', label: '환율 (USD/KRW)', unit: 'KRW' },
                { key: 'targetMarginRate', label: '기본 마진 목표율 (%)', unit: '%' },
                { key: 'domesticShippingCost', label: '국내배송비 기본값 (KRW)', unit: 'KRW' },
                { key: 'paymentFeeRate', label: '결제수수료율 (%)', unit: '%' },
              ] as Array<{ key: keyof BasicSettings; label: string; unit: string }>
            ).map(({ key, label, unit }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
                <div className="relative">
                  <input
                    type="number"
                    step={key === 'paymentFeeRate' ? '0.1' : '1'}
                    value={basicSettings[key]}
                    onChange={(e) => handleBasicChange(key, e.target.value)}
                    className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{unit}</span>
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Button onClick={handleSaveBasic} className="w-full">
                {savedBasic ? (
                  <><CheckCircle className="w-4 h-4 mr-2" />저장되었습니다</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" />저장</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── API연동 ── */}
      {activeTab === 'API연동' && (
        <div className="space-y-6 max-w-2xl">
          {/* Make.com 스케줄 연동 */}
          <Card className="border-orange-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-lg">⚙️</span>
                Make.com 무인 스케줄 연동
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Make.com에서 <b>6시간 간격 Scheduled trigger</b> → <b>HTTP Module (POST)</b>을 연결하면
                에이전트가 완전 무인으로 마진·리스크를 자동 스캔합니다.
              </p>

              <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">엔드포인트 경로</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-white border border-gray-200 rounded px-3 py-1.5 font-mono">
                      POST {makeWebhookPath}
                    </code>
                    <button
                      onClick={handleCopyWebhook}
                      className="shrink-0 p-1.5 rounded hover:bg-gray-200 text-gray-500"
                      title="복사"
                    >
                      {copied
                        ? <CheckCircle className="w-4 h-4 text-green-500" />
                        : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">필수 헤더</p>
                  <code className="block text-sm bg-white border border-gray-200 rounded px-3 py-1.5 font-mono">
                    x-automation-secret: {'<AUTOMATION_WEBHOOK_SECRET>'}
                  </code>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Request Body (JSON)</p>
                  <code className="block text-sm bg-white border border-gray-200 rounded px-3 py-1.5 font-mono">
                    {`{ "triggerType": "scheduled" }`}
                  </code>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1.5">Make.com 설정 순서</p>
                <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                  <li>Scenario 생성 → Trigger: <b>Schedule (every 6 hours)</b></li>
                  <li>HTTP Module → Method: <b>POST</b> / URL: <b>https://your-domain.vercel.app/api/agent-runs</b></li>
                  <li>Headers: <b>x-automation-secret</b> = Vercel의 <code className="bg-blue-100 px-1 rounded">AUTOMATION_WEBHOOK_SECRET</code> 값</li>
                  <li>Body: <code className="bg-blue-100 px-1 rounded">{`{"triggerType":"scheduled"}`}</code></li>
                  <li>Scenario 저장 → <b>Activate</b> 클릭</li>
                </ol>
              </div>

              <div className="flex items-start gap-2 text-xs text-gray-500">
                <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Vercel 환경변수 <code className="bg-gray-100 px-1 rounded">AUTOMATION_WEBHOOK_SECRET</code>이
                  설정되어 있어야 인증이 통과됩니다.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 기타 연동 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { name: 'Supabase', desc: '데이터베이스 연동. 상품·주문·고객 데이터 영구 저장.', connected: true },
              { name: '카카오 알림톡', desc: '주문 확인 및 배송 알림 카카오톡 발송.', connected: false },
              { name: '국제배송추적', desc: '해외 배송 실시간 추적 API 연동.', connected: false },
            ].map((item) => (
              <Card key={item.name}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.connected ? (
                        <><CheckCircle className="w-3.5 h-3.5 text-green-500" /><span className="text-xs text-green-600 font-medium">연결됨</span></>
                      ) : (
                        <><XCircle className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-400">미연결</span></>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── 알림설정 ── */}
      {activeTab === '알림설정' && (
        <div className="space-y-6 max-w-lg">
          {/* Slack 연동 카드 */}
          <Card className="border-green-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-lg">💬</span>
                Slack 알림 연동
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">설정 방법</p>
                <ol className="text-xs text-gray-600 list-decimal list-inside space-y-0.5">
                  <li>Slack → 채널 → Incoming Webhooks 앱 추가</li>
                  <li>Webhook URL 복사</li>
                  <li>Vercel 프로젝트 설정 → Environment Variables</li>
                  <li><code className="bg-gray-100 px-1 rounded">SLACK_WEBHOOK_URL</code> = 복사한 URL 입력</li>
                  <li>Vercel Redeploy</li>
                </ol>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleSlackTest}
                  disabled={slackTesting}
                  className="w-full"
                  variant="outline"
                >
                  {slackTesting ? (
                    <><Send className="w-4 h-4 mr-2 animate-pulse" />발송 중...</>
                  ) : (
                    <><Send className="w-4 h-4 mr-2" />Slack 테스트 메시지 발송</>
                  )}
                </Button>

                {slackResult && (
                  <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                    slackResult.ok
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {slackResult.ok
                      ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span>{slackResult.message}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400">
                에이전트 스캔 완료, 긴급 발견(critical), 자율 실행 결과, 킬스위치 변경 시 자동 발송됩니다.
              </p>
            </CardContent>
          </Card>

          {/* 알림 종류 토글 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">알림 수신 설정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 divide-y divide-gray-100">
              {notifications.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                  </div>
                  <button
                    onClick={() => toggleNotification(item.key)}
                    className="shrink-0 mt-0.5"
                    aria-label={item.enabled ? '알림 끄기' : '알림 켜기'}
                  >
                    {item.enabled
                      ? <ToggleRight className="w-8 h-8 text-blue-600" />
                      : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 자율엔진 ── */}
      {activeTab === '자율엔진' && (
        <div className="max-w-3xl">
          <p className="text-sm text-gray-500 mb-4">
            에이전트 자율 운영 레벨과 가드레일을 설정합니다.
            변경 사항은 즉시 Supabase에 저장되며 다음 스캔부터 반영됩니다.
          </p>

          <AutonomyPanel />

          <Card className="mt-4 border-purple-200 bg-purple-50/30">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm font-semibold text-purple-800 mb-3">🚀 완전자율(autopilot) 전환 체크리스트</p>
              <ul className="text-xs text-purple-700 space-y-2 list-none">
                {[
                  { label: 'Slack 알림 연동', sub: '알림설정 탭에서 테스트 메시지 발송 성공', done: false },
                  { label: 'Make.com 6시간 스케줄 활성화', sub: 'API연동 탭의 설정 순서 완료 후 Scenario Activate', done: false },
                  { label: '가드레일 값 검토', sub: '마진 방어선 10%, 가격 변동 한도 ±10%, 일일 실행 한도 30', done: true },
                  { label: 'autopilot 레벨 선택', sub: '위 자율 운영 엔진 패널에서 완전자율 버튼 클릭', done: false },
                ].map((item) => (
                  <li key={item.label} className="flex items-start gap-2">
                    <span className={`shrink-0 ${item.done ? 'text-green-600' : 'text-gray-400'}`}>
                      {item.done ? '✅' : '⬜'}
                    </span>
                    <span>
                      <b>{item.label}</b>
                      <span className="text-purple-500"> — {item.sub}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
