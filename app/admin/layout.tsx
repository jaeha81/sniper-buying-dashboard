'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Calculator,
  Package,
  Users,
  FileText,
  Zap,
  Settings,
  LogOut,
  ChevronRight,
} from 'lucide-react'

const adminNavItems = [
  { href: '/admin', label: '대시보드', icon: LayoutDashboard, exact: true },
  { href: '/admin/margins', label: '마진 계산기', icon: Calculator },
  { href: '/admin/products', label: '상품 관리', icon: Package },
  { href: '/admin/product-candidates', label: '후보 검토', icon: FileText },
  { href: '/admin/orders', label: '주문 관리', icon: Users },
  { href: '/admin/automation-logs', label: '자동화 로그', icon: Zap },
  { href: '/admin/settings', label: '설정', icon: Settings },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      const res = await fetch('/api/admin-logout', { method: 'POST' })
      if (!res.ok) throw new Error('logout failed')
      router.push('/login')
      router.refresh()
    } catch {
      setLoggingOut(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Admin sub-header */}
      <div className="border-b border-white/8 bg-luxury-surface/80 backdrop-blur-sm sticky top-16 z-40">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide h-11">
            {adminNavItems.map(({ href, label, icon: Icon, exact }) => {
              const isActive = exact ? pathname === href : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all shrink-0 ${
                    isActive
                      ? 'bg-gold/10 text-gold border border-gold/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              )
            })}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Logout */}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/5 rounded-md transition-all shrink-0 border border-transparent hover:border-red-500/20 disabled:opacity-50"
            >
              {loggingOut ? (
                <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              로그아웃
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="border-b border-white/5 bg-luxury-surface/40">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">홈</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/admin" className="hover:text-foreground transition-colors">관리자</Link>
            {pathname !== '/admin' && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span className="text-foreground">
                  {adminNavItems.find((n) => pathname.startsWith(n.href) && !n.exact)?.label ?? '페이지'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {children}
    </div>
  )
}
