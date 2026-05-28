import Link from 'next/link'

const refundCases = [
  { case: '상품 불량 (제조사 결함)', method: '전액 환불 (배송비 회사 부담)', period: '접수 후 7~14일' },
  { case: '오배송 (다른 상품 수령)', method: '전액 환불 또는 재배송', period: '접수 후 7~14일' },
  { case: '배송 분실', method: '전액 환불', period: '분실 확인 후 7일' },
  { case: '단순 변심', method: '상품가 환불, 국제 왕복 배송비 공제', period: '반품 도착 후 10일' },
  { case: '통관 거부 (금지 품목)', method: '상품가 환불, 배송비 및 수수료 불공제', period: '통관 거부 확인 후 7일' },
]

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-luxury-bg">
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="mb-6">
          <Link href="/" className="text-sm text-muted-foreground hover:text-gold transition-colors">
            ← 메인으로
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-1">환불 / 반품 정책</h1>
        <p className="text-sm text-muted-foreground mb-8">최종 업데이트: 2026년 1월 1일</p>

        <div className="space-y-4">
          <div className="bg-luxury-surface border border-white/5 rounded-xl p-6 text-sm space-y-3">
            <h2 className="text-sm font-semibold text-gold uppercase tracking-wider">환불 가능 조건</h2>
            <p className="text-muted-foreground">다음에 해당하는 경우 환불 신청이 가능합니다.</p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li>수령한 상품이 주문한 상품과 다른 경우 (오배송)</li>
              <li>제조사 결함 또는 파손으로 인해 정상 사용이 불가능한 경우</li>
              <li>배송 중 분실이 확인된 경우</li>
              <li>해외 쇼핑몰 구매 진행 전 취소 요청한 경우</li>
            </ul>
          </div>

          <div className="bg-luxury-surface border border-white/5 rounded-xl p-6 text-sm space-y-3">
            <h2 className="text-sm font-semibold text-gold uppercase tracking-wider">환불 불가 조건</h2>
            <div className="bg-red-950/40 border border-red-900/40 rounded-lg p-3 mb-2">
              <p className="text-red-400 text-xs font-medium">해외 구매대행 특성상 아래의 경우 환불이 제한됩니다.</p>
            </div>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li>해외 판매자가 반품 불가 정책을 적용하는 상품</li>
              <li>개봉 후 사용 흔적이 있는 상품 (단순 변심 포함)</li>
              <li>고객 부주의로 인한 파손</li>
              <li>수입 금지 품목으로 인해 통관 거부된 경우의 배송비</li>
              <li>특가·한정 판매 상품</li>
              <li>위생용품, 식품 등 특성상 반품이 불가한 상품</li>
            </ul>
          </div>

          <div className="bg-luxury-surface border border-white/5 rounded-xl p-6 text-sm space-y-3">
            <h2 className="text-sm font-semibold text-gold uppercase tracking-wider">환불 신청 방법</h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>주문 완료 페이지에서 주문번호 확인</li>
              <li>고객센터 이메일 또는 전화로 환불/반품 사유 접수</li>
              <li>상품 사진 첨부 (불량/파손 시 필수)</li>
              <li>고객센터 검토 후 처리 방법 안내 (1~2영업일)</li>
              <li>안내에 따라 상품 반송 또는 환불 확정</li>
            </ol>
            <div className="mt-2 bg-white/5 border border-white/10 rounded-lg px-4 py-3">
              <p className="text-muted-foreground">고객센터: <span className="text-foreground">support@sniper-buying.com</span> / <span className="text-foreground">1588-0000</span></p>
            </div>
          </div>

          <div className="bg-luxury-surface border border-white/5 rounded-xl p-6 text-sm space-y-3">
            <h2 className="text-sm font-semibold text-gold uppercase tracking-wider">환불 케이스별 처리 방법</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">환불 케이스</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">처리 방법</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">처리 기간</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {refundCases.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/3 transition-colors">
                      <td className="px-3 py-2.5 text-foreground">{row.case}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.method}</td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{row.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-luxury-surface border border-white/5 rounded-xl p-6 text-sm space-y-3">
            <h2 className="text-sm font-semibold text-gold uppercase tracking-wider">환불 처리 기간</h2>
            <p className="text-muted-foreground">환불 확정 후 결제 수단에 따라 아래 기간 내에 처리됩니다.</p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li><span className="text-foreground font-medium">신용카드:</span> 3~5영업일 (카드사 정책에 따라 다를 수 있음)</li>
              <li><span className="text-foreground font-medium">계좌이체:</span> 2~3영업일</li>
              <li><span className="text-foreground font-medium">포인트:</span> 즉시 환원</li>
            </ul>
          </div>

          <div className="bg-luxury-surface border border-white/5 rounded-xl p-6 text-sm space-y-3">
            <h2 className="text-sm font-semibold text-gold uppercase tracking-wider">주의사항</h2>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li>상품 수령 후 7일 이내에 환불 신청을 해주세요.</li>
              <li>반품 상품은 미사용·미개봉 상태로 원래 포장에 보관하여 발송해 주세요.</li>
              <li>해외 판매자 귀책 사유의 경우 처리 기간이 길어질 수 있습니다.</li>
              <li>관세 및 부가세는 해외 판매자 귀책 시에만 환급 처리됩니다.</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex gap-4 text-sm">
          <Link href="/policy/privacy" className="text-muted-foreground hover:text-gold transition-colors">개인정보 처리방침</Link>
          <Link href="/policy/terms" className="text-muted-foreground hover:text-gold transition-colors">이용약관</Link>
        </div>
      </div>
    </div>
  )
}
