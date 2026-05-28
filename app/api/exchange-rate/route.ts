import { NextResponse } from 'next/server'

const FALLBACK_RATE = 1350
const EXCHANGE_API_URL = 'https://open.er-api.com/v6/latest/USD'

export const revalidate = 3600 // Cache for 1 hour

export async function GET() {
  try {
    const res = await fetch(EXCHANGE_API_URL, {
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      throw new Error(`Exchange rate API responded with ${res.status}`)
    }

    const json = await res.json()

    // open.er-api.com returns { rates: { KRW: number }, time_last_update_utc: string, ... }
    const rate: number = json?.rates?.KRW
    const updatedAt: string = json?.time_last_update_utc ?? null

    if (!rate || typeof rate !== 'number') {
      throw new Error('Unexpected response shape from exchange rate API')
    }

    return NextResponse.json({ rate: Math.round(rate), updatedAt })
  } catch (err) {
    console.error('[GET /api/exchange-rate]', err)
    return NextResponse.json({ rate: FALLBACK_RATE, updatedAt: null })
  }
}
