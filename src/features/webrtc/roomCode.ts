/**
 * The room code rule, in a module with no imports of its own.
 *
 * Join validates codes with it and the public lobby filters announced rooms
 * with it, and the two must agree: a looser lobby lists rooms Join rejects, a
 * stricter one hides rooms that exist. It used to live in useWebRTC, which the
 * lobby cannot import without a cycle, so the lobby kept a hand-copied twin.
 */
export const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;

/**
 * Turns whatever the player pasted into a room code, or null when it cannot be
 * one. Invite links are the common case: people share the URL, not the code.
 */
export const parseRoomCode = (input: string): string | null => {
  const raw = (input || '').trim();
  if (!raw) return null;
  const fromLink = raw.match(/[?&]room=([^&\s]+)/i);
  const candidate = (fromLink ? fromLink[1] : raw).replace(/\s+/g, '').toUpperCase();
  return ROOM_CODE_PATTERN.test(candidate) ? candidate : null;
};
