// Admin notification utility — Slack webhook (fire-and-forget)
// Set SLACK_WEBHOOK_URL in env to enable. Silently no-ops if unset.

export type NotifyLevel = 'info' | 'warning' | 'critical'

const LEVEL_COLORS: Record<NotifyLevel, string> = {
  info: '#36A64F',
  warning: '#FFA500',
  critical: '#FF0000',
}

const LEVEL_LABELS: Record<NotifyLevel, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
}

export async function notifyAdmin(
  message: string,
  level: NotifyLevel = 'info',
  context?: Record<string, unknown>
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return

  const fields = context
    ? Object.entries(context).map(([title, value]) => ({
        title,
        value: String(value),
        short: true,
      }))
    : []

  const body = {
    attachments: [
      {
        color: LEVEL_COLORS[level],
        title: `${LEVEL_LABELS[level]} Sniper Dashboard — ${level.toUpperCase()}`,
        text: message,
        fields,
        footer: 'sniper-buying-dashboard',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error('[notifyAdmin] Slack webhook failed:', err)
  })
}
