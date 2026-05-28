import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import type { Order } from '@/lib/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToOrder(row: Record<string, any>): Order {
  return {
    id: row.id,
    orderRef: row.order_ref ?? null,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    totalPrice: Number(row.total_price),
    status: row.status,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    shippingAddress: row.shipping_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

type OrderStatus = Order['status']

const VALID_STATUSES: OrderStatus[] = ['pending', 'ordered', 'shipping', 'delivered', 'cancelled']

// ─── GET /api/orders/[id] ─────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase가 구성되지 않아 주문 정보를 불러올 수 없습니다.' },
        { status: 503 }
      )
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ order: rowToOrder(data) })
  } catch (err) {
    console.error(`[GET /api/orders/${id}]`, err)
    return NextResponse.json({ error: '주문 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

// ─── PUT /api/orders/[id] ─────────────────────────────────────────────────────

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  try {
    const { status }: { status: OrderStatus } = await request.json()

    if (!status) {
      return NextResponse.json({ error: 'status 필드는 필수입니다.' }, { status: 400 })
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          error: `status는 다음 값 중 하나여야 합니다: ${VALID_STATUSES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase가 구성되지 않아 주문을 수정할 수 없습니다.' },
        { status: 503 }
      )
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ order: rowToOrder(data) })
  } catch (err) {
    console.error(`[PUT /api/orders/${id}]`, err)
    return NextResponse.json({ error: '주문 상태 변경 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
