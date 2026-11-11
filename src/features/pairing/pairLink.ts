export interface PairOffer {
  v: 1
  uid: string
  sessionId: string
  secret: string
  kind: 'room' | 'practice'
}

export const encodePairLink = (origin: string, offer: PairOffer): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(offer))
  const payload = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${origin}/#pair=${payload}`
}

const validField = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128

export const decodePairLink = (input: string): PairOffer | null => {
  try {
    if (input.length > 2048) return null
    let payload = input
    if (input.includes('://')) payload = new URL(input).hash
    if (payload.startsWith('#pair=')) payload = payload.slice(6)
    if (!/^[A-Za-z0-9_-]+$/.test(payload)) return null

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const { v, uid, sessionId, secret, kind } = value as Record<string, unknown>
    if (v !== 1 || !validField(uid) || !validField(sessionId) || !validField(secret)
      || (kind !== 'room' && kind !== 'practice')) return null
    return { v, uid, sessionId, secret, kind }
  } catch {
    return null
  }
}

export const readPairFromLocation = (hash: string): PairOffer | null =>
  hash.startsWith('#pair=') ? decodePairLink(hash) : null
