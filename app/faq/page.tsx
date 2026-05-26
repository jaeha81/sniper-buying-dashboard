'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '../../components/ui/card'

const categories = ['주문', '배송', '통관', '반품', '결제'] as const
type Category = typeof categories[number]

const faqs: Record<Category, { q: string; a: string }[]> = {
  주문: [
    {
      q: '해외직구와 구매대행의 차이는 무엇인가요?',
      a: '해외직구는 고객이 직접 해외 사이트에서 결제하는 방식이고, 구매대행은 스나이퍼가 대신 구매하고 국내로 배송해 드리는 서비스입니다. 언어 장벽이나 해외 카드 없이도 이용 가능합니다.',
    },
    {
      q: '주문 후 상품 변경이나 취소가 가능한가요?',
      a: '해외 사이트 구매 전이라면 취소가 가능합니다. 이미 구매가 진행된 경우에는 해외 사이트 정책에 따라 반품/취소 처리가 어려울 수 있으므로 주문 전 신중히 결정해 주세요.',
    },
    {
      q: '주문 현황은 어떻게 확인하나요?',
      a: '주문 완료 시 등록하신 이메일로 진행 상황을 안내해 드립니다. 주문 완료 페이지에서 주문번호와 배송 단계를 확인하실 수 있습니다.',
    },
    {
      q: '여러 상품을 한 번에 주문할 수 있나요?',
      a: '네, 장바구니에 여러 상품을 담아 한 번에 주문하실 수 있습니다. 다만 발송지 국가가 다른 경우 국제배송비가 별도로 부과될 수 있습니다.',
    },
    {
      q: '상품 재고 확인은 어떻게 하나요?',
      a: '상품 페이지에 표시된 URL로 직접 확인하시거나, 주문 시 재고 확인 후 빠르게 안내드립니다. 재고 부족 시 전액 환불 처리해 드립니다.',
    },
  ],
  배송: [
    {
      q: '배송 추적은 어떻게 하나요?',
      a: '국제배송 시작 후 트래킹 번호를 이메일로 발송해 드립니다. 해당 번호로 배송사 홈페이지에서 실시간 위치를 확인하실 수 있습니다.',
    },
    {
      q: '배송 기간은 얼마나 걸리나요?',
      a: '국가별로 다르며, 항공배송 기준 미국 7~10일, 일본 3~5일, 유럽 10~14일 정도 소요됩니다. 통관 절차에 따라 지연될 수 있습니다. 자세한 내용은 배송 안내 페이지를 참고하세요.',
    },
    {
      q: '배송 중 상품이 파손되면 어떻게 하나요?',
      a: '파손 사진을 수령일로부터 3일 이내에 고객센터로 보내주시면 확인 후 처리해 드립니다. 배송 과실이 인정될 경우 보상 절차를 안내해 드립니다.',
    },
    {
      q: '합포장(묶음배송)이 가능한가요?',
      a: '동일 창고 입고 상품은 합포장이 가능하여 배송비를 절약할 수 있습니다. 서로 다른 쇼핑몰 상품의 경우 합포장이 어려울 수 있습니다.',
    },
    {
      q: '도서·산간 지역도 배송이 가능한가요?',
      a: '도서·산간 지역도 배송 가능합니다. 단, 국내 배송비가 추가될 수 있으며 배송 기간이 다소 길어질 수 있습니다.',
    },
  ],
  통관: [
    {
      q: '관세는 얼마나 나오나요?',
      a: '미화 150달러 이하 개인 사용 목적 물품은 목록통관으로 관세가 면제됩니다. 150달러 초과 시 품목에 따라 관세율이 적용되며, 통상 상품가의 8~13% 수준입니다.',
    },
    {
      q: '미국발 상품의 면세 기준이 다른가요?',
      a: '한미 FTA 특례로 미국발 상품은 미화 200달러까지 목록통관(관세 면제)이 적용됩니다.',
    },
    {
      q: '통관이 지연되는 경우 어떻게 하나요?',
      a: '세관 심사는 통상 1~3 영업일이 소요됩니다. 지연 시 이메일로 안내드리며 필요 서류를 함께 안내해 드립니다.',
    },
    {
      q: '수입이 금지된 상품은 어떤 것이 있나요?',
      a: '총기류, 마약류, 모조품, 동식물 검역 대상 품목 등은 수입이 불가합니다. 해당 품목 주문 시 강제 반송 또는 폐기 처분될 수 있습니다. 상품 페이지의 통관 리스크 등급을 꼭 확인하세요.',
    },
    {
      q: '통관 불가 상품은 환불이 되나요?',
      a: '통관 불가 판정 상품은 반송 또는 현지 폐기 처리됩니다. 반송 시 발생하는 비용(국제 반송비 등)을 제외한 금액으로 환불 처리해 드립니다.',
    },
  ],
  반품: [
    {
      q: '구매한 상품을 반품할 수 있나요?',
      a: '해외 구매대행 특성상 반품은 제한적입니다. 상품 불량이나 오배송의 경우 고객센터로 접수해 주시면 해외 판매자에게 반품 요청을 진행합니다. 단순 변심 반품은 해외 사이트 정책에 따릅니다.',
    },
    {
      q: '반품 처리 기간은 얼마나 걸리나요?',
      a: '반품 접수 후 해외 반송 및 환불 확인까지 통상 3~6주가 소요됩니다. 해외 판매자의 처리 속도에 따라 변동될 수 있습니다.',
    },
    {
      q: '반품 시 배송비는 누가 부담하나요?',
      a: '상품 불량/오배송의 경우 배송비는 스나이퍼가 부담합니다. 단순 변심 반품의 경우 국제 왕복 배송비는 고객 부담입니다.',
    },
    {
      q: '교환은 가능한가요?',
      a: '해외 구매대행 특성상 교환보다는 반품 후 재주문 형태로 처리됩니다. 동일 상품 재고 여부에 따라 다를 수 있으니 고객센터로 문의해 주세요.',
    },
  ],
  결제: [
    {
      q: '사용 가능한 결제 수단은 무엇인가요?',
      a: '신용카드, 체크카드, 계좌이체를 지원합니다. 추후 간편결제(카카오페이, 네이버페이)도 추가 예정입니다.',
    },
    {
      q: '영수증 발급이 가능한가요?',
      a: '현금영수증 및 세금계산서 발급이 가능합니다. 주문 시 해당 항목을 선택하시거나 주문 완료 후 고객센터로 요청해 주세요.',
    },
    {
      q: '할부 결제가 가능한가요?',
      a: '신용카드 결제 시 무이자 할부가 가능합니다. 카드사 정책에 따라 3~12개월 무이자 혜택이 적용될 수 있습니다.',
    },
    {
      q: '결제 금액이 다르게 청구되었어요.',
      a: '해외 상품 특성상 환율 변동으로 인해 결제 시점과 실제 청구 금액이 소폭 다를 수 있습니다. 큰 차이가 발생한 경우 고객센터로 문의해 주세요.',
    },
    {
      q: '포인트나 쿠폰 사용이 가능한가요?',
      a: '구매 금액의 일정 비율이 포인트로 적립되며, 다음 주문 시 사용하실 수 있습니다. 이벤트 쿠폰은 마이페이지에서 확인하실 수 있습니다.',
    },
  ],
}

export default function FaqPage() {
  const [activeTab, setActiveTab] = useState<Category>('주문')

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-2">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← 메인으로
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">자주 묻는 질문</h1>
      <p className="text-gray-500 mb-8">스나이퍼 구매대행 서비스에 대한 궁금증을 해결해 드립니다.</p>

      {/* 카테고리 탭 */}
      <div className="flex gap-1 mb-6 border-b overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeTab === cat
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* FAQ 목록 */}
      <div className="space-y-3">
        {faqs[activeTab].map((item, idx) => (
          <Card key={idx}>
            <CardContent className="p-5">
              <details>
                <summary className="cursor-pointer list-none flex items-start gap-2">
                  <span className="text-blue-600 font-bold shrink-0">Q.</span>
                  <span className="font-medium text-gray-800">{item.q}</span>
                </summary>
                <div className="mt-3 pl-6 text-sm text-gray-600 leading-relaxed flex gap-2">
                  <span className="text-green-600 font-bold shrink-0">A.</span>
                  <span>{item.a}</span>
                </div>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-10 text-center">
        <p className="text-sm text-gray-500 mb-3">원하는 답변을 찾지 못하셨나요?</p>
        <a
          href="mailto:support@sniper-buying.com"
          className="text-blue-600 hover:underline text-sm font-medium"
        >
          고객센터 문의하기 →
        </a>
      </div>
    </div>
  )
}
