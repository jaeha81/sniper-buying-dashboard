import type { cookies } from 'next/headers'

type CookieStore = Awaited<ReturnType<typeof cookies>>

export function getAdminSessionToken(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')
  return secret
}

export function isAdminAuthenticated(cookieStore: CookieStore): boolean {
  const token = cookieStore.get('admin_session')?.value
  if (!token) return false
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) return false
  return token === secret
}
