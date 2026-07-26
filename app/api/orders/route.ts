import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { clientIpFrom, recordAudit } from '@/lib/audit'
import type { Order } from '@/lib/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** 품목당 수량 상한. 대량 주문은 수기로 처리한다. */
const MAX_ORDER_QUANTITY = 50

/** 한 번에 주문 가능한 상품 종류 수 상한. */
const MAX_ORDER_LINES = 20

const ALLOWED_PAYMENT_METHODS = ['card', 'transfer', 'kakaopay']

/** 서버 생성 주문번호. 시각 기반이라 예측 가능하던 클라이언트 방식을 대체한다. */
function generateOrderRef(): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()
  return `SB-${random}`
}

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

interface OrderLineInput {
  productId: string
  quantity: number
}

/**
 * 주문 생성 요청.
 *
 * 금액 필드가 없다는 점이 중요하다. 이전 버전은 unitPrice/totalPrice를
 * 클라이언트에서 받아 그대로 저장했고, 요청을 조작하면 임의 금액으로
 * 주문이 만들어졌다. 이제 상품 ID와 수량만 받고 금액은 서버가 계산한다.
 */
interface CreateOrderBody {
  /** 장바구니 품목. 단건 주문은 productId/quantity로 보내도 된다. */
  items?: OrderLineInput[]
  productId?: string
  quantity?: number
  customerName: string
  customerEmail: string
  customsId?: string
  shippingAddress: string
  paymentMethod: string
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
  if (!(await isAdminAuthenticated())) {
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
      customerName,
      customerEmail,
      customsId,
      shippingAddress,
      paymentMethod,
      requests,
    } = body

    // ── 클라이언트가 보낸 금액은 신뢰하지 않는다 ──────────────────────────
    // 이전에는 body의 unitPrice/totalPrice를 그대로 저장했다. 브라우저에서
    // 요청을 조작하면 임의 금액으로 주문이 만들어졌다. 아래에서 상품을
    // 조회해 서버가 직접 계산한다.

    if (!customerName || !customerEmail || !shippingAddress || !paymentMethod) {
      return NextResponse.json(
        {
          error:
            'customerName, customerEmail, shippingAddress, paymentMethod 필드는 필수입니다.',
        },
        { status: 400 }
      )
    }

    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: '지원하지 않는 결제 수단입니다.' }, { status: 400 })
    }

    // 단건(productId/quantity)과 다건(items) 모두 받는다.
    const rawLines: OrderLineInput[] =
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : body.productId
          ? [{ productId: body.productId, quantity: body.quantity ?? 1 }]
          : []

    if (rawLines.length === 0) {
      return NextResponse.json(
        { error: '주문할 상품이 없습니다. items 또는 productId가 필요합니다.' },
        { status: 400 }
      )
    }

    if (rawLines.length > MAX_ORDER_LINES) {
      return NextResponse.json(
        { error: `한 번에 주문할 수 있는 상품은 최대 ${MAX_ORDER_LINES}종입니다.` },
        { status: 400 }
      )
    }

    for (const line of rawLines) {
      if (!line?.productId || typeof line.productId !== 'string') {
        return NextResponse.json({ error: 'productId가 올바르지 않습니다.' }, { status: 400 })
      }
      if (
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > MAX_ORDER_QUANTITY
      ) {
        return NextResponse.json(
          { error: `quantity는 1 이상 ${MAX_ORDER_QUANTITY} 이하의 정수여야 합니다.` },
          { status: 400 }
        )
      }
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase가 구성되지 않아 주문을 생성할 수 없습니다.' },
        { status: 503 }
      )
    }

    // 판매 중인 상품만 주문할 수 있다. 가격도 여기서 가져온다.
    const productIds = Array.from(new Set(rawLines.map((l) => l.productId)))
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, name, status, domestic_expected_price')
      .in('id', productIds)

    if (productError) throw productError

    const productById = new Map((products ?? []).map((p) => [p.id, p]))

    // 이전 버전은 장바구니 다건을 product_id: 'multi' 한 행으로 뭉갰다.
    // 실재하지 않는 상품 ID라 어떤 상품이 팔렸는지 알 수 없었다.
    // 이제 품목마다 한 행씩 만든다. 정식 order_items 도입(P2) 전까지의 구조다.
    const rows = []
    for (const line of rawLines) {
      const product = productById.get(line.productId)

      if (!product) {
        return NextResponse.json(
          { error: `존재하지 않는 상품입니다: ${line.productId}` },
          { status: 404 }
        )
      }

      if (product.status !== 'active') {
        return NextResponse.json(
          { error: `현재 판매 중이 아닌 상품입니다: ${product.name}` },
          { status: 409 }
        )
      }

      const unitPrice = Number(product.domestic_expected_price)
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return NextResponse.json(
          { error: `상품 가격이 설정되지 않았습니다: ${product.name}` },
          { status: 409 }
        )
      }

      rows.push({
        // 주문번호도 서버가 만든다. 클라이언트가 보내던 `SB-${Date.now()}`는
        // 예측·충돌이 가능했다.
        order_ref: generateOrderRef(),
        product_id: product.id,
        product_name: product.name,
        quantity: line.quantity,
        unit_price: unitPrice,
        total_price: unitPrice * line.quantity,
        status: 'pending',
        // Toss 서버 승인(POST /v1/payments/confirm) 단계가 아직 없다.
        // 실제 수납 여부를 확인할 수 없으므로 미승인으로 표시하고,
        // 수익 집계에서 제외되게 한다.
        payment_status: 'unconfirmed',
        customer_name: customerName,
        customer_email: customerEmail,
        customs_id: customsId ?? null,
        shipping_address: shippingAddress,
        payment_method: paymentMethod,
        // payment_key는 승인 라우트가 생기기 전까지 서버가 채우지 않는다.
        payment_key: null,
        requests: requests ?? null,
      })
    }

    const { data, error } = await supabase.from('orders').insert(rows).select()
    if (error) throw error

    const created = data ?? []
    const totalAmount = created.reduce((sum, row) => sum + Number(row.total_price), 0)
    const primaryRef = created[0]?.order_ref ?? null

    await recordAudit({
      actorType: 'anonymous',
      action: 'order.create',
      entityType: 'order',
      entityId: primaryRef,
      after: {
        orderRefs: created.map((r) => r.order_ref),
        lines: rows.map((r) => ({
          productId: r.product_id,
          quantity: r.quantity,
          unitPrice: r.unit_price,
        })),
        totalAmount,
        paymentStatus: 'unconfirmed',
      },
      reason: '고객 체크아웃 (서버 가격 재계산)',
      ip: clientIpFrom(request),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(
      {
        orders: created.map(rowToOrder),
        // 결제창에 넘길 값은 서버가 계산한 것만 쓴다.
        orderRef: primaryRef,
        totalAmount,
        // 승인 라우트가 없으므로 아직 수납되지 않는다는 사실을 응답에 남긴다.
        paymentStatus: 'unconfirmed',
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[POST /api/orders]', err)
    return NextResponse.json({ error: '주문 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
