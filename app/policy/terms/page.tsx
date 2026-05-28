import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-luxury-bg">
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="mb-6">
          <Link href="/" className="text-sm text-muted-foreground hover:text-gold transition-colors">
            ← 메인으로
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-1">이용약관</h1>
        <p className="text-sm text-muted-foreground mb-8">최종 업데이트: 2026년 1월 1일</p>

        <div className="bg-luxury-surface border border-white/5 rounded-xl p-6 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제1조 (목적)</h2>
            <p className="text-muted-foreground">
              이 약관은 스나이퍼 구매대행(이하 "회사")이 제공하는 해외 구매대행 서비스(이하 "서비스")의 이용 조건과 절차, 회사와 이용자 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제2조 (서비스 내용)</h2>
            <p className="mb-2 text-muted-foreground">회사는 다음과 같은 서비스를 제공합니다.</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>해외 쇼핑몰 상품 구매 대행</li>
              <li>국제 배송 및 국내 배송 연계</li>
              <li>통관 신고 대행</li>
              <li>구매 가능 여부 및 상품 정보 안내</li>
            </ul>
            <p className="mt-2 text-muted-foreground">서비스 내용은 회사 사정에 따라 변경될 수 있으며, 변경 시 7일 전에 공지합니다.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제3조 (구매대행 서비스)</h2>
            <p className="mb-2 text-muted-foreground">
              구매대행 서비스는 이용자의 의뢰에 따라 회사가 해외 상품을 구매하고 배송하는 서비스입니다. 다음 사항에 유의하시기 바랍니다.
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>회사는 이용자의 대리인으로서 구매를 진행하며, 상품의 판매자는 해외 쇼핑몰입니다.</li>
              <li>상품 품질·진위에 관한 1차 책임은 해외 판매자에게 있습니다.</li>
              <li>통관 지연·거부로 인한 손해는 관련 법령 및 수입 기준에 따릅니다.</li>
              <li>수입 금지 품목 주문 시 주문이 취소되며 실비 수수료가 발생할 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제4조 (요금 및 결제)</h2>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>서비스 요금은 상품 구매가, 국제배송비, 국내배송비, 구매대행 수수료로 구성됩니다.</li>
              <li>결제는 신용카드, 체크카드, 계좌이체로 가능합니다.</li>
              <li>환율 변동으로 인한 최종 결제 금액 차이가 발생할 수 있습니다.</li>
              <li>관세 및 부가세는 통관 시 고객 부담이며, 예상 관세는 서비스 페이지에서 확인하실 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제5조 (취소 및 환불)</h2>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>해외 쇼핑몰 구매 전: 전액 환불 가능</li>
              <li>구매 진행 중: 취소 불가 (해외 판매자 정책에 따름)</li>
              <li>상품 결함·오배송: 회사가 반품 처리 및 환불 진행</li>
              <li>단순 변심: 국제 왕복 배송비 및 반품 수수료 고객 부담</li>
            </ul>
            <p className="mt-2 text-muted-foreground">환불 처리는 취소 확정 후 3~10영업일 이내에 완료됩니다.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제6조 (면책사항)</h2>
            <p className="mb-2 text-muted-foreground">회사는 다음 사유로 인한 손해에 대해 책임을 지지 않습니다.</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>천재지변, 전쟁, 파업 등 불가항력에 의한 서비스 중단</li>
              <li>이용자가 제공한 부정확한 정보로 발생한 손해</li>
              <li>해외 판매자 귀책 사유로 인한 상품 불량 또는 배송 지연</li>
              <li>수입 금지 물품 신청으로 인한 통관 거부 및 압수</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wider">제7조 (분쟁 해결)</h2>
            <p className="text-muted-foreground">
              이 약관과 관련한 분쟁은 대한민국 법을 준거법으로 하며, 소송의 관할은 회사 소재지를 관할하는 법원으로 합니다. 분쟁 발생 시 쌍방 협의를 통해 우선 해결하며, 합의가 이루어지지 않을 경우 한국소비자원에 조정을 신청할 수 있습니다.
            </p>
          </section>
        </div>

        <div className="mt-8 flex gap-4 text-sm">
          <Link href="/policy/privacy" className="text-muted-foreground hover:text-gold transition-colors">개인정보 처리방침</Link>
          <Link href="/policy/refund" className="text-muted-foreground hover:text-gold transition-colors">환불 정책</Link>
        </div>
      </div>
    </div>
  )
}
