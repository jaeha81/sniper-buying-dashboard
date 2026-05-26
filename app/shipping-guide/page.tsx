import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Package, DollarSign, Clock, Shield, HelpCircle, ArrowRight } from 'lucide-react'

const processSteps = [
  { icon: '🛒', title: '상품 신청', desc: '구매 희망 상품 URL 및 옵션 전달' },
  { icon: '💳', title: '결제 진행', desc: '해외 사이트 대신 결제 처리' },
  { icon: '📦', title: '해외 창고 수령', desc: '현지 창고에서 상품 입고 확인' },
  { icon: '✈️', title: '국제 배송', desc: '항공/선박으로 국내 입고' },
  { icon: '🚚', title: '국내 배송', desc: '통관 후 고객 주소지로 발송' },
]

const shippingFees = [
  { weight: '0.5kg 이하', air: '약 8,000원', sea: '해당 없음' },
  { weight: '0.5~1kg', air: '약 12,000원', sea: '해당 없음' },
  { weight: '1~3kg', air: '약 22,000원', sea: '약 15,000원' },
  { weight: '3~5kg', air: '약 35,000원', sea: '약 22,000원' },
  { weight: '5kg 초과', air: '별도 문의', sea: '별도 문의' },
]

const deliveryTimes = [
  { country: '미국', air: '7~10일', sea: '30~45일' },
  { country: '일본', air: '3~5일', sea: '10~15일' },
  { country: '유럽', air: '10~14일', sea: '40~60일' },
  { country: '기타', air: '10~20일', sea: '별도 문의' },
]

export default function ShippingGuidePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-2">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← 메인으로</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">배송 안내</h1>
      <p className="text-gray-500 mb-8">스나이퍼 구매대행의 배송 프로세스와 요금을 안내해 드립니다.</p>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              구매대행 프로세스
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              {processSteps.map((step, idx) => (
                <div key={step.title} className="flex flex-col items-center text-center relative">
                  <div className="text-3xl mb-2">{step.icon}</div>
                  <p className="text-sm font-semibold text-gray-800">{step.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{step.desc}</p>
                  {idx < processSteps.length - 1 && (
                    <ArrowRight className="hidden sm:block absolute -right-2 top-4 h-4 w-4 text-gray-300" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              배송비 안내
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">아래 요금은 예시이며, 실제 요금은 상품 부피/무게에 따라 다를 수 있습니다.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border px-4 py-2 text-left font-semibold text-gray-700">무게</th>
                    <th className="border px-4 py-2 text-center font-semibold text-gray-700">항공배송</th>
                    <th className="border px-4 py-2 text-center font-semibold text-gray-700">해상배송</th>
                  </tr>
                </thead>
                <tbody>
                  {shippingFees.map((row) => (
                    <tr key={row.weight} className="hover:bg-gray-50">
                      <td className="border px-4 py-2 text-gray-700">{row.weight}</td>
                      <td className="border px-4 py-2 text-center text-gray-700">{row.air}</td>
                      <td className="border px-4 py-2 text-center text-gray-700">{row.sea}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">※ 국내 배송비 3,000원 별도 부과</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              배송 기간
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border px-4 py-2 text-left font-semibold text-gray-700">국가</th>
                    <th className="border px-4 py-2 text-center font-semibold text-gray-700">항공배송 예상일</th>
                    <th className="border px-4 py-2 text-center font-semibold text-gray-700">해상배송 예상일</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryTimes.map((row) => (
                    <tr key={row.country} className="hover:bg-gray-50">
                      <td className="border px-4 py-2 font-medium text-gray-700">{row.country}</td>
                      <td className="border px-4 py-2 text-center text-gray-700">{row.air}</td>
                      <td className="border px-4 py-2 text-center text-gray-700">{row.sea}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">※ 위 기간은 통관 완료 후 기준이며, 통관 소요 시간에 따라 변동될 수 있습니다.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              통관 안내
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">목록통관</h3>
              <p className="text-sm text-gray-600">미화 150달러 이하 개인 사용 목적 물품은 목록통관으로 신속하게 처리됩니다. 관세 및 부가세가 면제됩니다.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">일반통관</h3>
              <p className="text-sm text-gray-600">150달러를 초과하거나 특정 품목은 일반통관이 적용됩니다. 관세 및 부가세(10%)가 부과될 수 있으며, 통관 시간이 더 소요됩니다.</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <h3 className="font-semibold text-yellow-800 mb-1">수입 금지 품목</h3>
              <p className="text-sm text-yellow-700">총기류, 마약류, 모조품, 동식물 검역 대상 품목 등은 수입이 불가합니다. 해당 품목 주문 시 강제 반송 또는 폐기 처분될 수 있습니다.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Link href="/faq">
            <Button variant="outline" className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              자주 묻는 질문 보기
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
