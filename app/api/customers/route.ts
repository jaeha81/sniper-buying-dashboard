import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'

interface CustomerRow {
  email: string
  name: string
  totalOrders: number
  totalSpent: number
  lastOrderAt: string
}

export async function GET() {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Admin authentication is required.' }, { status: 401 })
  }

  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ customers: [] })
    }

    const { data, error } = await supabase
      .from('orders')
      .select('customer_name, customer_email, total_price, created_at')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Aggregate by email
    const map = new Map<string, CustomerRow>()
    for (const row of data ?? []) {
      const key = row.customer_email
      const existing = map.get(key)
      if (existing) {
        existing.totalOrders += 1
        existing.totalSpent += Number(row.total_price)
        if (row.created_at > existing.lastOrderAt) {
          existing.lastOrderAt = row.created_at
        }
      } else {
        map.set(key, {
          email: row.customer_email,
          name: row.customer_name,
          totalOrders: 1,
          totalSpent: Number(row.total_price),
          lastOrderAt: row.created_at,
        })
      }
    }

    const customers = Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent)
    return NextResponse.json({ customers })
  } catch (err) {
    console.error('[GET /api/customers]', err)
    return NextResponse.json({ error: 'Failed to load customers.' }, { status: 500 })
  }
}

