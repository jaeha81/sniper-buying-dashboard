'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, Package, LayoutDashboard, Calculator } from 'lucide-react'

const navItems = [
  { href: '/products', label: '상품', icon: Package },
  { href: '/admin', label: '관리자', icon: LayoutDashboard },
  { href: '/admin/margins', label: '마진계산기', icon: Calculator },
]

export function MobileMenu() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-200"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-72 bg-luxury-surface border-l border-white/5 shadow-2xl transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/5">
          <span className="text-sm font-medium text-muted-foreground tracking-widest uppercase">메뉴</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="메뉴 닫기"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-all duration-200 group"
            >
              <Icon className="w-4 h-4 group-hover:text-gold transition-colors" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        {/* Bottom gold accent */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gold/20" />
      </div>
    </>
  )
}
