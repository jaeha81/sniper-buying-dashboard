# 로컬 Model Gateway 스펙

오라클 데몬이 보안터널 너머로 호출하는, **로컬 PC의 구독 CLI를 감싼 얇은 HTTP 서버**의 계약.
이 문서는 인터페이스 규격이며, 실제 구현은 증분 2에서 진행한다(본 증분은 클라이언트 측만 완성).

## 계약

```
POST /v1/generate
Authorization: Bearer <MODEL_GATEWAY_TOKEN>
Content-Type: application/json

{
  "model": "claude" | "codex" | "gemini",
  "system": "역할 시스템 프롬프트(선택)",
  "prompt": "사용자 프롬프트",
  "json": { ...JSON Schema... },     // 있으면 구조화 응답 강제
  "maxTokens": 2048                    // 선택
}
```

응답:
```
200 { "text": "..." }                 // json 미지정
200 { "data": { ... } }               // json 지정 → 파싱된 객체
4xx/5xx { "error": "사유" }
```

## 모델 라우팅(구현 가이드)

| model | CLI(예시) | 비고 |
|-------|-----------|------|
| `claude` | `claude -p "<prompt>" --output-format json` | Claude Code 구독. system 은 `--append-system-prompt` 등으로 주입 |
| `codex` | `codex exec "<prompt>"` | Codex 구독. JSON 요구 시 프롬프트에 스키마 명시 |
| `gemini` | `gemini -p "<prompt>"` | Gemini CLI 구독 |

> CLI 플래그는 버전에 따라 다르므로 게이트웨이가 흡수한다. 데몬은 모델명만 안다.

## 게이트웨이가 책임지는 것

- **인증**: `MODEL_GATEWAY_TOKEN` 검증(무인증 요청 거부)
- **동시성 큐**: 구독 rate 보호를 위해 모델별 동시 실행 제한
- **타임아웃/재시도**: 데몬은 fallback 체인을 갖지만 게이트웨이도 자체 타임아웃
- **JSON 강제**: `json` 스키마가 오면 CLI 출력에서 JSON 추출·검증 후 `data` 반환
- **캐시**(선택): 동일 프롬프트 단기 캐시로 구독 소모 절감

## 노출(터널)

- **Tailscale(권장)**: PC와 오라클 VM을 같은 tailnet 에. 게이트웨이를 `tailscale serve`/`funnel` 또는 tailnet 내부 주소로 노출. ACL 로 VM만 접근 허용.
- **Cloudflare Tunnel**: `cloudflared tunnel` 로 `gateway.example.com` 발급, Access 정책으로 보호.
- 공개 인터넷 직접 노출 금지. 토큰 + 사설 네트워크 이중 방어.

## 안전

- 게이트웨이 다운/부재 시 데몬은 `GatewayUnavailable` 을 받고 **heuristic-only** 로 계속 운영한다.
  즉 LLM 정밀 판단만 스킵되고, 가격 방어·일시중지·감사 등 결정론적 로직은 유지된다.
