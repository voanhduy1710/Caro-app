import { useCallback, useSyncExternalStore } from 'react';
import { STRINGS } from './strings';
import type { StringKey } from './strings';

/**
 * The interface language. Like the display preferences it belongs to this
 * browser only: it is never sent to the room, and each player reads the room
 * in their own language.
 */
export type Language = 'en' | 'vi';

export const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'vi', label: 'Tiếng Việt' },
];

const STORAGE_KEY = 'caro_language';

const read = (): Language => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'vi' ? 'vi' : 'en';
  } catch {
    return 'en';
  }
};

let language: Language = read();
const listeners = new Set<() => void>();

const applyToDocument = () => {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
};
applyToDocument();

/** Read without subscribing, for code that runs outside a render. */
export const getLanguage = () => language;

export const setLanguage = (next: Language) => {
  if (next === language) return;
  language = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Remembering the language is a convenience, not a requirement.
  }
  applyToDocument();
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage, getLanguage);

export type TranslateVars = Record<string, string | number>;

/** Looks a string up in one language and fills its `{name}` placeholders. */
export const translate = (lang: Language, key: StringKey, vars?: TranslateVars): string => {
  const text = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;
};

/** The current language's lookup, outside React. */
export const t = (key: StringKey, vars?: TranslateVars) => translate(language, key, vars);

/** The current language's lookup; re-renders the caller when the language changes. */
export const useT = () => {
  const lang = useLanguage();
  return useCallback((key: StringKey, vars?: TranslateVars) => translate(lang, key, vars), [lang]);
};
