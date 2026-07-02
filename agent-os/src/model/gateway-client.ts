// ============================================================================
// Model Gateway 클라이언트 — 오라클 데몬이 보안터널 너머 로컬 구독 CLI를 호출한다.
//
// 로컬 게이트웨이 계약(POST /v1/generate):
//   요청  { model, system?, prompt, json?(스키마), maxTokens? }
//   응답  { text }            (json 미지정)
//         { data }            (json 지정 시 파싱된 객체)
//         { error }           (실패)
//
// 게이트웨이가 없거나(URL 미설정) 다운되면 GatewayUnavailable 을 던져,
// 호출부가 heuristic-only 로 우아하게 폴백하도록 한다.
// ============================================================================

import type { GatewayModel } from '../config/agents.config'

export class GatewayUnavailable extends Error {}

export interface GatewayClientOptions {
  url: string | null
  token: string | null
  timeoutMs: number
}

export interface GenerateParams {
  /** 시도할 모델 체인(primary→fallback). 첫 성공을 반환 */
  models: GatewayModel[]
  system?: string
  prompt: string
  /** JSON 응답을 원하면 JSON Schema 전달 → data 로 파싱 반환 */
  json?: Record<string, unknown>
  maxTokens?: number
}

export interface GenerateResult<T = unknown> {
  model: GatewayModel
  text?: string
  data?: T
}

export class GatewayClient {
  constructor(private readonly opts: GatewayClientOptions) {}

  get enabled(): boolean {
    return !!this.opts.url
  }

  /** 모델 체인을 순서대로 시도해 첫 성공을 반환. 전부 실패하면 GatewayUnavailable. */
  async generate<T = unknown>(params: GenerateParams): Promise<GenerateResult<T>> {
    if (!this.opts.url) {
      throw new GatewayUnavailable('MODEL_GATEWAY_URL 미설정 — heuristic-only 모드')
    }
    const errors: string[] = []
    for (const model of params.models) {
      try {
        return await this.call<T>(model, params)
      } catch (err) {
        errors.push(`${model}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    throw new GatewayUnavailable(`전 모델 실패 — ${errors.join(' | ')}`)
  }

  private async call<T>(model: GatewayModel, params: GenerateParams): Promise<GenerateResult<T>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs)
    try {
      const res = await fetch(`${this.opts.url}/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.opts.token ? { Authorization: `Bearer ${this.opts.token}` } : {}),
        },
        body: JSON.stringify({
          model,
          system: params.system,
          prompt: params.prompt,
          json: params.json,
          maxTokens: params.maxTokens,
        }),
        signal: controller.signal,
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const body = (await res.json()) as { text?: string; data?: T; error?: string }
      if (body.error) throw new Error(body.error)
      return { model, text: body.text, data: body.data }
    } finally {
      clearTimeout(timer)
    }
  }
}
