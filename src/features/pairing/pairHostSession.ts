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
  return {
    ...s,
    current: { secret: rand(), issuedAt: now },
    previous: { secret: s.current.secret, retiredAt: now },
  }
}

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
