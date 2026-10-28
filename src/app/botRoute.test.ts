import { describe, expect, it } from 'vitest';
import { BOT_PATH, isBotPath, shouldAutoStartBot } from './botRoute';

describe('isBotPath', () => {
  it('matches /bot with or without a trailing slash, in any case', () => {
    expect(BOT_PATH).toBe('/bot');
    expect(isBotPath('/bot')).toBe(true);
    expect(isBotPath('/bot/')).toBe(true);
    expect(isBotPath('/BOT')).toBe(true);
  });

  it('does not match other paths', () => {
    expect(isBotPath('/')).toBe(false);
    expect(isBotPath('/bots')).toBe(false);
    expect(isBotPath('/bot/extra')).toBe(false);
    expect(isBotPath('/robot')).toBe(false);
    expect(isBotPath('')).toBe(false);
  });
});

describe('shouldAutoStartBot', () => {
  it('starts a bot game when /bot is opened directly', () => {
    expect(shouldAutoStartBot('/bot', '')).toBe(true);
    expect(shouldAutoStartBot('/bot/', '?utm=x')).toBe(true);
  });

  it('leaves a room link alone even on /bot', () => {
    expect(shouldAutoStartBot('/bot', '?room=ABC123')).toBe(false);
  });

  it('does nothing elsewhere', () => {
    expect(shouldAutoStartBot('/', '')).toBe(false);
    expect(shouldAutoStartBot('/', '?room=ABC123')).toBe(false);
  });
});
