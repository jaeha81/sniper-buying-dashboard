import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import type { Order } from '@/lib/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPublicOrder(row: Record<string, any>) {
  return {
    id: row.id,
    orderRef: row.order_ref ?? null,
    productName: row.product_name,
    quantity: Number(row.quantity),
    totalPrice: Number(row.total_price),
    status: row.status,
    createdAt: row.created_at,
  }
}

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

interface CreateOrderBody {
  orderRef?: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  customerName: string
  customerEmail: string
  customsId?: string
  shippingAddress: string
  paymentMethod: string
  paymentKey?: string
  requests?: string
}

// ─── GET /api/orders ──────────────────────────────────────────────────────────
// Public: GET /api/orders?ref=SB-xxx  — fetch a single order by order_ref (no auth required)
// Admin:  GET /api/orders             — fetch all orders (admin auth required)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ref = searchParams.get('ref')

  // ── Public: fetch single order by order_ref ───────────────────────────────
  if (ref) {
    try {
      const supabase = await createClient()
      if (!supabase) {
        return NextResponse.json(
          { error: 'Supabase가 구성되지 않았습니다.' },
          { status: 503 }
        )
      }

      const { data, error } = await supabase
        .from('orders')
        .select('id, order_ref, product_name, quantity, total_price, status, created_at')
        .eq('order_ref', ref)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
        }
        throw error
      }

      return NextResponse.json({ order: rowToPublicOrder(data) })
    } catch (err) {
      console.error('[GET /api/orders?ref]', err)
      return NextResponse.json({ error: '주문 조회 중 오류가 발생했습니다.' }, { status: 500 })
    }
  }

  // ── Admin: fetch all orders ───────────────────────────────────────────────
  const cookieStore = await cookies()
  if (!isAdminAuthenticated(cookieStore)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
  }

  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase가 구성되지 않아 주문 목록을 불러올 수 없습니다.' },
        { status: 503 }
      )
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    const orders = (data ?? []).map(rowToOrder)
    return NextResponse.json({ orders })
  } catch (err) {
    console.error('[GET /api/orders]', err)
    return NextResponse.json({ error: '주문 목록 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body: CreateOrderBody = await request.json()

    const {
      orderRef,
      productId,
      productName,
      quantity,
      unitPrice,
      totalPrice,
      customerName,
      customerEmail,
      customsId,
      shippingAddress,
      paymentMethod,
      paymentKey,
      requests,
    } = body

    // Basic validation
    if (!productId || !productName || !customerName || !customerEmail || !shippingAddress || !paymentMethod) {
      return NextResponse.json(
        {
          error:
            'productId, productName, customerName, customerEmail, shippingAddress, paymentMethod 필드는 필수입니다.',
        },
        { status: 400 }
      )
    }
    if (!quantity || quantity < 1) {
      return NextResponse.json({ error: 'quantity는 1 이상이어야 합니다.' }, { status: 400 })
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase가 구성되지 않아 주문을 생성할 수 없습니다.' },
        { status: 503 }
      )
    }

    const row = {
      order_ref: orderRef ?? null,
      product_id: productId,
      product_name: productName,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      status: 'pending',
      customer_name: customerName,
      customer_email: customerEmail,
      customs_id: customsId ?? null,
      shipping_address: shippingAddress,
      payment_method: paymentMethod,
      payment_key: paymentKey ?? null,
      requests: requests ?? null,
    }

    const { data, error } = await supabase.from('orders').insert(row).select().single()
    if (error) throw error

    return NextResponse.json({ order: rowToOrder(data) }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/orders]', err)
    return NextResponse.json({ error: '주문 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
