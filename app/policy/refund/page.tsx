import Link from 'next/link'
import { Card, CardContent } from '../../../components/ui/card'

const refundCases = [
  { case: '상품 불량 (제조사 결함)', method: '전액 환불 (배송비 회사 부담)', period: '접수 후 7~14일' },
  { case: '오배송 (다른 상품 수령)', method: '전액 환불 또는 재배송', period: '접수 후 7~14일' },
  { case: '배송 분실', method: '전액 환불', period: '분실 확인 후 7일' },
  { case: '단순 변심', method: '상품가 환불, 국제 왕복 배송비 공제', period: '반품 도착 후 10일' },
  { case: '통관 거부 (금지 품목)', method: '상품가 환불, 배송비 및 수수료 불공제', period: '통관 거부 확인 후 7일' },
]

export default function RefundPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-2">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← 메인으로</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">환불 / 반품 정책</h1>
      <p className="text-sm text-gray-400 mb-8">최종 업데이트: 2026년 1월 1일</p>

      <div className="space-y-6">
        <Card>
          <CardContent className="p-6 text-sm text-gray-700 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">환불 가능 조건</h2>
            <p>다음에 해당하는 경우 환불 신청이 가능합니다.</p>
            <ul className="list-disc list-inside space-y-1.5">
              <li>수령한 상품이 주문한 상품과 다른 경우 (오배송)</li>
              <li>제조사 결함 또는 파손으로 인해 정상 사용이 불가능한 경우</li>
              <li>배송 중 분실이 확인된 경우</li>
              <li>해외 쇼핑몰 구매 진행 전 취소 요청한 경우</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-sm text-gray-700 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">환불 불가 조건</h2>
            <div className="bg-red-50 border border-red-100 rounded-md p-3 mb-2">
              <p className="text-red-700 text-xs font-medium">해외 구매대행 특성상 아래의 경우 환불이 제한됩니다.</p>
            </div>
            <ul className="list-disc list-inside space-y-1.5">
              <li>해외 판매자가 반품 불가 정책을 적용하는 상품</li>
              <li>개봉 후 사용 흔적이 있는 상품 (단순 변심 포함)</li>
              <li>고객 부주의로 인한 파손</li>
              <li>수입 금지 품목으로 인해 통관 거부된 경우의 배송비</li>
              <li>특가·한정 판매 상품</li>
              <li>위생용품, 식품 등 특성상 반품이 불가한 상품</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-sm text-gray-700 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">환불 신청 방법</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>주문 완료 페이지에서 주문번호 확인</li>
              <li>고객센터 이메일 또는 전화로 환불/반품 사유 접수</li>
              <li>상품 사진 첨부 (불량/파손 시 필수)</li>
              <li>고객센터 검토 후 처리 방법 안내 (1~2영업일)</li>
              <li>안내에 따라 상품 반송 또는 환불 확정</li>
            </ol>
            <p className="text-gray-500 mt-2">
              고객센터: support@sniper-buying.com / 1588-0000
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-sm text-gray-700 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">환불 케이스별 처리 방법</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border px-3 py-2 text-left font-semibold text-gray-700">환불 케이스</th>
                    <th className="border px-3 py-2 text-left font-semibold text-gray-700">처리 방법</th>
                    <th className="border px-3 py-2 text-left font-semibold text-gray-700">처리 기간</th>
                  </tr>
                </thead>
                <tbody>
                  {refundCases.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50'}>
                      <td className="border px-3 py-2 text-gray-700">{row.case}</td>
                      <td className="border px-3 py-2 text-gray-700">{row.method}</td>
                      <td className="border px-3 py-2 text-gray-500 whitespace-nowrap">{row.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-sm text-gray-700 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">환불 처리 기간</h2>
            <p>환불 확정 후 결제 수단에 따라 아래 기간 내에 처리됩니다.</p>
            <ul className="list-disc list-inside space-y-1.5">
              <li><strong>신용카드:</strong> 3~5영업일 (카드사 정책에 따라 다를 수 있음)</li>
              <li><strong>계좌이체:</strong> 2~3영업일</li>
              <li><strong>포인트:</strong> 즉시 환원</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-sm text-gray-700 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">주의사항</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li>상품 수령 후 7일 이내에 환불 신청을 해주세요.</li>
              <li>반품 상품은 미사용·미개봉 상태로 원래 포장에 보관하여 발송해 주세요.</li>
              <li>해외 판매자 귀책 사유의 경우 처리 기간이 길어질 수 있습니다.</li>
              <li>관세 및 부가세는 해외 판매자 귀책 시에만 환급 처리됩니다.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex gap-4 text-sm">
        <Link href="/policy/privacy" className="text-blue-600 hover:underline">개인정보 처리방침</Link>
        <Link href="/policy/terms" className="text-blue-600 hover:underline">이용약관</Link>
      </div>
    </div>
  )
}
