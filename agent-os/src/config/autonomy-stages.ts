// ============================================================================
// 단계적 자율 승격 정의 — "완전자율 수익"을 안전하게 단계별로 개방한다.
//
// 각 단계는 lib/autonomy 의 autonomy_level 로 매핑되고, 추가로 "예산 구매" 같은
// 데몬 전용 능력을 게이팅한다. 승격은 자동 상향 금지(사람이 수동 승격)이며,
// 강등(킬스위치/저성과)은 자동 허용한다.
// ============================================================================

import type { AutonomyLevel } from '../../../lib/autonomy'

export interface AutonomyStage {
  stage: number
  key: string
  label: string
  /** lib/autonomy 정책 레벨로의 매핑 */
  level: AutonomyLevel
  /** 이 단계에서 열리는 능력 요약(사람용) */
  opens: string[]
  /** 다음 단계로 수동 승격하기 위한 기준(운영자 체크리스트) */
  promotionCriteria: string[]
  /** 데몬 전용: 예산 한도 내 실제 구매/결제 자동 실행 허용 여부(S3에서만 true, 기본 비활성) */
  allowBudgetedPurchase: boolean
}

export const AUTONOMY_STAGES: AutonomyStage[] = [
  {
    stage: 0,
    key: 'observe',
    label: '관찰',
    level: 'manual',
    opens: ['전부 제안만(자율 실행 없음)', '베이스라인·감사로그 정합성 수집'],
    promotionCriteria: [
      '7일 연속 무사고 스캔',
      '감사 컬럼(executed_by/execution_result) 정상 기록 확인',
      '킬스위치·정책 로드 폴백 동작 검증',
    ],
    allowBudgetedPurchase: false,
  },
  {
    stage: 1,
    key: 'defend',
    label: '방어',
    level: 'assisted',
    opens: ['저마진 상품 방어적 일시중지', '가격 변동 한도 내 재가격(목표 마진 복원)'],
    promotionCriteria: [
      '14일간 자율 실행 실패율 < 1%',
      '마진 방어 오탐(정상 상품 오중단) 0건',
      '재가격 후 실현 마진이 목표 근접',
    ],
    allowBudgetedPurchase: false,
  },
  {
    stage: 2,
    key: 'operate',
    label: '운영',
    level: 'autopilot',
    opens: ['고득점 상품 자동 승인(스코어 임계값)', '비긴급 리스크 점검 기록', '고객 알림 자동 발송(허용 시)'],
    promotionCriteria: [
      '30일 S1 안정 유지',
      '실현 마진율 목표 달성(예: 평균 ≥ 25%)',
      '고객 알림 오발송 0건 · 컴플라이언스 이슈 0건',
    ],
    allowBudgetedPurchase: false,
  },
  {
    stage: 3,
    key: 'profit',
    label: '수익',
    level: 'autopilot',
    opens: ['예산 한도 내 자동 구매/발주', '주문 상태 자동 전환(구매 확인 연동)'],
    promotionCriteria: [
      '별도 결제 지갑·예산 한도·정산 재검증 완료',
      '구매 어댑터 드라이런에서 발주/취소/환불 시나리오 통과',
      '수동 승격만 허용(자동 승격 금지)',
    ],
    allowBudgetedPurchase: true, // ⚠ 실행기는 별도 증분에서 격리 구현. 기본 배포에서는 미연결.
  },
]

export function stageByNumber(n: number): AutonomyStage {
  return AUTONOMY_STAGES.find((s) => s.stage === n) ?? AUTONOMY_STAGES[0]
}

export function levelForStage(n: number): AutonomyLevel {
  return stageByNumber(n).level
}
