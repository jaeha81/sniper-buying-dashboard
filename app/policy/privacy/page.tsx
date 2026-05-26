import Link from 'next/link'
import { Card, CardContent } from '../../../components/ui/card'

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-2">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← 메인으로</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">개인정보 처리방침</h1>
      <p className="text-sm text-gray-400 mb-8">최종 업데이트: 2026년 1월 1일</p>

      <Card>
        <CardContent className="p-6 prose prose-sm max-w-none text-gray-700 space-y-8">
          <p>
            스나이퍼 구매대행(이하 "회사")은 이용자의 개인정보를 소중히 여기며, 「개인정보 보호법」 및 관련 법령을 준수합니다.
          </p>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">제1조 수집하는 개인정보 항목</h2>
            <p className="mb-2">회사는 서비스 제공을 위해 아래와 같은 개인정보를 수집합니다.</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><strong>필수 항목:</strong> 이름, 이메일 주소, 전화번호, 배송지 주소</li>
              <li><strong>결제 정보:</strong> 결제 수단 종류 (카드 번호 등 민감 정보는 PG사에서 직접 처리)</li>
              <li><strong>자동 수집:</strong> IP 주소, 쿠키, 접속 기록, 브라우저 종류</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">제2조 개인정보 수집 목적</h2>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>주문 접수, 결제 처리, 배송 및 배송 상태 안내</li>
              <li>고객 문의 처리 및 불만 대응</li>
              <li>서비스 개선 및 신규 서비스 개발</li>
              <li>법령 및 규정 준수 (통관 신고 등)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">제3조 개인정보 보유 및 이용 기간</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border px-3 py-2 text-left font-semibold">보유 항목</th>
                    <th className="border px-3 py-2 text-left font-semibold">보유 기간</th>
                    <th className="border px-3 py-2 text-left font-semibold">근거</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border px-3 py-2">주문·결제 기록</td>
                    <td className="border px-3 py-2">5년</td>
                    <td className="border px-3 py-2">전자상거래법</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border px-3 py-2">배송 정보</td>
                    <td className="border px-3 py-2">3년</td>
                    <td className="border px-3 py-2">전자상거래법</td>
                  </tr>
                  <tr>
                    <td className="border px-3 py-2">고객 문의 기록</td>
                    <td className="border px-3 py-2">3년</td>
                    <td className="border px-3 py-2">소비자보호법</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border px-3 py-2">접속 로그</td>
                    <td className="border px-3 py-2">1년</td>
                    <td className="border px-3 py-2">통신비밀보호법</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">제4조 개인정보의 제3자 제공</h2>
            <p className="mb-2 text-sm">
              회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 아래 경우는 예외입니다.
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>이용자가 사전에 동의한 경우</li>
              <li>배송·통관을 위해 국제배송사, 관세사에게 최소한의 정보 제공</li>
              <li>법령에 근거한 수사기관의 요청</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">제5조 이용자의 권리</h2>
            <p className="text-sm">이용자는 언제든지 아래 권리를 행사할 수 있습니다.</p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li>개인정보 열람, 정정, 삭제 요청</li>
              <li>개인정보 처리 정지 요청</li>
              <li>마케팅 수신 동의 철회</li>
            </ul>
            <p className="text-sm mt-2">권리 행사는 고객센터 또는 개인정보 보호책임자에게 서면·이메일로 신청하실 수 있으며, 10영업일 이내에 처리해 드립니다.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">제6조 문의</h2>
            <div className="bg-gray-50 rounded-md p-4 text-sm space-y-1">
              <p><strong>개인정보 보호책임자:</strong> 스나이퍼 고객센터</p>
              <p><strong>이메일:</strong> privacy@sniper-buying.com</p>
              <p><strong>전화:</strong> 1588-0000 (평일 09:00~18:00)</p>
            </div>
          </section>
        </CardContent>
      </Card>

      <div className="mt-6 flex gap-4 text-sm">
        <Link href="/policy/terms" className="text-blue-600 hover:underline">이용약관</Link>
        <Link href="/policy/refund" className="text-blue-600 hover:underline">환불 정책</Link>
      </div>
    </div>
  )
}
