import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 환율 조회 + 이력 저장.
//
// 이전 구현은 외부 API가 실패하면 상수 1350을 성공 응답과 사실상 구분 없이
// 돌려줬다(updatedAt: null만 차이). 마진 계산이 그 값을 실측 환율처럼 쓰면서
// 원가가 조용히 틀어졌고, 과거 계산을 재현할 방법도 없었다.
//
// 이제 응답에 dataQuality를 명시하고(지시서 §6 REAL/DEMO/ESTIMATE),
// 조회 결과를 fx_snapshots에 남긴다.

const FALLBACK_RATE = 1350
const EXCHANGE_API_URL = 'https://open.er-api.com/v6/latest/USD'

export const revalidate = 3600 // 1시간 캐시

export type FxDataQuality = 'REAL' | 'ESTIMATE'

interface FxResult {
  rate: number
  dataQuality: FxDataQuality
  capturedAt: string
  source: string
  /** 외부 API가 보고한 갱신 시각. 폴백일 때는 null. */
  updatedAt: string | null
}

/**
 * 스냅샷 저장. 실패해도 환율 응답은 그대로 나가야 하므로 삼킨다.
 * 폴백값(ESTIMATE)도 저장한다 — 언제 외부 API가 죽어 있었는지가
 * 나중에 마진 오차를 설명하는 근거가 된다.
 */
async function recordSnapshot(result: FxResult): Promise<void> {
  const supabase = createServiceClient()
  if (!supabase) return

  const { error } = await supabase.from('fx_snapshots').insert({
    base_currency: 'USD',
    quote_currency: 'KRW',
    rate: result.rate,
    data_quality: result.dataQuality,
    source: result.source,
    captured_at: result.capturedAt,
  })

  if (error) {
    // 008 마이그레이션 미적용 시 여기로 온다.
    console.error('[fx] 스냅샷 저장 실패:', error.message)
  }
}

export async function GET() {
  const capturedAt = new Date().toISOString()

  let result: FxResult

  try {
    const res = await fetch(EXCHANGE_API_URL, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`환율 API 응답 코드 ${res.status}`)

    const json = await res.json()
    const rate: unknown = json?.rates?.KRW

    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error('환율 API 응답 형식이 예상과 다릅니다.')
    }

    result = {
      rate: Math.round(rate),
      dataQuality: 'REAL',
      capturedAt,
      source: EXCHANGE_API_URL,
      updatedAt: json?.time_last_update_utc ?? null,
    }
  } catch (err) {
    console.error('[GET /api/exchange-rate]', err)

    result = {
      rate: FALLBACK_RATE,
      // 실측이 아니라 상수다. 호출부가 이 사실을 알아야 한다.
      dataQuality: 'ESTIMATE',
      capturedAt,
      source: 'fallback-constant',
      updatedAt: null,
    }
  }

  await recordSnapshot(result)

  return NextResponse.json(result, {
    // ESTIMATE를 1시간 캐시에 태우면 외부 API가 복구돼도 계속 상수가 나간다.
    headers: result.dataQuality === 'REAL' ? {} : { 'Cache-Control': 'no-store' },
  })
}
