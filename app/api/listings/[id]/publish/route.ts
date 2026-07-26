import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { clientIpFrom, recordAudit } from '@/lib/audit'
import { createServiceClient } from '@/lib/supabase/server'
import { checkGate } from '@/lib/safety-gate'
import { loadSafetyPolicy } from '@/lib/safety-store'
import {
  assertListingTransition,
  checkPublishPrerequisites,
  ListingTransitionError,
  type ListingStatus,
} from '@/lib/listing-engine'
import { DEFAULT_THRESHOLDS } from '@/lib/score-engine'
import { notifyAdmin } from '@/lib/notify'

// POST /api/listings/[id]/publish — 지시서 §14·§18
//
// 여기가 "승인 전 외부 등록이 실행되지 않는다"의 마지막 관문이다.
// 세 겹으로 막는다:
//   1. 상태 전이 규칙 (approved에서만 publishing으로)
//   2. 사전 조건 재확인 (승인·판정·콘텐츠·마진)
//   3. 안전 게이트 (비상정지·채널 차단·환경)
//
// 실제 채널 API 호출은 Make.com 시나리오가 담당한다. 이 라우트는
// publishing 상태로 옮기고 Make를 트리거할 Task를 만든다 — 앱이 상태를
// 소유하고 Make는 worker라는 지시서 §12 구조를 따른다.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  if (session.role !== 'owner') {
    return NextResponse.json({ error: '등록 실행 권한이 없습니다.' }, { status: 403 })
  }

  const { id } = await params

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase가 구성되지 않았습니다.' }, { status: 503 })
  }

  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!listing) {
    return NextResponse.json({ error: '등록 항목을 찾을 수 없습니다.' }, { status: 404 })
  }

  // ── 1겹: 상태 전이 ──────────────────────────────────────────
  try {
    assertListingTransition(listing.status as ListingStatus, 'publishing')
  } catch (err) {
    if (err instanceof ListingTransitionError) {
      return NextResponse.json(
        {
          error: err.message,
          hint:
            listing.status === 'draft' || listing.status === 'pending_approval'
              ? '승인을 먼저 통과해야 합니다.'
              : undefined,
        },
        { status: 409 }
      )
    }
    throw err
  }

  // ── 2겹: 사전 조건 재확인 ───────────────────────────────────
  // 승인 시점 이후 원가가 올라 마진이 무너졌을 수 있다. 등록은
  // 비가역이므로 실행 직전에 전부 다시 본다.
  const [approvalResult, contentResult, decisionResult, riskResult, marginResult] =
    await Promise.all([
      listing.approval_id
        ? supabase.from('approvals').select('id, status').eq('id', listing.approval_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('content_assets')
        .select('asset_type, reviewed')
        .eq('product_id', listing.product_id),
      listing.bucky_decision_id
        ? supabase
            .from('bucky_decisions')
            .select('verdict')
            .eq('id', listing.bucky_decision_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('risk_checks')
        .select('status')
        .eq('product_id', listing.product_id)
        .in('status', ['pending', 'blocked', 'needs_review']),
      supabase
        .from('margin_calculations')
        .select('expected_net_margin_pct')
        .eq('product_id', listing.product_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  const assets = contentResult.data ?? []
  const titles = assets.filter((a) => a.asset_type === 'title')
  const descriptions = assets.filter((a) => a.asset_type === 'description')

  const blocks = checkPublishPrerequisites({
    approved: approvalResult.data?.status === 'approved',
    approvalId: listing.approval_id ?? null,
    buckyRecommended: decisionResult.data?.verdict === 'recommend',
    openHardBlocks: (riskResult.data ?? []).length,
    hasTitle: titles.length > 0,
    hasDescription: descriptions.length > 0,
    contentReviewed: titles.some((a) => a.reviewed) && descriptions.some((a) => a.reviewed),
    listedPrice: Number(listing.listed_price),
    expectedNetMarginPct: Number(marginResult.data?.expected_net_margin_pct ?? -100),
    minNetMarginPct: DEFAULT_THRESHOLDS.minNetMarginPct,
  })

  if (blocks.length > 0) {
    await recordAudit({
      actorType: 'owner',
      actorId: session.userId,
      action: 'listing.publish_blocked',
      entityType: 'listing',
      entityId: id,
      reason: blocks.map((b) => b.code).join(', '),
      after: { blocks },
      ip: clientIpFrom(request),
    })

    return NextResponse.json(
      { error: '등록 사전 조건을 통과하지 못했습니다.', blocks },
      { status: 422 }
    )
  }

  // ── 3겹: 안전 게이트 ────────────────────────────────────────
  const { policy } = await loadSafetyPolicy()
  const gate = checkGate('channel_publish', policy)

  if (!gate.allowed) {
    return NextResponse.json({ error: gate.message, reason: gate.reason }, { status: 423 })
  }

  // ── publishing으로 전환 ─────────────────────────────────────
  const { error: updateError } = await supabase
    .from('listings')
    .update({ status: 'publishing', error_message: null })
    .eq('id', id)
    // 낙관적 잠금 — 두 요청이 동시에 들어와도 한 번만 진행한다.
    .eq('status', listing.status)

  if (updateError) {
    return NextResponse.json(
      { error: '등록 상태를 변경할 수 없습니다. 다시 시도해주세요.' },
      { status: 409 }
    )
  }

  await supabase.from('listing_events').insert({
    listing_id: id,
    from_status: listing.status,
    to_status: 'publishing',
    actor_type: 'owner',
    actor_id: session.userId,
    reason: '소유자 승인 후 등록 실행',
    detail: { channel: listing.channel, listedPrice: listing.listed_price },
  })

  // Make.com 시나리오가 실제 채널 API를 호출한다. 결과는
  // POST /api/webhooks/make/listing_publish 로 돌아온다.
  const { data: task } = await supabase
    .from('tasks')
    .insert({
      type: 'publish_listing',
      entity_type: 'listing',
      entity_id: id,
      status: 'queued',
      priority: 2,
      input: {
        listingId: id,
        productId: listing.product_id,
        channel: listing.channel,
        listedPrice: listing.listed_price,
        approvalId: listing.approval_id,
      },
      requires_approval: false,
      idempotency_key: `publish_listing:listing:${id}`,
      attempt: 0,
      max_attempts: 3,
    })
    .select('id')
    .single()

  await recordAudit({
    actorType: 'owner',
    actorId: session.userId,
    action: 'listing.publish',
    entityType: 'listing',
    entityId: id,
    before: { status: listing.status },
    after: {
      status: 'publishing',
      channel: listing.channel,
      listedPrice: Number(listing.listed_price),
      approvalId: listing.approval_id,
      taskId: task?.id ?? null,
    },
    reason: '승인 통과 후 채널 등록 실행',
    ip: clientIpFrom(request),
    userAgent: request.headers.get('user-agent'),
  })

  await notifyAdmin(
    `채널 등록 실행: ${listing.channel} · ${listing.product_id}`,
    'info',
    { 등록가: Number(listing.listed_price).toLocaleString(), 승인: listing.approval_id ?? '-' }
  )

  return NextResponse.json({
    ok: true,
    listingId: id,
    status: 'publishing',
    taskId: task?.id ?? null,
    note: '채널 API 호출은 Make.com 시나리오가 수행하며 결과가 웹훅으로 돌아옵니다.',
  })
}
