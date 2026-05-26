'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogIn, LogOut, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export function AuthNavButton() {
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) { setLoading(false); return }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase?.auth.signOut()
    router.push('/')
    router.refresh()
  }

  if (loading) return <div className="w-8 h-8" />

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-all duration-200"
      >
        <LogIn className="w-3.5 h-3.5" />
        로그인
      </Link>
    )
  }

  const displayName = user.user_metadata?.full_name ?? user.email?.split('@')[0]

  return (
    <div className="flex items-center gap-2">
      <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-lg">
        <User className="w-3.5 h-3.5 text-gold" />
        <span className="text-xs text-muted-foreground">{displayName}</span>
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-all duration-200"
        title="로그아웃"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span className="hidden md:inline">로그아웃</span>
      </button>
    </div>
  )
}
