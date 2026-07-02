# Sniper Agent OS — 독립 자율 운영 데몬

오라클 클라우드에 상주하며 Sniper 구매대행 자동화를 **정밀·단계적 완전자율**로 운영하는
독립 Node/TS 데몬. 로컬 구독 모델(Claude Code/Codex/Gemini)을 보안터널 너머로 호출한다.

> 전체 설계: [`../docs/AGENT_OS_ARCHITECTURE.md`](../docs/AGENT_OS_ARCHITECTURE.md)
> 검증된 자율 로직 재사용: [`../docs/AUTONOMY_VALIDATION.md`](../docs/AUTONOMY_VALIDATION.md)

## 무엇을 하는가

매 틱마다 `scan → reason(LLM) → decide(정책) → execute → audit` 사이클을 돈다.
- **결정론적 방어 로직**(가격 방어·일시중지·가드레일·감사)은 코드에 존재 → LLM이 죽어도 작동
- **LLM 보강 판단**(후보 심사·리스크 판정·카피)은 로컬 게이트웨이로 위임 → 없으면 우아하게 스킵
- **단계적 자율**: S0 관찰 → S1 방어 → S2 운영 → S3 수익(예산구매). 승격은 사람이 수동으로.

## 구성 파일(각 역할에 맞게)

| 파일 | 내용 |
|------|------|
| `src/config/agents.config.ts` | **역할별 에이전트 구성**(모델·주기·자율범위·보강판단) |
| `src/config/autonomy-stages.ts` | 단계 정의(S0~S3)와 승격 기준 |
| `src/reasoning/prompts.ts` | 역할별 시스템 프롬프트 + JSON 스키마 |
| `src/model/gateway-client.ts` | 로컬 게이트웨이 호출(모델 체인·타임아웃·폴백) |
| `src/runtime.ts` / `src/scheduler.ts` | 사이클 / 24-7 루프 |

구성 확인:
```bash
npm run config:print     # 역할·모델·주기·단계 매트릭스 출력
```

## 로컬 실행

```bash
cd agent-os
cp .env.example .env      # 값 채우기 (AGENT_OS_DRY_RUN=true 로 시작 권장)
npm install
npm run typecheck
npm start                 # 스케줄러 기동 (드라이런이면 실제 변경 없음)
```

초기엔 `AUTONOMY_STAGE=0` + `AGENT_OS_DRY_RUN=true` 로 며칠 관찰하며 감사로그를 검증한 뒤
단계를 수동 승격한다(설계 문서 §4 승격 기준).

## 오라클 클라우드 배포

1. OCI Always Free `VM.Standard.A1.Flex`(ARM), Ubuntu 22.04, Node 20+ 설치
2. 저장소 배포(`/opt/sniper`), `agent-os/`에서 `npm install`
3. `.env` 작성(권한 600) — Supabase 서비스롤·게이트웨이 토큰
4. Tailscale 설치 → 로컬 게이트웨이와 같은 tailnet, `MODEL_GATEWAY_URL` 설정
5. systemd 상주화: [`deploy/sniper-agent-os.service`](deploy/sniper-agent-os.service)
6. 관제: 데몬이 `agent_runs`/`automation_logs`에 기록 → 기존 `/admin/agent-command` 대시보드로 확인

## 로컬 게이트웨이

구독 CLI를 감싼 HTTP 서버 스펙: [`docs/LOCAL_GATEWAY.md`](docs/LOCAL_GATEWAY.md).
현재 증분은 **클라이언트 측**만 완성 — 게이트웨이 실제 구현은 증분 2.

## 안전

- 서비스롤 키는 서버에서만. 게이트웨이는 사설터널+토큰.
- 킬스위치(`autonomy_settings.kill_switch`)는 매 틱 선검사 — 즉시 전면 정지.
- S3(자동 구매/결제)은 예산 지갑·정산 재검증 전제로 별도 증분에서 격리 구현(현재 미연결).
