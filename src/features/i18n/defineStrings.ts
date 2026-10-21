/**
 * One screen group's strings. Keys are prefixed with the group's name
 * ("home.playBot") so groups never collide when merged. Placeholders are
 * written `{name}` and filled by t(key, { name }).
 */
export const defineStrings = <T extends Record<string, string>>(en: T, vi: { [K in keyof T]: string }) => ({ en, vi });
