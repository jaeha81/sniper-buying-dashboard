# Sniper Agent OS — 독립 자율 운영 아키텍처

> 로컬 구독 모델(Claude Code / Codex / Gemini) + 오라클 클라우드 상주 에이전트 데몬으로
> Sniper 구매대행 자동화를 **정밀·완전자율**로 운영하기 위한 시스템 설계.

확정된 3대 방향:

| 결정 | 선택 |
|------|------|
| 모델 연결 | **로컬 게이트웨이 + 보안터널** — 구독 CLI는 로컬 PC에 유지, 오라클 에이전트가 터널로 호출 |
| OS 런타임 | **독립 데몬** — 오라클에 상주하는 Node/TS 서비스(`agent-os/`), 현 Next.js 앱과 분리 |
| 수익 자율범위 | **단계적 승격** — 발굴~가격~알림 자동, 실제 구매/결제는 초기 사람 승인 후 검증되면 승격 |

---

## 1. 토폴로지

```
┌───────────────────────── 로컬 PC (항상 켜둘 필요는 없음) ─────────────────────────┐
│  구독 CLI:  claude (Claude Code) · codex · gemini                                 │
│      ▲                                                                            │
│      │ stdin/stdout (subprocess)                                                  │
│  ┌───┴───────────────┐                                                           │
│  │ Model Gateway      │  POST /v1/generate  { model, system, prompt, json }      │
│  │ (경량 HTTP 서버)   │  → CLI 라우팅 + 타임아웃 + 큐 + 캐시                       │
│  └───┬───────────────┘                                                           │
│      │ 보안터널 (Tailscale funnel 또는 Cloudflare Tunnel, mTLS/토큰)              │
└──────┼───────────────────────────────────────────────────────────────────────────┘
       │  https://gateway.<tail>.ts.net  (사설, 인증 필수)
┌──────┼───────────────────────── Oracle Cloud (상시 가동 VM) ─────────────────────┐
│  ┌───▼──────────────── agent-os 데몬 (Node/TS, systemd) ──────────────────────┐  │
│  │  Scheduler(24/7 루프)                                                        │  │
│  │    └▶ Runtime: scan → reason(LLM) → decide(정책) → execute → audit          │  │
│  │         ├ product_discovery   (모델: claude)                                │  │
│  │         ├ margin_pricing      (모델: codex)                                 │  │
│  │         ├ order_ops           (모델: gemini)                                │  │
│  │         ├ compliance_risk     (모델: claude)                                │  │
│  │         └ command_center      (모델: claude)                               │  │
│  │  GatewayClient ─┐   AutonomyEngine(lib/autonomy) ─┐   Executor(lib/agent-*) │  │
│  └─────────────────┼─────────────────────────────────┼──────────────────────────┘  │
│                    │                                 │                              │
│              (터널로 로컬 호출)              Supabase (상태·감사·큐) ◀── 기존 Next.js 앱/대시보드
└───────────────────────────────────────────────────────────────────────────────────┘
```

핵심 원칙:
- **판단(정책)과 실행(가드레일)은 클라우드 코드에 결정론적으로 존재** → LLM이 죽어도 방어 로직은 작동.
- **LLM은 "정밀 판단" 보강용** → 후보 심사·리스크 판정·카피 생성 등 heuristic으로 부족한 부분만 호출.
- **Supabase가 단일 상태원본(single source of truth)** → 데몬·대시보드·앱이 같은 테이블 공유.

---

## 2. 컴포넌트

### 2.1 로컬 Model Gateway (PC에서 실행)
구독 CLI를 HTTP로 감싼 얇은 서버. `agent-os/docs/LOCAL_GATEWAY.md` 스펙 참조.

- 엔드포인트: `POST /v1/generate` — `{ model, system, prompt, json?, maxTokens? }` → `{ text | data }`
- 모델 라우팅: `claude|codex|gemini` → 각 CLI subprocess(`claude -p`, `codex exec`, `gemini -p` 등)
- 안전장치: 요청 토큰 인증, 동시성 큐(구독 rate 보호), 타임아웃, 응답 캐시, 실패 시 fallback 모델
- 노출: Tailscale(권장, funnel + ACL) 또는 Cloudflare Tunnel. 공개 인터넷 직접 노출 금지.

> PC가 꺼져 있으면 게이트웨이 호출은 실패하지만, 데몬은 **heuristic-only 모드로 방어 로직을 계속 수행**한다(가격 방어·일시중지·감사). LLM 보강 판단만 스킵된다.

### 2.2 Oracle Agent OS 데몬 (`agent-os/`)
독립 Node/TS 서비스. systemd로 상주. 구성:

| 파일 | 역할 |
|------|------|
| `src/scheduler.ts` | 24/7 루프. 에이전트별 cadence로 틱 실행, 킬스위치 체크 |
| `src/runtime.ts` | 1회 사이클: scan → reason → decide → execute → audit (기존 `/api/agent-runs` 로직의 데몬판) |
| `src/config/agents.config.ts` | **역할별 에이전트 구성 단일 원천** (모델·cadence·자율범위·프롬프트) |
| `src/config/autonomy-stages.ts` | 단계적 승격 정의(Stage 0~3)와 승격 기준 |
| `src/model/gateway-client.ts` | 로컬 게이트웨이 호출 클라이언트(터널 URL·토큰·fallback·타임아웃) |
| `src/reasoning/prompts.ts` | 역할별 시스템 프롬프트/JSON 스키마 |
| `src/supabase.ts` | 서비스롤 Supabase 클라이언트 |
| `src/index.ts` | 엔트리포인트 |

재사용(검증 완료 모듈, `docs/AUTONOMY_VALIDATION.md`):
- `lib/agent-automation.ts` · `buildAgentAutomationPlan` — 결정론적 스캔/플랜
- `lib/autonomy.ts` · `decideTaskAutonomy` — 정책 판단
- `lib/agent-executor.ts` · `executeAgentTask` — 실제 DB 변경 + 감사

---

## 3. 역할별 에이전트 구성 (요약)

전체 정의는 [`agent-os/src/config/agents.config.ts`](../agent-os/src/config/agents.config.ts).

| 에이전트 | 미션 | 주 모델 | LLM 보강 판단 | 기본 cadence | 자율 실행(단계≥) |
|----------|------|---------|----------------|--------------|-------------------|
| `product_discovery` 발굴 | 해외 후보 수집·Sniper Score 정밀화 | claude | 후보 적합성/스코어 근거/카피 초안 | 30분 | 승인은 항상 사람 게이트 |
| `margin_pricing` 마진/가격 | 환율·비용 반영 가격·마진 방어 | codex | 재가격 시나리오 수치 검증 | 15분 | 방어적 일시중지(S1), 한도 내 재가격(S1) |
| `order_ops` 주문 | 접수·구매지시·배송추적 | gemini | 지연 주문 triage·고객 문구 | 10분 | 상태변경/구매는 S3까지 사람 |
| `compliance_risk` 리스크 | 통관·금지품목·인증 리스크 차단 | claude | 규제 판정·근거 요약 | 60분 | 비긴급 점검 기록(S2) |
| `command_center` 지휘 | 우선순위·요약·이상탐지 | claude | 일일 브리핑·알림 우선순위 | 5분 | 알림(S2, 허용 시) |

모델 선택 근거: 발굴/리스크/지휘는 **깊은 추론(claude)**, 가격은 **수치 정밀(codex)**, 대량·저비용 주문 triage는 **gemini**. 모두 `agents.config.ts`에서 교체 가능하며 fallback 체인을 가진다.

---

## 4. 단계적 자율 승격 (수익 자율범위)

전체 정의는 [`agent-os/src/config/autonomy-stages.ts`](../agent-os/src/config/autonomy-stages.ts).

| 단계 | autonomy_level | 자동 실행 범위 | 승격 기준(예시) |
|------|----------------|----------------|------------------|
| **S0 관찰** | `manual` | 없음(전부 제안). 베이스라인 수집 | 7일 무사고 스캔 + 감사로그 정합 |
| **S1 방어** | `assisted` | 저마진 일시중지, 한도 내 재가격 | 14일간 자율 실행 실패율 <1%, 마진 방어 오탐 0 |
| **S2 운영** | `autopilot` | + 고득점 승인, 리스크 점검, 고객 알림 | 30일 S1 안정 + 실현마진 목표 달성 |
| **S3 수익** | `autopilot` + 예산구매 | + 예산 한도 내 자동 구매/발주 | 별도 지갑·한도·정산 검증 후 수동 승격만 |

- 승격은 **자동 상향 금지, 사람이 수동 승격**. 강등(킬스위치·저성과)은 자동 허용.
- S3(자동 구매/결제)은 실제 금전 리스크가 커서 별도 결제 어댑터·예산 지갑·정산 재검증을 전제로 하며, 본 증분에서는 **설계만** 두고 실행기는 비활성.

---

## 5. 배포 (오라클 클라우드)

1. **VM**: OCI Always Free `VM.Standard.A1.Flex`(ARM) 1~2 OCPU / 6~12GB. Ubuntu 22.04.
2. **런타임**: Node 20+, `npm i`(루트) → `agent-os` 실행. Node 22면 `tsx`로 직접 실행 가능.
3. **상주화**: `systemd` 유닛(`agent-os/deploy/sniper-agent-os.service` 참조)으로 재시작·로그 관리.
4. **터널**: VM에 Tailscale 설치 → 로컬 게이트웨이와 같은 tailnet. `MODEL_GATEWAY_URL`에 게이트웨이 MagicDNS 주소.
5. **시크릿**: `.env`(600 권한) 또는 OCI Vault. Supabase 서비스롤·게이트웨이 토큰·자동화 시크릿.
6. **관측**: 데몬 → `automation_logs`/`agent_runs` 기록 → 기존 `/admin/agent-command` 대시보드로 관제. Slack 알림 병행.

전체 절차는 [`agent-os/README.md`](../agent-os/README.md).

---

## 6. 보안·안전

- 게이트웨이는 **사설 터널 + 토큰**만 허용(공개 노출·API키 하드코딩 금지). CA는 프록시 번들 사용.
- 데몬은 **서비스롤 키를 서버에서만** 사용(브라우저 노출 금지) — 기존 앱 안전규칙과 동일.
- 모든 자율 실행은 `executed_by='autonomy'` + `decision_reason` + `execution_result`로 감사.
- **킬스위치**(`autonomy_settings.kill_switch`)는 레벨/단계 무관 즉시 전면 정지 — 데몬 매 틱 선검사.
- 가드레일(일일 한도·가격 변동폭·마진 방어선·승인 스코어)은 코드에 결정론적으로 존재.

---

## 7. 로드맵(증분)

- [x] **증분 1 (본 커밋)**: 아키텍처 확정 + `agent-os/` 데몬 스캐폴드 + 역할별 구성 + 게이트웨이 클라이언트 + 단계 정의
- [ ] 증분 2: 로컬 Model Gateway 실제 구현(CLI subprocess 라우팅) + 터널 연동 E2E
- [ ] 증분 3: LLM 보강 판단을 각 에이전트 스캔에 결합(후보 심사·리스크 판정)
- [ ] 증분 4: 오라클 systemd 배포 + 대시보드 관제 연동 + S0→S1 실운영
- [ ] 증분 5: S3 결제/구매 어댑터(예산 지갑·정산 재검증) 설계·격리 구현
