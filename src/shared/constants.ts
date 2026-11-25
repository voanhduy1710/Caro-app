/**
 * Values more than one feature has to agree on. The edge functions and SQL
 * keep their own copies (they are deployed separately), so a change here is
 * also a change to `supabase/functions/submit-match` and the migrations.
 */

/** Rating every account starts on; also what a missing rating is shown as. */
export const DEFAULT_ELO = 1200;

/** The practice bot's identity in match history rows. */
export const AI_BOT_UID = 'ai_bot';
export const AI_BOT_NAME = 'AI Bot';

/** Guests are local-only: never rated, never synced. */
export const GUEST_UID_PREFIX = 'guest_';
export const isGuestUid = (uid: string): boolean => uid.startsWith(GUEST_UID_PREFIX);

/** A uid that is safe to interpolate into a PostgREST filter. */
export const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
