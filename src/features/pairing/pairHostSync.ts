/**
 * Pure decisions behind the desktop side of a pairing: what the source game
 * is, when to push it to the phone, which chat images the phone still lacks,
 * and when a silent phone counts as gone. usePairHost wires these to timers
 * and the channel.
 */
import type { PracticeMatchViewProps } from '../../app/PracticeMatchView';
import type { RoomApi } from '../room/useRoomCore';
import { SECRET_ROTATE_MS, type PairHostState } from './pairHostSession';
import type { PairSnapshotKind } from './pairProtocol';
import { buildPracticeSnapshot } from './practiceSnapshot';
import { buildRoomSnapshot } from './roomSnapshot';

export type PairSource =
  | { kind: 'room'; room: RoomApi; gameKey: string }
  | { kind: 'practice'; props: PracticeMatchViewProps; gameKey: string };

/** A paired phone that has sent neither ping nor call for this long is treated as gone. */
export const PHONE_SILENCE_MS = 10_000;

export const snapshotOf = (source: PairSource): { kind: PairSnapshotKind; data: unknown } =>
  source.kind === 'room'
    ? { kind: 'room', data: buildRoomSnapshot(source.room) }
    : { kind: 'practice', data: buildPracticeSnapshot(source.props) };

/**
 * A string that changes whenever what the phone shows changes. The room's
 * live clock readings and host time move on every render, so they are left
 * out here; the once-a-second push while a game runs carries them.
 */
export const snapshotChangeKey = (source: PairSource): string =>
  source.kind === 'room'
    ? JSON.stringify(buildRoomSnapshot(source.room).fields)
    : JSON.stringify(buildPracticeSnapshot(source.props));

/** True while something on the phone counts down, so it needs a fresh snapshot every second. */
export const needsTickPush = (source: PairSource): boolean => {
  if (source.kind === 'practice') return source.props.gameStatus === 'playing';
  const { room } = source;
  return room.state?.phase === 'playing'
    || room.countdownSecondsLeft !== null
    || room.hostGraceSecondsLeft !== null
    || room.hostClaimSecondsLeft !== null;
};

/** Chat images the phone has not been sent yet, in chat order. */
export const unsentImages = (
  images: ReadonlyArray<{ id: string; image: string }>,
  sent: ReadonlySet<string>,
): Array<{ id: string; image: string }> => images.filter((entry) => !sent.has(entry.id));

/**
 * Largest chat image sent to a phone, in data-URL characters. Realtime caps a
 * broadcast payload (about 256 KB on the Free plan), so a `chatImage` message
 * is kept at about 200 KB, envelope included.
 */
export const PHONE_IMAGE_MAX_CHARS = 199_000;

/**
 * The picture a phone is sent for a chat image: the image itself when it
 * fits, else a smaller copy, else null (the phone then shows a placeholder).
 */
export const fitImageForPhone = async (
  image: string,
  shrink: (dataUrl: string, maxChars: number) => Promise<string | null>,
): Promise<string | null> => {
  if (image.length <= PHONE_IMAGE_MAX_CHARS) return image;
  const smaller = await shrink(image, PHONE_IMAGE_MAX_CHARS);
  return smaller !== null && smaller.length <= PHONE_IMAGE_MAX_CHARS ? smaller : null;
};

export const isPhoneSilent = (lastHeardAt: number, now: number): boolean => now - lastHeardAt > PHONE_SILENCE_MS;

/** Whole seconds until the QR's secret is replaced, never negative. */
export const secondsUntilRotation = (state: PairHostState, now: number): number =>
  Math.max(0, Math.ceil((state.current.issuedAt + SECRET_ROTATE_MS - now) / 1000));
