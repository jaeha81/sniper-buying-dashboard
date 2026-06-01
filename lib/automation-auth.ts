export function hasValidAutomationSecret(request: Request): boolean {
  const expected = process.env.AUTOMATION_WEBHOOK_SECRET
  if (!expected) return false

  const auth = request.headers.get('authorization')
  const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null
  const headerSecret = request.headers.get('x-automation-secret')

  return bearer === expected || headerSecret === expected
}
