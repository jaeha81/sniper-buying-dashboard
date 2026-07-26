import { describe, it, expect } from 'vitest'
import {
  checkGate,
  assertGate,
  SafetyGateError,
  currentEnvironment,
  SIDE_EFFECT_CHANNELS,
  PREVIEW_ALLOWED_CHANNELS,
  DEFAULT_SAFETY_POLICY,
  type SafetyPolicy,
} from './safety-gate'

const open: SafetyPolicy = {
  emergencyStop: false,
  disabledChannels: [],
  dailyBudgetUsd: 0,
  spentTodayUsd: 0,
}

describe('전역 비상정지', () => {
  it('모든 채널을 막는다', () => {
    const policy = { ...open, emergencyStop: true }
    for (const channel of SIDE_EFFECT_CHANNELS) {
      const d = checkGate(channel, policy, 'production')
      expect(d.allowed).toBe(false)
      if (!d.allowed) expect(d.reason).toBe('emergency_stop')
    }
  })

  it('Preview에서 허용되는 채널조차 막는다', () => {
    const d = checkGate('external_fetch', { ...open, emergencyStop: true }, 'preview')
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('emergency_stop')
  })

  it('예산 초과보다 먼저 걸린다', () => {
    // "정지를 눌렀는데 예산 메시지가 나왔다"가 되면 안 된다.
    const d = checkGate(
      'channel_publish',
      { ...open, emergencyStop: true, dailyBudgetUsd: 1, spentTodayUsd: 100 },
      'production'
    )
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('emergency_stop')
  })
})

describe('채널별 Kill Switch', () => {
  it('지정한 채널만 막는다', () => {
    const policy = { ...open, disabledChannels: ['customer_notice' as const] }

    expect(checkGate('customer_notice', policy, 'production').allowed).toBe(false)
    expect(checkGate('channel_publish', policy, 'production').allowed).toBe(true)
  })

  it('차단 사유를 채널 이름으로 알려준다', () => {
    const d = checkGate('payment', { ...open, disabledChannels: ['payment'] }, 'production')
    expect(d.allowed).toBe(false)
    if (!d.allowed) {
      expect(d.reason).toBe('channel_disabled')
      expect(d.message).toContain('결제·환불')
    }
  })
})

describe('Preview 환경 차단 — 지시서 §18', () => {
  it('프로덕션에서는 모든 채널이 열린다', () => {
    for (const channel of SIDE_EFFECT_CHANNELS) {
      expect(checkGate(channel, open, 'production').allowed).toBe(true)
    }
  })

  it('Preview에서 외부 실동작을 막는다', () => {
    const blocked = SIDE_EFFECT_CHANNELS.filter((c) => !PREVIEW_ALLOWED_CHANNELS.includes(c))
    expect(blocked.length).toBeGreaterThan(0)

    for (const channel of blocked) {
      const d = checkGate(channel, open, 'preview')
      expect(d.allowed).toBe(false)
      if (!d.allowed) expect(d.reason).toBe('non_production_environment')
    }
  })

  it('Preview에서 채널 등록·고객 알림·결제를 확실히 막는다', () => {
    for (const channel of ['channel_publish', 'customer_notice', 'payment'] as const) {
      expect(checkGate(channel, open, 'preview').allowed).toBe(false)
    }
  })

  it('Preview에서도 외부 조회는 허용한다 — 발굴 파이프라인 테스트용', () => {
    expect(checkGate('external_fetch', open, 'preview').allowed).toBe(true)
  })

  it('개발 환경도 Preview와 같게 취급한다', () => {
    expect(checkGate('channel_publish', open, 'development').allowed).toBe(false)
    expect(checkGate('external_fetch', open, 'development').allowed).toBe(true)
  })
})

describe('일일 비용 한도', () => {
  it('한도에 닿으면 막는다', () => {
    const d = checkGate(
      'external_fetch',
      { ...open, dailyBudgetUsd: 5, spentTodayUsd: 5 },
      'production'
    )
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('budget_exceeded')
  })

  it('한도 미만이면 통과한다', () => {
    expect(
      checkGate('external_fetch', { ...open, dailyBudgetUsd: 5, spentTodayUsd: 4.99 }, 'production')
        .allowed
    ).toBe(true)
  })

  it('한도 0은 무제한으로 본다', () => {
    expect(
      checkGate('external_fetch', { ...open, dailyBudgetUsd: 0, spentTodayUsd: 9999 }, 'production')
        .allowed
    ).toBe(true)
  })
})

describe('환경 판별', () => {
  const original = { vercel: process.env.VERCEL_ENV, node: process.env.NODE_ENV }

  function restore() {
    if (original.vercel === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = original.vercel
  }

  it('VERCEL_ENV를 NODE_ENV보다 우선한다', () => {
    // Vercel Preview에서 NODE_ENV는 'production'이라 NODE_ENV만 보면
    // 프리뷰를 프로덕션으로 오판한다.
    process.env.VERCEL_ENV = 'preview'
    expect(currentEnvironment()).toBe('preview')
    restore()
  })

  it('VERCEL_ENV=production이면 production이다', () => {
    process.env.VERCEL_ENV = 'production'
    expect(currentEnvironment()).toBe('production')
    restore()
  })

  it('VERCEL_ENV가 없으면 NODE_ENV로 판단한다', () => {
    delete process.env.VERCEL_ENV
    // 테스트 실행 중 NODE_ENV는 'test'라 development로 떨어진다 —
    // 즉 테스트에서 실수로 외부 호출이 나가지 않는다.
    expect(currentEnvironment()).toBe('development')
    restore()
  })
})

describe('assertGate', () => {
  it('통과하면 아무 일도 없다', () => {
    expect(() => assertGate('external_fetch', open, 'production')).not.toThrow()
  })

  it('막히면 SafetyGateError를 던진다', () => {
    expect(() => assertGate('channel_publish', { ...open, emergencyStop: true }, 'production'))
      .toThrow(SafetyGateError)
  })

  it('던진 오류에 차단 사유가 담긴다', () => {
    try {
      assertGate('channel_publish', open, 'preview')
      expect.unreachable('막혀야 한다')
    } catch (err) {
      expect(err).toBeInstanceOf(SafetyGateError)
      expect((err as SafetyGateError).reason).toBe('non_production_environment')
    }
  })
})

describe('기본 정책', () => {
  it('기본값은 아무것도 막지 않는다 — 차단은 명시적으로만', () => {
    expect(DEFAULT_SAFETY_POLICY.emergencyStop).toBe(false)
    expect(DEFAULT_SAFETY_POLICY.disabledChannels).toEqual([])
    expect(DEFAULT_SAFETY_POLICY.dailyBudgetUsd).toBe(0)
  })
})
