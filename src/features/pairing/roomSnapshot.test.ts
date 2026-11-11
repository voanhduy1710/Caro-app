import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveClocks } from '../room/roomEngineHelpers';
import type { Clocks } from '../room/roomEngineTypes';
import type { RoomApi } from '../room/useRoomCore';
import {
  LOCAL_ONLY_ROOM_METHODS,
  ROOM_METHODS,
  applyRoomCall,
  buildRoomSnapshot,
  chatImagesOf,
  createRemoteRoomApi,
  type FunctionKeys,
} from './roomSnapshot';

ROOM_METHODS satisfies readonly FunctionKeys<RoomApi>[];

const TIMING = ['clocksNow', 'graceSecondsLeft', 'hostNow'];

const clocks: Clocks = { X: 60_000, O: 60_000, T: 0, turn: 10_000, elapsed: 5_000, elapsedBySeat: { X: 3_000, O: 2_000, T: 0 }, running: true };

const makeState = (phase: string) => ({
  phase,
  members: [
    { id: 'm1', connected: true, graceMsLeft: null },
    { id: 'm2', connected: false, graceMsLeft: 20_000 },
  ],
  game: { clocks, turn: 'X', settings: { totalTimeMinutes: 5, turnTimeSeconds: 30 } },
});

const makeMethods = () => ({
  dismissTease: vi.fn(), dismissSeatOpened: vi.fn(), clearError: vi.fn(),
  createRoom: vi.fn(), joinRoom: vi.fn(), leaveRoom: vi.fn(), claimLostHostWin: vi.fn(),
  reset: vi.fn(), resumeFromUrl: vi.fn(),
  takeSeat: vi.fn(), becomeViewer: vi.fn(), ping: vi.fn(), clearPing: vi.fn(), clearSeat: vi.fn(), kickMember: vi.fn(),
  move: vi.fn(() => true), requestUndo: vi.fn(), answerUndo: vi.fn(), offerDoubleDown: vi.fn(), answerDoubleDown: vi.fn(),
  offerRematch: vi.fn(), answerRematch: vi.fn(), resign: vi.fn(), claimDisconnectWin: vi.fn(), discardGame: vi.fn(),
  updateSettings: vi.fn(), chooseFirstMove: vi.fn(), callCoin: vi.fn(), buzz: vi.fn(), tease: vi.fn(),
  markChatSeen: vi.fn(), sendChat: vi.fn(async () => {}),
  clocksNow: vi.fn(() => clocks), graceSecondsLeft: vi.fn((id: string) => (id === 'm2' ? 20 : null)), hostNow: vi.fn(() => 1_000_000),
});

// Every function key of RoomApi must be present, so the fake keeps up with the real type.
const methodsCheck = (m: ReturnType<typeof makeMethods>) => m satisfies Record<FunctionKeys<RoomApi>, unknown>;

const makeRoom = (phase = 'playing', status = 'connected') => {
  const methods = makeMethods();
  methodsCheck(methods);
  const room = {
    status,
    roomId: 'r1',
    isHost: true,
    memberId: 'm1',
    mySeat: 'X',
    state: makeState(phase),
    chatMessages: [
      { id: 'c1', sender: 'A', text: 'hi', timestamp: 1 },
      { id: 'c2', sender: 'B', text: '', image: 'data:image/png;base64,AAA', timestamp: 2 },
    ],
    chatSeen: {},
    error: null,
    closedReason: null,
    pendingMove: null,
    hostGraceSecondsLeft: null,
    hostClaimSecondsLeft: null,
    countdownSecondsLeft: null,
    teaseNotice: null,
    seatOpened: null,
    ratingNotes: {},
    ...methods,
  };
  return { room: room as unknown as RoomApi, methods };
};

afterEach(() => vi.restoreAllMocks());

describe('ROOM_METHODS', () => {
  it('lists the game actions', () => {
    for (const m of ['move', 'sendChat', 'requestUndo', 'resign', 'buzz', 'markChatSeen', 'offerRematch', 'claimLostHostWin'] as const) {
      expect(ROOM_METHODS).toContain(m);
    }
  });

  it('covers every function key except the timing functions', () => {
    const { methods } = makeRoom();
    const covered = new Set<string>([...ROOM_METHODS, ...LOCAL_ONLY_ROOM_METHODS]);
    for (const key of Object.keys(methods)) {
      if (TIMING.includes(key)) {
        expect(ROOM_METHODS).not.toContain(key);
        continue;
      }
      expect(covered.has(key), key).toBe(true);
    }
  });
});

describe('buildRoomSnapshot', () => {
  it('is plain JSON without functions', () => {
    const snap = buildRoomSnapshot(makeRoom().room);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(Object.values(snap.fields).some((v) => typeof v === 'function')).toBe(false);
    expect(snap.clocks).toEqual(clocks);
    expect(snap.hostNow).toBe(1_000_000);
    expect(snap.graceByMember).toEqual({ m1: null, m2: 20 });
  });

  it('strips chat images and marks them', () => {
    const snap = buildRoomSnapshot(makeRoom().room);
    const messages = snap.fields.chatMessages as Array<Record<string, unknown>>;
    expect(messages[1]).not.toHaveProperty('image');
    expect(messages[1].hasImage).toBe(true);
    expect(messages[0]).not.toHaveProperty('hasImage');
  });

  it('lists the stripped images', () => {
    expect(chatImagesOf(makeRoom().room)).toEqual([{ id: 'c2', image: 'data:image/png;base64,AAA' }]);
  });
});

describe('createRemoteRoomApi', () => {
  const setup = (phase = 'playing', status = 'connected', images: Record<string, string> = { c2: 'data:image/png;base64,AAA' }) => {
    const snap = buildRoomSnapshot(makeRoom(phase, status).room);
    const call = vi.fn();
    const local = { leaveRoom: vi.fn() };
    const remote = createRemoteRoomApi(snap, 1_000, images, call, local);
    return { snap, call, local, remote };
  };

  it('forwards game actions as calls', () => {
    const { remote, call } = setup();
    remote.move(3, 4, 'center' as never);
    expect(call).toHaveBeenCalledWith('move', [3, 4, 'center']);
  });

  it('keeps leaving local', () => {
    const { remote, call, local } = setup();
    remote.leaveRoom();
    expect(local.leaveRoom).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
  });

  it('restores chat images from the map', () => {
    expect(setup().remote.chatMessages[1].image).toBe('data:image/png;base64,AAA');
    expect(setup('playing', 'connected', {}).remote.chatMessages[1].image).toBeUndefined();
  });

  it('runs the clocks while playing', () => {
    vi.spyOn(performance, 'now').mockReturnValue(3_500);
    const { remote, snap } = setup();
    const game = (snap.fields.state as { game: { turn: 'X'; settings: { totalTimeMinutes: number; turnTimeSeconds: number } } }).game;
    expect(remote.clocksNow()).toEqual(liveClocks({ ...game, clocks } as never, 2_500));
    expect(remote.clocksNow()?.X).toBe(57_500);
  });

  it('freezes the clocks outside play or while the host is lost', () => {
    vi.spyOn(performance, 'now').mockReturnValue(3_500);
    expect(setup('ended').remote.clocksNow()).toEqual(clocks);
    expect(setup('playing', 'host_lost').remote.clocksNow()).toEqual(clocks);
  });

  it('counts grace and host time down from the snapshot', () => {
    vi.spyOn(performance, 'now').mockReturnValue(6_000);
    const { remote } = setup();
    expect(remote.graceSecondsLeft('m2')).toBe(15);
    expect(remote.graceSecondsLeft('m1')).toBeNull();
    expect(remote.graceSecondsLeft('nobody')).toBeNull();
    expect(remote.hostNow()).toBe(1_005_000);
  });
});

describe('applyRoomCall', () => {
  it('invokes allowed methods', () => {
    const { room, methods } = makeRoom();
    expect(applyRoomCall(room, 'move', [1, 2])).toBe(true);
    expect(methods.move).toHaveBeenCalledWith(1, 2);
  });

  it('refuses local-only, unknown and prototype keys', () => {
    const { room, methods } = makeRoom();
    expect(applyRoomCall(room, 'leaveRoom', [])).toBe(false);
    expect(methods.leaveRoom).not.toHaveBeenCalled();
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'clocksNow', 'nope']) {
      expect(applyRoomCall(room, key, []), key).toBe(false);
    }
    expect(methods.clocksNow).not.toHaveBeenCalled();
  });

  it('returns false when the method throws', () => {
    const { room, methods } = makeRoom();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    methods.resign.mockImplementation(() => { throw new Error('boom'); });
    expect(applyRoomCall(room, 'resign', [])).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
