import { describe, it, expect } from 'vitest'
import { SECRET_ROTATE_MS, SECRET_GRACE_MS, createHostState, rotateIfDue, acceptHello, dropPhone } from './pairHostSession'

const setup = () => {
  let counter = 0
  const rand = () => `r${++counter}`
  return { rand, state: createHostState(1000, rand) }
}

describe('host pairing session', () => {
  it('creates a session and initial secret using separate random values', () => {
    const { state } = setup()
    expect(state).toEqual({ sessionId: 'r1', current: { secret: 'r2', issuedAt: 1000 }, previous: null, used: [], phoneId: null })
    expect(SECRET_ROTATE_MS).toBe(60_000)
    expect(SECRET_GRACE_MS).toBe(10_000)
  })

  it('preserves identity before rotation is due without consuming randomness', () => {
    const { state, rand } = setup()
    expect(rotateIfDue(state, 60_999, rand)).toBe(state)
    expect(rand()).toBe('r3')
  })

  it('rotates at exactly 60 seconds without mutating the input', () => {
    const { state, rand } = setup()
    const before = structuredClone(state)
    const rotated = rotateIfDue(state, 61_000, rand)
    expect(rotated).not.toBe(state)
    expect(rotated).toEqual({ ...state, current: { secret: 'r3', issuedAt: 61_000 }, previous: { secret: 'r2', retiredAt: 61_000 } })
    expect(state).toEqual(before)
  })

  it('accepts the current secret immutably', () => {
    const { state } = setup()
    const before = structuredClone(state)
    const result = acceptHello(state, state.current.secret, 'p1', 1000)
    expect(result).toEqual({ ok: true, state: { ...state, used: ['r2'], phoneId: 'p1' }, replacedPhoneId: null })
    if (!result.ok) throw new Error('Expected successful pairing')
    expect(result.state).not.toBe(state)
    expect(state).toEqual(before)
  })

  it('rejects reuse even after the consumed secret has expired', () => {
    const { state, rand } = setup()
    const result = acceptHello(state, state.current.secret, 'p1', 1000)
    if (!result.ok) throw new Error('Expected successful pairing')
    expect(acceptHello(result.state, 'r2', 'p2', 1001)).toEqual({ ok: false, reason: 'used' })
    const rotated = rotateIfDue(result.state, 61_000, rand)
    expect(acceptHello(rotated, 'r2', 'p2', 71_001)).toEqual({ ok: false, reason: 'used' })
    expect(result.state.phoneId).toBe('p1')
  })

  it.each([[10_000, true], [10_001, false]] as const)('checks the previous secret at grace offset %i', (offset, valid) => {
    const { state, rand } = setup()
    const rotated = rotateIfDue(state, 61_000, rand)
    const result = acceptHello(rotated, 'r2', 'p1', 61_000 + offset)
    expect(result.ok).toBe(valid)
    if (!valid) expect(result).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects an unknown secret', () => {
    const { state } = setup()
    expect(acceptHello(state, 'unknown', 'p1', 1000)).toEqual({ ok: false, reason: 'expired' })
  })

  it('replaces the old phone using a fresh secret and preserves pairing during rotation', () => {
    const { state, rand } = setup()
    const first = acceptHello(state, 'r2', 'p1', 1000)
    if (!first.ok) throw new Error('Expected successful pairing')
    const rotated = rotateIfDue(first.state, 61_000, rand)
    const before = structuredClone(rotated)
    expect(rotated.phoneId).toBe('p1')
    expect(acceptHello(rotated, 'r3', 'p2', 61_000)).toEqual({ ok: true, state: { ...rotated, used: ['r2', 'r3'], phoneId: 'p2' }, replacedPhoneId: 'p1' })
    expect(rotated).toEqual(before)
  })

  it('does not report replacement when the same phone pairs with a fresh secret', () => {
    const { state } = setup()
    expect(acceptHello({ ...state, phoneId: 'p1' }, 'r2', 'p1', 1000)).toMatchObject({ ok: true, replacedPhoneId: null })
  })

  it('drops only the matching phone immutably', () => {
    const { state } = setup()
    const paired = { ...state, phoneId: 'p1' }
    expect(dropPhone(paired, 'nope')).toBe(paired)
    const dropped = dropPhone(paired, 'p1')
    expect(dropped).not.toBe(paired)
    expect(dropped).toEqual({ ...paired, phoneId: null })
    expect(paired.phoneId).toBe('p1')
  })
})
