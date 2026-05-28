'use client'

import { useState, useCallback, useEffect } from 'react'
import { Calculator, RefreshCw, TrendingUp, AlertCircle, CheckCircle, Wifi } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calculateMargin, calculateSniperScore, DEFAULT_EXCHANGE_RATE } from '@/lib/calculator'
import { formatKRW, formatUSD } from '@/lib/utils'
import type { MarginInput, SniperInput } from '@/lib/types'

const defaultInput: MarginInput = {
  overseasPrice: 0,
  exchangeRate: DEFAULT_EXCHANGE_RATE,
  localShippingCost: 0,
  internationalShippingCost: 4500,
  customsDuty: 0,
  vat: 0,
  domesticShippingCost: 3000,
  paymentFee: 0,
  otherCosts: 0,
  domesticExpectedPrice: 0,
}

const defaultSniperInput: SniperInput = {
  demandScore: 3,
  priceCompetitivenessScore: 3,
  marginRate: 0,
  shippingStabilityScore: 3,
  riskLevel: 'LOW',
  competitionLevel: 'medium',
  pageConvincingScore: 3,
  automationScore: 3,
}

function InputField({
  label,
  id,
  value,
  onChange,
  prefix,
  suffix,
  hint,
}: {
  label: string
  id: string
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-sm text-gray-400 pointer-events-none">{prefix}</span>
        )}
        <Input
          id={id}
          type="number"
          min={0}
          step="any"
          value={value === 0 ? '' : value}
          placeholder="0"
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={prefix ? 'pl-8' : suffix ? 'pr-12' : ''}
        />
        {suffix && (
          <span className="absolute right-3 text-sm text-gray-400 pointer-events-none">{suffix}</span>
        )}
      </div>
    </div>
  )
}

export default function MarginsPage() {
  const [input, setInput] = useState<MarginInput>(defaultInput)
  const [sniperInput, setSniperInput] = useState<SniperInput>(defaultSniperInput)
  const [calculated, setCalculated] = useState(false)
  const [liveRate, setLiveRate] = useState<{ rate: number; updatedAt: string | null } | null>(null)

  useEffect(() => {
    fetch('/api/exchange-rate')
      .then((r) => r.json())
      .then((data) => {
        if (data.rate) {
          setLiveRate(data)
          setInput((prev) => ({ ...prev, exchangeRate: data.rate }))
        }
      })
      .catch(() => {})
  }, [])

  const marginResult = calculateMargin(input)
  const updatedSniperInput: SniperInput = {
    ...sniperInput,
    marginRate: marginResult.marginRate,
  }
  const sniperResult = calculateSniperScore(updatedSniperInput)

  const updateInput = useCallback(<K extends keyof MarginInput>(key: K, value: MarginInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }))
    setCalculated(true)
  }, [])

  const updateSniperInput = useCallback(
    <K extends keyof SniperInput>(key: K, value: SniperInput[K]) => {
      setSniperInput((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const resetAll = () => {
    setInput(defaultInput)
    setSniperInput(defaultSniperInput)
    setCalculated(false)
  }

  const isInputFilled = input.overseasPrice > 0 && input.domesticExpectedPrice > 0

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">마진 계산기</h1>
          <p className="text-gray-500 mt-1">해외 구매대행 마진과 스나이퍼 스코어를 실시간으로 계산합니다</p>
        </div>
        <div className="flex items-center gap-3">
          {liveRate && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 rounded-full">
              <Wifi className="w-3 h-3" />
              실시간 환율 1 USD = {liveRate.rate.toLocaleString()} KRW
            </div>
          )}
          <Button variant="outline" size="sm" onClick={resetAll}>
            <RefreshCw className="w-4 h-4 mr-1" />
            초기화
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 입력 폼 */}
        <div className="lg:col-span-3 space-y-6">
          {/* 해외 구매 비용 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                해외 구매 비용
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="해외 원가"
                  id="overseasPrice"
                  value={input.overseasPrice}
                  onChange={(v) => updateInput('overseasPrice', v)}
                  prefix="$"
                  hint="USD 기준"
                />
                <InputField
                  label="현지 배송비"
                  id="localShippingCost"
                  value={input.localShippingCost}
                  onChange={(v) => updateInput('localShippingCost', v)}
                  prefix="$"
                  hint="현지 내 배송비"
                />
              </div>
              <InputField
                label="환율"
                id="exchangeRate"
                value={input.exchangeRate}
                onChange={(v) => updateInput('exchangeRate', v)}
                suffix="KRW"
                hint={`기본값: ${DEFAULT_EXCHANGE_RATE.toLocaleString()} KRW/USD`}
              />
            </CardContent>
          </Card>

          {/* 국내 도착 비용 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                국내 도착 비용 (KRW)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="국제 배송비"
                  id="internationalShippingCost"
                  value={input.internationalShippingCost}
                  onChange={(v) => updateInput('internationalShippingCost', v)}
                  prefix="₩"
                />
                <InputField
                  label="국내 배송비"
                  id="domesticShippingCost"
                  value={input.domesticShippingCost}
                  onChange={(v) => updateInput('domesticShippingCost', v)}
                  prefix="₩"
                />
                <InputField
                  label="관세 예상"
                  id="customsDuty"
                  value={input.customsDuty}
                  onChange={(v) => updateInput('customsDuty', v)}
                  prefix="₩"
                />
                <InputField
                  label="부가세 예상"
                  id="vat"
                  value={input.vat}
                  onChange={(v) => updateInput('vat', v)}
                  prefix="₩"
                />
                <InputField
                  label="결제 수수료"
                  id="paymentFee"
                  value={input.paymentFee}
                  onChange={(v) => updateInput('paymentFee', v)}
                  prefix="₩"
                />
                <InputField
                  label="기타 비용"
                  id="otherCosts"
                  value={input.otherCosts}
                  onChange={(v) => updateInput('otherCosts', v)}
                  prefix="₩"
                />
              </div>
            </CardContent>
          </Card>

          {/* 판매 설정 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                판매 설정
              </CardTitle>
            </CardHeader>
            <CardContent>
              <InputField
                label="국내 판매 예상가"
                id="domesticExpectedPrice"
                value={input.domesticExpectedPrice}
                onChange={(v) => updateInput('domesticExpectedPrice', v)}
                prefix="₩"
                hint="국내 쇼핑몰 예상 판매가"
              />
            </CardContent>
          </Card>

          {/* 스나이퍼 스코어 입력 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                스나이퍼 스코어 항목 (1~5점)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'demandScore', label: '국내수요 (max 20점)' },
                  { key: 'priceCompetitivenessScore', label: '가격경쟁력 (max 20점)' },
                  { key: 'shippingStabilityScore', label: '배송안정성 (max 15점)' },
                  { key: 'pageConvincingScore', label: '페이지설득력 (max 5점)' },
                  { key: 'automationScore', label: '자동화적합도 (max 5점)' },
                ].map((item) => (
                  <div key={item.key} className="space-y-1.5">
                    <Label htmlFor={item.key}>{item.label}</Label>
                    <select
                      id={item.key}
                      value={sniperInput[item.key as keyof SniperInput] as number}
                      onChange={(e) =>
                        updateSniperInput(
                          item.key as keyof SniperInput,
                          parseInt(e.target.value) as never
                        )
                      }
                      className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {[1, 2, 3, 4, 5].map((v) => (
                        <option key={v} value={v}>
                          {v}점
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                <div className="space-y-1.5">
                  <Label>통관리스크</Label>
                  <select
                    value={sniperInput.riskLevel}
                    onChange={(e) =>
                      updateSniperInput('riskLevel', e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')
                    }
                    className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="LOW">낮음 (10점)</option>
                    <option value="MEDIUM">보통 (6점)</option>
                    <option value="HIGH">높음 (2점)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>경쟁강도</Label>
                  <select
                    value={sniperInput.competitionLevel}
                    onChange={(e) =>
                      updateSniperInput(
                        'competitionLevel',
                        e.target.value as 'low' | 'medium' | 'high'
                      )
                    }
                    className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">낮음 (5점)</option>
                    <option value="medium">보통 (3점)</option>
                    <option value="high">높음 (1점)</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 결과 패널 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="sticky top-20 space-y-4">
            {/* 마진 결과 */}
            <Card className={isInputFilled ? 'border-blue-200' : ''}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  마진 계산 결과
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!isInputFilled ? (
                  <div className="text-center py-6 text-gray-400">
                    <Calculator className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">해외원가와 국내판매가를 입력하세요</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-1 border-b border-dashed border-gray-100">
                        <span className="text-gray-500">해외원가 (KRW 환산)</span>
                        <span className="font-medium">{formatKRW(marginResult.overseasPriceKRW)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-dashed border-gray-100">
                        <span className="text-gray-500">현지배송비 (KRW)</span>
                        <span className="font-medium">
                          {formatKRW(marginResult.localShippingCostKRW)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-dashed border-gray-100">
                        <span className="text-gray-500">국제배송비</span>
                        <span className="font-medium">
                          {formatKRW(input.internationalShippingCost)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-dashed border-gray-100">
                        <span className="text-gray-500">관세 + 부가세</span>
                        <span className="font-medium">{formatKRW(marginResult.taxEstimate)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-dashed border-gray-100">
                        <span className="text-gray-500">국내배송비</span>
                        <span className="font-medium">{formatKRW(input.domesticShippingCost)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-dashed border-gray-100">
                        <span className="text-gray-500">결제수수료 + 기타</span>
                        <span className="font-medium">
                          {formatKRW(input.paymentFee + input.otherCosts)}
                        </span>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">총 원가</span>
                        <span className="font-bold">{formatKRW(marginResult.totalCost)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">국내 판매가</span>
                        <span className="font-bold">
                          {formatKRW(input.domesticExpectedPrice)}
                        </span>
                      </div>
                    </div>

                    {/* 순마진 */}
                    <div
                      className={`p-4 rounded-lg text-center ${
                        marginResult.expectedMargin > 0
                          ? 'bg-green-50 border border-green-100'
                          : 'bg-red-50 border border-red-100'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1 mb-1">
                        {marginResult.expectedMargin > 0 ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <p className="text-xs text-gray-500">예상 순마진</p>
                      </div>
                      <p
                        className={`text-2xl font-bold ${
                          marginResult.expectedMargin > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {formatKRW(marginResult.expectedMargin)}
                      </p>
                      <p
                        className={`text-lg font-bold mt-1 ${
                          marginResult.marginRate >= 30
                            ? 'text-green-600'
                            : marginResult.marginRate >= 20
                            ? 'text-blue-600'
                            : marginResult.marginRate >= 10
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                      >
                        마진율 {marginResult.marginRate.toFixed(1)}%
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 스나이퍼 스코어 결과 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">스나이퍼 스코어</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-4">
                  <div
                    className={`text-5xl font-bold ${
                      sniperResult.total >= 80
                        ? 'text-green-600'
                        : sniperResult.total >= 65
                        ? 'text-blue-600'
                        : sniperResult.total >= 50
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}
                  >
                    {sniperResult.total}
                  </div>
                  <div className="text-gray-400 text-sm">/ 100점</div>
                </div>

                {/* 항목별 */}
                <div className="space-y-2 text-xs">
                  {[
                    { label: '국내수요', value: sniperResult.breakdown.demand, max: 20 },
                    { label: '가격경쟁력', value: sniperResult.breakdown.priceCompetitiveness, max: 20 },
                    { label: '마진율', value: sniperResult.breakdown.margin, max: 20 },
                    { label: '배송안정성', value: sniperResult.breakdown.shippingStability, max: 15 },
                    { label: '통관리스크', value: sniperResult.breakdown.customsRisk, max: 10 },
                    { label: '경쟁강도', value: sniperResult.breakdown.competition, max: 5 },
                    { label: '페이지설득력', value: sniperResult.breakdown.pageConvincing, max: 5 },
                    { label: '자동화적합도', value: sniperResult.breakdown.automation, max: 5 },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-gray-500">{item.label}</span>
                        <span className="font-medium">
                          {item.value}
                          <span className="text-gray-300">/{item.max}</span>
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${(item.value / item.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
