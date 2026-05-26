'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Save, CheckCircle, XCircle, ToggleLeft, ToggleRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Tab = '기본설정' | 'API연동' | '알림설정'

interface BasicSettings {
  exchangeRate: string
  targetMarginRate: string
  domesticShippingCost: string
  paymentFeeRate: string
}

interface ApiIntegration {
  name: string
  description: string
  connected: boolean
}

interface NotificationSetting {
  key: string
  label: string
  description: string
  enabled: boolean
}

const tabs: Tab[] = ['기본설정', 'API연동', '알림설정']

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('기본설정')

  const [basicSettings, setBasicSettings] = useState<BasicSettings>({
    exchangeRate: '1350',
    targetMarginRate: '25',
    domesticShippingCost: '3000',
    paymentFeeRate: '2',
  })

  const [savedBasic, setSavedBasic] = useState(false)

  const [integrations, setIntegrations] = useState<ApiIntegration[]>([
    {
      name: 'Supabase',
      description: '데이터베이스 연동. 상품·주문·고객 데이터 영구 저장.',
      connected: false,
    },
    {
      name: 'Make.com',
      description: '자동화 시나리오 연동. 가격 모니터링·알림 발송.',
      connected: false,
    },
    {
      name: '카카오 알림톡',
      description: '주문 확인 및 배송 알림 카카오톡 발송.',
      connected: false,
    },
    {
      name: '국제배송추적',
      description: '해외 배송 실시간 추적 API 연동.',
      connected: false,
    },
  ])

  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    {
      key: 'new-order',
      label: '신규주문 알림',
      description: '새 주문이 들어오면 즉시 알림을 받습니다.',
      enabled: true,
    },
    {
      key: 'margin-drop',
      label: '마진율 하락 알림',
      description: '상품 마진율이 설정값 이하로 떨어지면 알립니다.',
      enabled: true,
    },
    {
      key: 'customs-risk',
      label: '통관 리스크 알림',
      description: '통관 위험도가 높아진 상품이 감지되면 알립니다.',
      enabled: false,
    },
    {
      key: 'price-change',
      label: '가격 변동 알림',
      description: '해외 소스 가격이 변동되면 알림을 받습니다.',
      enabled: false,
    },
  ])

  function handleBasicChange(key: keyof BasicSettings, value: string) {
    setBasicSettings((prev) => ({ ...prev, [key]: value }))
    setSavedBasic(false)
  }

  function handleSaveBasic() {
    setSavedBasic(true)
    setTimeout(() => setSavedBasic(false), 2500)
  }

  function toggleIntegration(index: number) {
    setIntegrations((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, connected: !item.connected } : item
      )
    )
  }

  function toggleNotification(key: string) {
    setNotifications((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, enabled: !item.enabled } : item
      )
    )
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
            {tab}
          </button>
        ))}
      </div>

      {activeTab === '기본설정' && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">기본 계산 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                환율 (USD/KRW)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={basicSettings.exchangeRate}
                  onChange={(e) => handleBasicChange('exchangeRate', e.target.value)}
                  className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  KRW
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                기본 마진 목표율 (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={basicSettings.targetMarginRate}
                  onChange={(e) => handleBasicChange('targetMarginRate', e.target.value)}
                  className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                국내배송비 기본값 (KRW)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={basicSettings.domesticShippingCost}
                  onChange={(e) => handleBasicChange('domesticShippingCost', e.target.value)}
                  className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  KRW
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                결제수수료율 (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  value={basicSettings.paymentFeeRate}
                  onChange={(e) => handleBasicChange('paymentFeeRate', e.target.value)}
                  className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  %
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Button onClick={handleSaveBasic} className="w-full">
                {savedBasic ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    저장되었습니다
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    저장
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'API연동' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          {integrations.map((integration, i) => (
            <Card key={integration.name}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-medium text-gray-900">{integration.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {integration.connected ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-xs text-green-600 font-medium">연결됨</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs text-gray-400">미연결</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleIntegration(i)}
                    className="shrink-0"
                    aria-label={integration.connected ? '연결 해제' : '연결'}
                  >
                    {integration.connected ? (
                      <ToggleRight className="w-8 h-8 text-blue-600" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-gray-300" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500">{integration.description}</p>
                <Button
                  variant={integration.connected ? 'outline' : 'default'}
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => toggleIntegration(i)}
                >
                  {integration.connected ? '연결 해제' : '연결하기'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === '알림설정' && (
        <Card className="max-w-lg">
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
                  {item.enabled ? (
                    <ToggleRight className="w-8 h-8 text-blue-600" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-gray-300" />
                  )}
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
