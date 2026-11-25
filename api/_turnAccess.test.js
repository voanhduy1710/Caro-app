import { describe, expect, it } from 'vitest';
import { bearerToken, createRateLimiter, isAllowedPageRequest, parseAllowList } from './_turnAccess.js';

describe('bearerToken', () => {
  it('reads a bearer token and nothing else', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer x')).toBe('x');
    expect(bearerToken('Basic x')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe('isAllowedPageRequest', () => {
  const base = { origin: null, secFetchSite: null, referer: null, host: 'caro.example', allowList: [] };

  it('accepts the app on its own host when no list is set', () => {
    expect(isAllowedPageRequest({ ...base, origin: 'https://caro.example' })).toBe(true);
    expect(isAllowedPageRequest({ ...base, secFetchSite: 'same-origin' })).toBe(true);
    expect(isAllowedPageRequest({ ...base, referer: 'https://caro.example/room/ABCD' })).toBe(true);
  });

  it('refuses other sites and header-less calls', () => {
    expect(isAllowedPageRequest({ ...base, origin: 'https://evil.example' })).toBe(false);
    expect(isAllowedPageRequest({ ...base, secFetchSite: 'cross-site', referer: 'https://evil.example/' })).toBe(false);
    expect(isAllowedPageRequest(base)).toBe(false);
  });

  it('uses the allow-list when set', () => {
    const allowList = parseAllowList('https://caro.example, https://preview.caro.example ,not a url');
    expect(allowList).toEqual(['https://caro.example', 'https://preview.caro.example']);
    expect(isAllowedPageRequest({ ...base, host: 'other.host', origin: 'https://preview.caro.example', allowList })).toBe(true);
    expect(isAllowedPageRequest({ ...base, origin: 'https://caro.example.evil.example', allowList })).toBe(false);
  });
});

describe('createRateLimiter', () => {
  it('allows max hits per window per key', () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow('ip', 0)).toBe(true);
    expect(allow('ip', 10)).toBe(true);
    expect(allow('ip', 20)).toBe(false);
    expect(allow('other', 20)).toBe(true);
    expect(allow('ip', 1000)).toBe(true);
  });
});
