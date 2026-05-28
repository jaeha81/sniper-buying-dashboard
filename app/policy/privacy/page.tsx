import Link from 'next/link'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-luxury-bg">
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="mb-6">
          <Link href="/" className="text-sm text-muted-foreground hover:text-gold transition-colors">
            ← 메인으로
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-1">개인정보 처리방침</h1>
        <p className="text-sm text-muted-foreground mb-8">최종 업데이트: 2026년 1월 1일</p>

        <div className="bg-luxury-surface border border-white/5 rounded-xl p-6 space-y-8 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            스나이퍼 구매대행(이하 "회사")은 이용자의 개인정보를 소중히 여기며, 「개인정보 보호법」 및 관련 법령을 준수합니다.
          </p>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제1조 수집하는 개인정보 항목</h2>
            <p className="mb-2 text-muted-foreground">회사는 서비스 제공을 위해 아래와 같은 개인정보를 수집합니다.</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><span className="text-foreground font-medium">필수 항목:</span> 이름, 이메일 주소, 전화번호, 배송지 주소</li>
              <li><span className="text-foreground font-medium">결제 정보:</span> 결제 수단 종류 (카드 번호 등 민감 정보는 PG사에서 직접 처리)</li>
              <li><span className="text-foreground font-medium">자동 수집:</span> IP 주소, 쿠키, 접속 기록, 브라우저 종류</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제2조 개인정보 수집 목적</h2>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>주문 접수, 결제 처리, 배송 및 배송 상태 안내</li>
              <li>고객 문의 처리 및 불만 대응</li>
              <li>서비스 개선 및 신규 서비스 개발</li>
              <li>법령 및 규정 준수 (통관 신고 등)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제3조 개인정보 보유 및 이용 기간</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">보유 항목</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">보유 기간</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">근거</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr className="hover:bg-white/3 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground">주문·결제 기록</td>
                    <td className="px-3 py-2.5 text-foreground">5년</td>
                    <td className="px-3 py-2.5 text-muted-foreground">전자상거래법</td>
                  </tr>
                  <tr className="hover:bg-white/3 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground">배송 정보</td>
                    <td className="px-3 py-2.5 text-foreground">3년</td>
                    <td className="px-3 py-2.5 text-muted-foreground">전자상거래법</td>
                  </tr>
                  <tr className="hover:bg-white/3 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground">고객 문의 기록</td>
                    <td className="px-3 py-2.5 text-foreground">3년</td>
                    <td className="px-3 py-2.5 text-muted-foreground">소비자보호법</td>
                  </tr>
                  <tr className="hover:bg-white/3 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground">접속 로그</td>
                    <td className="px-3 py-2.5 text-foreground">1년</td>
                    <td className="px-3 py-2.5 text-muted-foreground">통신비밀보호법</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제4조 개인정보의 제3자 제공</h2>
            <p className="mb-2 text-muted-foreground">
              회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 아래 경우는 예외입니다.
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>이용자가 사전에 동의한 경우</li>
              <li>배송·통관을 위해 국제배송사, 관세사에게 최소한의 정보 제공</li>
              <li>법령에 근거한 수사기관의 요청</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제5조 이용자의 권리</h2>
            <p className="text-muted-foreground">이용자는 언제든지 아래 권리를 행사할 수 있습니다.</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-2">
              <li>개인정보 열람, 정정, 삭제 요청</li>
              <li>개인정보 처리 정지 요청</li>
              <li>마케팅 수신 동의 철회</li>
            </ul>
            <p className="text-muted-foreground mt-2">권리 행사는 고객센터 또는 개인정보 보호책임자에게 서면·이메일로 신청하실 수 있으며, 10영업일 이내에 처리해 드립니다.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제6조 문의</h2>
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-1.5">
              <p className="text-muted-foreground"><span className="text-foreground font-medium">개인정보 보호책임자:</span> 스나이퍼 고객센터</p>
              <p className="text-muted-foreground"><span className="text-foreground font-medium">이메일:</span> privacy@sniper-buying.com</p>
              <p className="text-muted-foreground"><span className="text-foreground font-medium">전화:</span> 1588-0000 (평일 09:00~18:00)</p>
            </div>
          </section>
        </div>

        <div className="mt-8 flex gap-4 text-sm">
          <Link href="/policy/terms" className="text-muted-foreground hover:text-gold transition-colors">이용약관</Link>
          <Link href="/policy/refund" className="text-muted-foreground hover:text-gold transition-colors">환불 정책</Link>
        </div>
      </div>
    </div>
  )
}
