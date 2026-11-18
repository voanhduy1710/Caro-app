/**
 * Account and profile limits, in one place. The database enforces the same
 * rules (migration 20261118000200_profile_field_checks.sql), so a value these
 * accept is one the server takes too; keep the two in step.
 */

/** Usernames map to <username>@gomoku.app, so they stay short and plain. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export const USERNAME_MAX_LENGTH = 24;

/** The same minimum at sign-up and on every password change. */
export const PASSWORD_MIN_LENGTH = 8;

export const DISPLAY_NAME_MAX_LENGTH = 40;

/** Usernames are case-insensitive: stored and compared lowercased. */
export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const isValidUsername = (value: string) => USERNAME_PATTERN.test(value);

export const isValidPassword = (value: string) => typeof value === 'string' && value.length >= PASSWORD_MIN_LENGTH;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Length as Postgres char_length counts it: code points, not UTF-16 units. */
const charLength = (value: string) => Array.from(value).length;

/** A trimmed display name of 1..40 characters with no control characters. */
export const isValidDisplayName = (value: string) => {
  const name = value.trim();
  const length = charLength(name);
  return length >= 1 && length <= DISPLAY_NAME_MAX_LENGTH && !CONTROL_CHAR.test(name);
};

/**
 * A name the player did not type (a Google full name, an email's local part)
 * made to fit the rules above: control characters dropped, trimmed, cut to the
 * maximum. Falls back when nothing usable is left. The signup trigger in
 * migration 20261118000200 does the same on the server.
 */
export const toValidDisplayName = (value: string | null | undefined, fallback: string): string => {
  const cleaned = (value ?? '').replace(CONTROL_CHARS, '').trim();
  const name = Array.from(cleaned).slice(0, DISPLAY_NAME_MAX_LENGTH).join('').trim();
  return name || fallback;
};

/**
 * The avatar forms the app writes to gomoku_users.photo_url (see
 * avatarService): a champion id or file name, a legacy /Avatar/ path, a
 * Ragnarok key, a Data Dragon champion icon, or a Google account photo.
 * Anything else is refused by the database, so it is refused here first.
 * Every pattern is written the same way in the migration's CHECK: keep the
 * two lists identical. Postgres regexes allow at most {,255} repetitions, so
 * open-ended parts use `+` and the overall length cap does the limiting.
 */
const PHOTO_URL_PATTERNS: RegExp[] = [
  /^[A-Za-z0-9_]{1,40}(\.(png|gif))?$/,
  /^\/?[Aa]vatar\/[A-Za-z0-9 _.()'-]{1,120}$/,
  /^ragnarok:[A-Za-z0-9 _.()'-]{1,120}$/,
  /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/[0-9.]{1,20}\/img\/champion\/[A-Za-z0-9_]{1,40}\.png$/,
  /^https:\/\/lh[0-9]\.googleusercontent\.com\/[A-Za-z0-9_/=+.~-]+$/,
];
export const PHOTO_URL_MAX_LENGTH = 512;

export const isAllowedPhotoUrl = (value: string | null | undefined) =>
  value === null || value === undefined ||
  (typeof value === 'string' && value.length <= PHOTO_URL_MAX_LENGTH && PHOTO_URL_PATTERNS.some((re) => re.test(value)));
