# 실제 완전 자동화 검증 리포트 (Autonomy Validation)

자율 운영 엔진(`docs/AUTONOMY_ENGINE.md`)이 문서상 설계대로 **실제로 동작하는지**를
런타임에서 end-to-end로 검증한 결과입니다. 프로덕션 모듈을 그대로 임포트해
`scan → decide → execute` 루프를 구동하고, 인메모리 Supabase 더블로 실제 DB 변경을 관찰합니다.

- 검증 하네스: [`scripts/validate-automation.ts`](../scripts/validate-automation.ts)
- 실행: `npm run validate:automation`
- 마지막 검증일: 2026-07-02 · 결과: **PASS 26 / FAIL 0**

---

## 무엇을 검증했나

프로덕션 코드를 그대로 사용합니다 (재구현 없음):

| 모듈 | 역할 |
|------|------|
| `lib/agent-automation.ts` · `buildAgentAutomationPlan` | 스캔 → 태스크/파인딩 생성 |
| `lib/autonomy.ts` · `decideTaskAutonomy` | 정책 기반 자율 실행 판단 |
| `lib/agent-executor.ts` · `executeAgentTask` / `markTaskExecuted` | 실제 DB 변경 + 감사 기록 |

`app/api/agent-runs/route.ts`의 자율 실행 패스를 동일하게 재현하여,
승인 없이 상품이 실제로 pause / reprice / approve 되는지와 가드레일이 실제로 차단하는지를 확인합니다.

---

## 검증 항목 (26 checks)

### 1. 스캔 플랜
- 5개 전문 에이전트 실행 기록 생성
- 크리티컬 저마진(8%) → `pause_product` 태스크
- 회복 가능 저마진(13%) → `update_price` 태스크(목표 마진 20% 복원 제안가 포함)
- 고득점 후보(92) → `review_candidate` 태스크

### 2. 자율 레벨별 동작
| 레벨 | 검증 결과 |
|------|-----------|
| `manual` | 자율 실행 **0건**, 전 태스크 승인 대기, 상품 상태 불변 |
| `assisted` | 저마진 상품 **자동 일시중지**(DB: active→paused), 한도 내 **가격 자동 상향**(DB 반영), 발굴 게이트는 사람 |
| `autopilot` | 방어적 액션 자동 유지, `approve_product` 스코어 임계값 게이트 동작 (92≥80 자동 승인 → DB active, 71<80 보류) |

### 3. 가드레일 (실제 차단 확인)
- **킬스위치 ON** → 레벨과 무관하게 자율 실행 0건, 전 태스크 보류
- **일일 한도 도달**(24h 30건) → 추가 자율 실행 0건
- **가격 변동 폭 초과**(한도 ±1%로 축소) → 가격 조정 자동 실행 차단 + 보류 전환, DB 가격 불변

### 4. 감사 추적
- `executeAgentTask` 결과 `{ ok, action, detail }` 구조 확인
- `markTaskExecuted`가 `executed_by='autonomy'` + `execution_result`를 기록

### 5. 빌드
- `next build` — 45개 라우트 전부 컴파일 성공, 타입 오류 0

---

## 발견 사항 (검증 중 확인된 갭)

**autopilot의 "고득점 상품 자동 승인"(`approve_product`)은 자율 파이프라인에서 도달 불가.**

- `decideTaskAutonomy` / `executeAgentTask`에는 스코어 임계값 기반 자동 승인 로직이 완전히 구현되어 있고
  단위 검증(항목 3b)에서 정상 동작한다.
- 그러나 스캐너(`buildAgentAutomationPlan`)는 고득점 후보에 대해 **`review_candidate`만** 생성한다
  (자율 매트릭스상 "발굴 게이트는 항상 사람"). `approve_product` 태스크를 만드는 유일한 경로는
  관리자가 `/admin/product-candidates`에서 `/api/agent-tasks`로 직접 생성하는 것뿐이며,
  이 경로는 자율 실행 패스(`decideTaskAutonomy`)를 **호출하지 않고** `pending`으로만 남긴다.
- 결론: `approve_product` 자동 승인은 구현·가드레일은 갖췄으나 **자동 트리거되는 생산자가 없다.**
  이는 "발굴 승인은 항상 사람"이라는 안전 설계와 일치하지만, `docs/AUTONOMY_ENGINE.md`의
  "autopilot 자동 승인" 서술과는 어긋난다.

> 상품 승인은 비용·컴플라이언스 영향이 있어, 이 갭을 "자동 승인 활성화"로 메울지
> "문서를 사람 게이트로 정정"할지는 운영 정책 결정 사항으로 남겨둔다.

---

## 재현 방법

```bash
npm install
npm run validate:automation   # 런타임 자율 루프 26개 항목 검증
npm run build                 # 45개 라우트 타입/빌드 검증
```
