/**
 * Pure decisions behind the phone side of a pairing: what each desktop message
 * does to the phone's view of the game, when the desktop counts as gone, and
 * which room notices the phone has dismissed on its own. usePairRemote wires
 * these to timers and the channel.
 */
import type { RoomApi } from '../room/useRoomCore';
import type { PairError } from './pairErrors';
import type { PairEndReason, PairMessage, PairSnapshotKind } from './pairProtocol';

/** How long the phone waits for the desktop to answer its hello. */
export const HANDSHAKE_TIMEOUT_MS = 8_000;
/** How often a paired phone tells the desktop it is still there. */
export const PING_INTERVAL_MS = 3_000;
/** A desktop that has sent nothing for this long is treated as gone. */
export const DESKTOP_SILENCE_MS = 10_000;

export type RemoteStatus = 'connecting' | 'paired' | 'ended' | 'error';

export interface RemoteState {
  status: RemoteStatus;
  error: PairError | null;
  endReason: PairEndReason | null;
  kind: PairSnapshotKind | null;
  /** Sequence number of the snapshot in `data`; 0 before the first one. */
  seq: number;
  data: unknown;
  /** performance.now() when `data` arrived, so clocks can run on between snapshots. */
  receivedAt: number;
  images: Record<string, string>;
}

export const INITIAL_REMOTE_STATE: RemoteState = {
  status: 'connecting',
  error: null,
  endReason: null,
  kind: null,
  seq: 0,
  data: null,
  receivedAt: 0,
  images: {},
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Only data shaped like a snapshot of its kind reaches the game screens. */
const isSnapshotData = (kind: PairSnapshotKind, data: unknown): boolean => {
  if (!isRecord(data)) return false;
  if (kind === 'practice') return true;
  return isRecord(data.fields) && isRecord(data.graceByMember) && typeof data.hostNow === 'number'
    && (data.clocks === null || isRecord(data.clocks));
};

const isOver = (s: RemoteState) => s.status === 'ended' || s.status === 'error';

export const applyDesktopMessage = (s: RemoteState, m: PairMessage, phoneId: string, at: number): RemoteState => {
  if (m.phoneId !== phoneId || isOver(s)) return s;
  switch (m.t) {
    case 'welcome':
      return s.status === 'connecting' ? { ...s, status: 'paired' } : s;
    case 'reject':
      // Once paired, a reject can only answer a stray repeated hello.
      return s.status === 'connecting' ? { ...s, status: 'error', error: m.reason } : s;
    case 'end':
      return { ...s, status: 'ended', endReason: m.reason };
    case 'snapshot':
      if (m.seq <= s.seq || !isSnapshotData(m.kind, m.data)) return s;
      return { ...s, status: 'paired', kind: m.kind, seq: m.seq, data: m.data, receivedAt: at };
    case 'chatImage':
      return { ...s, images: { ...s.images, [m.id]: m.image } };
    default:
      return s;
  }
};

/** The handshake got no answer in time, or the channel could not be joined. */
export const failConnecting = (s: RemoteState): RemoteState =>
  s.status === 'connecting' ? { ...s, status: 'error', error: 'no_desktop' } : s;

export const isDesktopSilent = (lastHeardAt: number, now: number): boolean => now - lastHeardAt > DESKTOP_SILENCE_MS;

/**
 * Room notices the phone closed itself. Dismissing on the phone must not
 * dismiss on the desktop, so the phone remembers what it hid and masks it in
 * every later snapshot until a newer notice of that kind comes.
 */
export interface DismissedNotices {
  teaseAt: number | null;
  seatOpenedAt: number | null;
  error: string | null;
}

export const NOTHING_DISMISSED: DismissedNotices = { teaseAt: null, seatOpenedAt: null, error: null };

export const maskDismissed = (room: RoomApi, d: DismissedNotices): RoomApi => ({
  ...room,
  teaseNotice: room.teaseNotice && room.teaseNotice.at === d.teaseAt ? null : room.teaseNotice,
  seatOpened: room.seatOpened && room.seatOpened.at === d.seatOpenedAt ? null : room.seatOpened,
  error: room.error !== null && room.error === d.error ? null : room.error,
});
