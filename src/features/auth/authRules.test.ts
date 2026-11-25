import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  isAllowedPhotoUrl,
  isValidDisplayName,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  toValidDisplayName,
} from './authRules';

describe('authRules', () => {
  it('uses one password minimum of 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('123456')).toBe(false);
    expect(isValidPassword('12345678')).toBe(true);
  });

  it('accepts usernames the sign-up form and the database accept', () => {
    expect(isValidUsername(normalizeUsername('  Gomoku_Player '))).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(25))).toBe(false);
    expect(isValidUsername('bad-name')).toBe(false);
  });

  it('limits display names to 1..40 visible characters', () => {
    expect(isValidDisplayName('Alice')).toBe(true);
    expect(isValidDisplayName('   ')).toBe(false);
    expect(isValidDisplayName('x'.repeat(40))).toBe(true);
    expect(isValidDisplayName('x'.repeat(41))).toBe(false);
    expect(isValidDisplayName('a\nb')).toBe(false);
    // Counted like Postgres char_length: an emoji is one character, not two.
    expect(isValidDisplayName('😀'.repeat(40))).toBe(true);
    expect(isValidDisplayName('😀'.repeat(41))).toBe(false);
  });

  it('turns an outside name into one the database accepts', () => {
    expect(toValidDisplayName('  Ada Lovelace ', 'x')).toBe('Ada Lovelace');
    expect(toValidDisplayName('a\tb\u0007c', 'x')).toBe('abc');
    expect(toValidDisplayName('y'.repeat(60), 'x')).toBe('y'.repeat(40));
    expect(toValidDisplayName('   ', 'Gomoku Master')).toBe('Gomoku Master');
    expect(toValidDisplayName(undefined, 'Gomoku Master')).toBe('Gomoku Master');
    expect(isValidDisplayName(toValidDisplayName(`${'z'.repeat(39)} tail`, 'x'))).toBe(true);
  });

  it('accepts only the avatar forms the app writes', () => {
    for (const ok of [
      'Teemo',
      'aatrox',
      'Ahri.png',
      '/Avatar/Zerom.gif',
      'ragnarok:Zerom.gif',
      'ragnarok:Skeleton prisoner.gif',
      'https://ddragon.leagueoflegends.com/cdn/16.18.1/img/champion/Teemo.png',
      'https://lh3.googleusercontent.com/a/ACg8ocK-abc_123=s96-c',
      null,
    ]) {
      expect(isAllowedPhotoUrl(ok), String(ok)).toBe(true);
    }
    for (const bad of [
      'https://evil.example/track.png',
      'http://ddragon.leagueoflegends.com/cdn/1/img/champion/Teemo.png',
      'https://ddragon.leagueoflegends.com.evil.example/x.png',
      'javascript:alert(1)',
      'ragnarok:../../x"onerror=1',
      '',
      `https://lh3.googleusercontent.com/${'a'.repeat(600)}`,
    ]) {
      expect(isAllowedPhotoUrl(bad), bad).toBe(false);
    }
  });
});
