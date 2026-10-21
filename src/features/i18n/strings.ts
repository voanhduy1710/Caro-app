import { common } from './dict/common';
import { home } from './dict/home';
import { settings } from './dict/settings';
import { room } from './dict/room';
import { game } from './dict/game';

/**
 * Every translated string, by language. Each screen group keeps its own pair of
 * tables under ./dict, and defineStrings makes the Vietnamese table carry
 * exactly the English keys, so a missing translation fails the type check.
 */
export const STRINGS = {
  en: { ...common.en, ...home.en, ...settings.en, ...room.en, ...game.en },
  vi: { ...common.vi, ...home.vi, ...settings.vi, ...room.vi, ...game.vi },
};

export type StringKey = keyof typeof STRINGS.en;
