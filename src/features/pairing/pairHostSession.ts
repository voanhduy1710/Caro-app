export const SECRET_ROTATE_MS = 60_000
export const SECRET_GRACE_MS = 10_000

export interface PairHostState {
  sessionId: string
  current: { secret: string; issuedAt: number }
  previous: { secret: string; retiredAt: number } | null
  used: string[]
  phoneId: string | null
}

export type HelloResult =
  | { ok: true; state: PairHostState; replacedPhoneId: string | null }
  | { ok: false; reason: 'expired' | 'used' }

export const createHostState = (now: number, rand: () => string): PairHostState => ({
  sessionId: rand(),
  current: { secret: rand(), issuedAt: now },
  previous: null,
  used: [],
  phoneId: null,
})

export const rotateIfDue = (s: PairHostState, now: number, rand: () => string): PairHostState => {
  if (now - s.current.issuedAt < SECRET_ROTATE_MS) return s
  // The old secret retires when its minute is up, not when the rotation happens
  // to run, so a late rotation never extends the life of an old QR.
  const retiredAt = s.current.issuedAt + SECRET_ROTATE_MS
  return {
    ...s,
    current: { secret: rand(), issuedAt: now },
    previous: now - retiredAt <= SECRET_GRACE_MS ? { secret: s.current.secret, retiredAt } : null,
  }
}

/** Replaces the QR's secret right away and leaves no grace for the one it replaces. */
export const issueFreshSecret = (s: PairHostState, now: number, rand: () => string): PairHostState => ({
  ...s,
  current: { secret: rand(), issuedAt: now },
  previous: null,
})

export const acceptHello = (s: PairHostState, secret: string, phoneId: string, now: number): HelloResult => {
  if (s.used.includes(secret)) return { ok: false, reason: 'used' }
  const valid = secret === s.current.secret
    || (secret === s.previous?.secret && now - s.previous.retiredAt <= SECRET_GRACE_MS)
  if (!valid) return { ok: false, reason: 'expired' }
  return {
    ok: true,
    state: { ...s, used: [...s.used, secret], phoneId },
    replacedPhoneId: s.phoneId !== phoneId ? s.phoneId : null,
  }
}

export const dropPhone = (s: PairHostState, phoneId: string): PairHostState =>
  s.phoneId === phoneId ? { ...s, phoneId: null } : s
