import { describe, expect, it } from 'vitest';
import type { PracticeMatchViewProps } from '../../app/PracticeMatchView';
import type { RoomApi } from '../room/useRoomCore';
import { createHostState, SECRET_ROTATE_MS } from './pairHostSession';
import {
  isPhoneSilent,
  needsTickPush,
  PHONE_SILENCE_MS,
  secondsUntilRotation,
  snapshotChangeKey,
  snapshotOf,
  unsentImages,
  type PairSource,
} from './pairHostSync';

const roomSource = (over: Record<string, unknown> = {}, hostNow = 1000): PairSource => ({
  kind: 'room',
  gameKey: 'r1',
  room: {
    status: 'connected',
    roomId: 'r1',
    state: { phase: 'waiting', members: [] },
    chatMessages: [],
    countdownSecondsLeft: null,
    hostGraceSecondsLeft: null,
    hostClaimSecondsLeft: null,
    clocksNow: () => null,
    graceSecondsLeft: () => null,
    hostNow: () => hostNow,
    move: () => true,
    ...over,
  } as unknown as RoomApi,
});

const practiceSource = (gameStatus: PracticeMatchViewProps['gameStatus'], turnTimeLeft = 20): PairSource => ({
  kind: 'practice',
  gameKey: 'p1',
  props: { gameStatus, turnTimeLeft, board: [[null]], onCellClick: () => {}, onExit: () => {} } as unknown as PracticeMatchViewProps,
});

describe('needsTickPush', () => {
  it('ticks a room only while something on it counts down', () => {
    expect(needsTickPush(roomSource())).toBe(false);
    expect(needsTickPush(roomSource({ state: { phase: 'playing', members: [] } }))).toBe(true);
    expect(needsTickPush(roomSource({ state: null }))).toBe(false);
    expect(needsTickPush(roomSource({ countdownSecondsLeft: 3 }))).toBe(true);
    expect(needsTickPush(roomSource({ hostGraceSecondsLeft: 0 }))).toBe(true);
    expect(needsTickPush(roomSource({ hostClaimSecondsLeft: 12 }))).toBe(true);
  });

  it('ticks a practice game only while it is being played', () => {
    expect(needsTickPush(practiceSource('playing'))).toBe(true);
    expect(needsTickPush(practiceSource('ended'))).toBe(false);
    expect(needsTickPush(practiceSource('lobby'))).toBe(false);
  });
});

describe('snapshotChangeKey', () => {
  it('ignores the room host time, which moves on every render', () => {
    expect(snapshotChangeKey(roomSource({}, 1000))).toBe(snapshotChangeKey(roomSource({}, 5000)));
  });

  it('changes when room fields change', () => {
    expect(snapshotChangeKey(roomSource({ countdownSecondsLeft: 3 }))).not.toBe(snapshotChangeKey(roomSource({ countdownSecondsLeft: 2 })));
  });

  it('changes when practice props change and ignores callbacks', () => {
    expect(snapshotChangeKey(practiceSource('playing', 20))).not.toBe(snapshotChangeKey(practiceSource('playing', 19)));
    expect(snapshotChangeKey(practiceSource('playing'))).not.toContain('onCellClick');
  });
});

describe('snapshotOf', () => {
  it('tags the snapshot with the source kind', () => {
    expect(snapshotOf(roomSource()).kind).toBe('room');
    expect(snapshotOf(practiceSource('playing'))).toEqual({ kind: 'practice', data: { gameStatus: 'playing', turnTimeLeft: 20, board: [[null]] } });
  });
});

describe('unsentImages', () => {
  it('keeps only images whose id was not sent yet, in order', () => {
    const images = [{ id: 'a', image: 'A' }, { id: 'b', image: 'B' }, { id: 'c', image: 'C' }];
    expect(unsentImages(images, new Set())).toEqual(images);
    expect(unsentImages(images, new Set(['a', 'c']))).toEqual([{ id: 'b', image: 'B' }]);
    expect(unsentImages(images, new Set(['a', 'b', 'c']))).toEqual([]);
  });
});

describe('isPhoneSilent', () => {
  it('counts a phone as gone only after the silence window has passed', () => {
    expect(isPhoneSilent(1000, 1000 + PHONE_SILENCE_MS)).toBe(false);
    expect(isPhoneSilent(1000, 1001 + PHONE_SILENCE_MS)).toBe(true);
  });
});

describe('secondsUntilRotation', () => {
  it('counts down whole seconds to the next secret and stops at zero', () => {
    const state = createHostState(10_000, () => 's');
    expect(secondsUntilRotation(state, 10_000)).toBe(SECRET_ROTATE_MS / 1000);
    expect(secondsUntilRotation(state, 10_500)).toBe(SECRET_ROTATE_MS / 1000);
    expect(secondsUntilRotation(state, 10_000 + SECRET_ROTATE_MS - 1)).toBe(1);
    expect(secondsUntilRotation(state, 10_000 + SECRET_ROTATE_MS + 5000)).toBe(0);
  });
});
