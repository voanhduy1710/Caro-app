import { describe, expect, it } from 'vitest';
import type { RoomApi } from '../room/useRoomCore';
import type { PairMessage } from './pairProtocol';
import {
  applyDesktopMessage,
  DESKTOP_SILENCE_MS,
  failConnecting,
  INITIAL_REMOTE_STATE,
  isDesktopSilent,
  maskDismissed,
  NOTHING_DISMISSED,
  type RemoteState,
} from './pairRemoteSync';

const ME = 'phone-1';
const roomData = { fields: { status: 'connected' }, clocks: null, graceByMember: {}, hostNow: 5 };

const paired: RemoteState = { ...INITIAL_REMOTE_STATE, status: 'paired' };
const apply = (s: RemoteState, m: PairMessage, at = 100) => applyDesktopMessage(s, m, ME, at);

describe('applyDesktopMessage', () => {
  it('pairs on a welcome for this phone', () => {
    expect(apply(INITIAL_REMOTE_STATE, { t: 'welcome', phoneId: ME }).status).toBe('paired');
  });

  it('ignores messages for another phone', () => {
    expect(apply(INITIAL_REMOTE_STATE, { t: 'welcome', phoneId: 'other' })).toBe(INITIAL_REMOTE_STATE);
  });

  it('turns a reject into its error', () => {
    expect(apply(INITIAL_REMOTE_STATE, { t: 'reject', phoneId: ME, reason: 'used' })).toMatchObject({ status: 'error', error: 'used' });
    expect(apply(INITIAL_REMOTE_STATE, { t: 'reject', phoneId: ME, reason: 'expired' })).toMatchObject({ status: 'error', error: 'expired' });
  });

  it('ignores a reject once paired', () => {
    expect(apply(paired, { t: 'reject', phoneId: ME, reason: 'used' })).toBe(paired);
  });

  it('ends with the desktop reason', () => {
    expect(apply(paired, { t: 'end', phoneId: ME, reason: 'game_ended' })).toMatchObject({ status: 'ended', endReason: 'game_ended' });
  });

  it('keeps the newest snapshot and when it arrived', () => {
    const s = apply(paired, { t: 'snapshot', phoneId: ME, seq: 3, kind: 'room', data: roomData }, 250);
    expect(s).toMatchObject({ seq: 3, kind: 'room', data: roomData, receivedAt: 250 });
  });

  it('drops a snapshot that is not newer than the last one applied', () => {
    const s = apply(paired, { t: 'snapshot', phoneId: ME, seq: 3, kind: 'room', data: roomData });
    expect(apply(s, { t: 'snapshot', phoneId: ME, seq: 3, kind: 'room', data: { ...roomData, hostNow: 9 } })).toBe(s);
    expect(apply(s, { t: 'snapshot', phoneId: ME, seq: 2, kind: 'room', data: roomData })).toBe(s);
  });

  it('drops a snapshot whose data has the wrong shape', () => {
    expect(apply(paired, { t: 'snapshot', phoneId: ME, seq: 1, kind: 'room', data: { fields: 1 } })).toBe(paired);
    expect(apply(paired, { t: 'snapshot', phoneId: ME, seq: 1, kind: 'practice', data: null })).toBe(paired);
    expect(apply(paired, { t: 'snapshot', phoneId: ME, seq: 1, kind: 'practice', data: [] })).toBe(paired);
  });

  it('collects chat images by id', () => {
    const s = apply(paired, { t: 'chatImage', phoneId: ME, id: 'm1', image: 'data:x' });
    expect(s.images).toEqual({ m1: 'data:x' });
  });

  it('changes nothing once the pairing is over', () => {
    const ended = apply(paired, { t: 'end', phoneId: ME, reason: 'unpaired' });
    expect(apply(ended, { t: 'welcome', phoneId: ME })).toBe(ended);
    expect(apply(ended, { t: 'snapshot', phoneId: ME, seq: 9, kind: 'room', data: roomData })).toBe(ended);
  });

  it('ignores messages a phone sends', () => {
    expect(apply(paired, { t: 'ping', phoneId: ME })).toBe(paired);
  });
});

describe('failConnecting', () => {
  it('fails a handshake still waiting as no_desktop', () => {
    expect(failConnecting(INITIAL_REMOTE_STATE)).toMatchObject({ status: 'error', error: 'no_desktop' });
  });

  it('leaves a pairing that already got an answer alone', () => {
    expect(failConnecting(paired)).toBe(paired);
  });
});

describe('isDesktopSilent', () => {
  it('is true only after the silence limit has passed', () => {
    expect(isDesktopSilent(1000, 1000 + DESKTOP_SILENCE_MS)).toBe(false);
    expect(isDesktopSilent(1000, 1001 + DESKTOP_SILENCE_MS)).toBe(true);
  });
});

describe('maskDismissed', () => {
  const room = {
    teaseNotice: { fromMemberId: 'a', fromName: 'A', at: 10 },
    seatOpened: { seat: 'X', at: 20 },
    error: 'Room is full',
  } as unknown as RoomApi;

  it('shows everything when nothing was dismissed', () => {
    expect(maskDismissed(room, NOTHING_DISMISSED)).toMatchObject({ teaseNotice: room.teaseNotice, seatOpened: room.seatOpened, error: 'Room is full' });
  });

  it('hides exactly the notices the phone dismissed', () => {
    expect(maskDismissed(room, { teaseAt: 10, seatOpenedAt: 20, error: 'Room is full' })).toMatchObject({ teaseNotice: null, seatOpened: null, error: null });
  });

  it('shows a newer notice of the same kind again', () => {
    expect(maskDismissed(room, { teaseAt: 9, seatOpenedAt: 19, error: 'Other' })).toMatchObject({ teaseNotice: room.teaseNotice, seatOpened: room.seatOpened, error: 'Room is full' });
  });
});
