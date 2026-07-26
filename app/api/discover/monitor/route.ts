import { NextResponse } from 'next/server'
import { hasValidAutomationSecret } from '@/lib/automation-auth'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { runMarginMonitor } from '@/lib/margin-monitor'

async function isAuthorized(request: Request) {
  if (hasValidAutomationSecret(request)) return true
  return isAdminAuthenticated()
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let currentRate = 1350
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const rateRes = await fetch(`${siteUrl}/api/exchange-rate`)
    if (rateRes.ok) {
      const rateJson = await rateRes.json()
      if (rateJson.rate) currentRate = rateJson.rate
    }
  } catch {
    // fallback
  }

  try {
    const result = await runMarginMonitor(currentRate)
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[POST /api/discover/monitor]', err)
    return NextResponse.json({ error: 'Monitor failed' }, { status: 500 })
  }
}
