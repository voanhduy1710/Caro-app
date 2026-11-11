import { describe, it, expect } from 'vitest'
import { encodePairLink, decodePairLink, readPairFromLocation, type PairOffer } from './pairLink'

const offer: PairOffer = { v: 1, uid: 'u-1', sessionId: 's-1', secret: 'abc', kind: 'room' }
const payloadOf = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('pair link codec', () => {
  it('round trips a full URL', () => {
    expect(decodePairLink(encodePairLink('https://x.app', offer))).toEqual(offer)
  })

  it('uses an unpadded base64url fragment', () => {
    const link = encodePairLink('https://x.app', offer)
    expect(link.startsWith('https://x.app/#pair=')).toBe(true)
    expect(link.split('pair=')[1]).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('round trips UTF-8 and practice offers', () => {
    const unicodeOffer: PairOffer = { ...offer, uid: 'tên-ü', kind: 'practice' }
    expect(decodePairLink(encodePairLink('https://x.app', unicodeOffer))).toEqual(unicodeOffer)
  })

  it.each(['', 'https://x.app/', '#pair=!!!', 'x'.repeat(2049), '#pair=a', '#pair=_w', '#pair=' + btoa('{')])('rejects malformed input %s', input => {
    expect(decodePairLink(input)).toBeNull()
  })

  it.each([
    null, [], { ...offer, v: 2 },
    { v: 1, uid: 'u-1', sessionId: 's-1', kind: 'room' },
    { ...offer, kind: 'other' },
    ...(['uid', 'sessionId', 'secret'] as const).flatMap(field =>
      ['', 'x'.repeat(129), 123, null].map(value => ({ ...offer, [field]: value }))),
  ])('rejects invalid offer %j', value => {
    expect(decodePairLink(payloadOf(value))).toBeNull()
  })

  it('accepts fields at the length limit', () => {
    const maxOffer = { ...offer, uid: 'u'.repeat(128), sessionId: 's'.repeat(128), secret: 'x'.repeat(128) }
    expect(decodePairLink(encodePairLink('https://x.app', maxOffer))).toEqual(maxOffer)
  })

  it('returns only validated fields', () => {
    expect(decodePairLink(payloadOf({ ...offer, extra: 'untrusted' }))).toEqual(offer)
  })

  it('accepts a bare fragment or payload', () => {
    const payload = payloadOf(offer)
    expect(decodePairLink('#pair=' + payload)).toEqual(offer)
    expect(decodePairLink(payload)).toEqual(offer)
  })

  it('reads only pairing fragments from location', () => {
    expect(readPairFromLocation('#pair=' + payloadOf(offer))).toEqual(offer)
    expect(readPairFromLocation('')).toBeNull()
    expect(readPairFromLocation('#other=1')).toBeNull()
    expect(readPairFromLocation(payloadOf(offer))).toBeNull()
  })
})
