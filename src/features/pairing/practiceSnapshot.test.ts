import { describe, expect, it, vi } from 'vitest';
import type { PracticeMatchViewProps } from '../../app/PracticeMatchView';
import { applyPracticeCall, buildPracticeSnapshot, createRemotePracticeProps, isConfirmedRematch, PRACTICE_CALLS, rematchNeedsConfirm } from './practiceSnapshot';

const makeProps = (): PracticeMatchViewProps => ({
  user: { uid: 'u1', displayName: 'Me' } as unknown as PracticeMatchViewProps['user'],
  openProfileModal: vi.fn(), setOpponent: vi.fn(),
  settings: { totalTimeMinutes: 5, playerMode: 'oneVsOne' } as unknown as PracticeMatchViewProps['settings'],
  board: [[null, 'X'], ['O', null]] as unknown as PracticeMatchViewProps['board'],
  placementCorners: { '0,1': 'center' } as unknown as PracticeMatchViewProps['placementCorners'],
  onCellClick: vi.fn(), lastMove: [0, 1], winningLine: null, currentTurn: 'O', myPiece: 'X',
  gameStatus: 'playing', gameResult: null, ratingNote: null,
  p1TotalTime: 100, p2TotalTime: 90, p1ElapsedTime: 1, p2ElapsedTime: 2, turnTimeLeft: 20, isAiThinking: false, elapsedGameTime: 3,
  moveHistory: [{ piece: 'X', row: 0, col: 1 }] as unknown as PracticeMatchViewProps['moveHistory'],
  sessionScore: { mine: 1, theirs: 0, triangle: 0 },
  onUndo: vi.fn(), onRematch: vi.fn(), onExit: vi.fn(), onBotFirst: vi.fn(),
});

describe('practiceSnapshot', () => {
  it('builds a JSON-clean snapshot without local or callback props', () => {
    const snap = buildPracticeSnapshot(makeProps());
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    for (const key of ['user', 'openProfileModal', 'setOpponent', 'onExit', ...PRACTICE_CALLS]) expect(snap).not.toHaveProperty(key);
    expect(snap.currentTurn).toBe('O');
  });

  it('forwards remote actions as calls and keeps local props local', () => {
    const call = vi.fn();
    const local = { user: null, openProfileModal: vi.fn(), setOpponent: vi.fn(), onExit: vi.fn() };
    const remote = createRemotePracticeProps(buildPracticeSnapshot(makeProps()), call, local);
    remote.onCellClick(2, 3, 'center');
    expect(call).toHaveBeenCalledWith('onCellClick', [2, 3, 'center']);
    const click = { type: 'click', target: {} };
    (remote.onUndo as (e: unknown) => void)(click); (remote.onRematch as (e: unknown) => void)(click); (remote.onBotFirst as (e: unknown) => void)(click);
    expect(call.mock.calls).toEqual([['onCellClick', [2, 3, 'center']], ['onUndo', []], ['onRematch', []], ['onBotFirst', []]]);
    expect(remote.onExit).toBe(local.onExit);
    expect(remote.user).toBeNull();
    expect(remote.openProfileModal).toBe(local.openProfileModal);
    expect(remote.setOpponent).toBe(local.setOpponent);
    expect(remote.board).toEqual(makeProps().board);
  });

  it('asks on the phone before starting over a game in progress, then sends it confirmed', () => {
    const call = vi.fn();
    const local = { user: null, openProfileModal: vi.fn(), setOpponent: vi.fn(), onExit: vi.fn() };
    let pending: (() => void) | null = null;
    const confirm = vi.fn((run: () => void) => { pending = run; });
    const remote = createRemotePracticeProps(buildPracticeSnapshot(makeProps()), call, local, confirm);
    remote.onRematch();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
    (pending as unknown as () => void)();
    expect(call).toHaveBeenCalledWith('onRematch', [{ confirmed: true }]);
  });

  it('starts over at once on the phone when nothing would be lost', () => {
    const call = vi.fn();
    const local = { user: null, openProfileModal: vi.fn(), setOpponent: vi.fn(), onExit: vi.fn() };
    const confirm = vi.fn();
    const ended = { ...makeProps(), gameStatus: 'ended' as const };
    createRemotePracticeProps(buildPracticeSnapshot(ended), call, local, confirm).onRematch();
    expect(confirm).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith('onRematch', [{ confirmed: true }]);
  });

  it('decides when starting over needs confirming', () => {
    expect(rematchNeedsConfirm(makeProps())).toBe(true);
    expect(rematchNeedsConfirm({ ...makeProps(), moveHistory: [] })).toBe(false);
    expect(rematchNeedsConfirm({ ...makeProps(), gameStatus: 'ended' })).toBe(false);
  });

  it('treats only an explicit confirmed flag as confirmed', () => {
    expect(isConfirmedRematch({ confirmed: true })).toBe(true);
    for (const v of [undefined, null, true, 'confirmed', [], {}, { confirmed: 'true' }, { confirmed: 1 }, Object.create({ confirmed: true }), { type: 'click' }]) {
      expect(isConfirmedRematch(v), JSON.stringify(v)).toBe(false);
    }
  });

  it('passes the confirmed flag through to the desktop callback', () => {
    const p = makeProps();
    expect(applyPracticeCall(p, 'onRematch', [{ confirmed: true }])).toBe(true);
    expect(p.onRematch).toHaveBeenCalledWith({ confirmed: true });
  });

  it('applies only allowlisted calls', () => {
    const p = makeProps();
    expect(applyPracticeCall(p, 'onExit', [])).toBe(false);
    expect(p.onExit).not.toHaveBeenCalled();
    expect(applyPracticeCall(p, 'onUndo', [])).toBe(true);
    expect(p.onUndo).toHaveBeenCalledTimes(1);
    expect(applyPracticeCall(p, 'onCellClick', [1, 2, 'center'])).toBe(true);
    expect(p.onCellClick).toHaveBeenCalledWith(1, 2, 'center');
    for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'board', 'nope']) expect(applyPracticeCall(p, bad, [])).toBe(false);
    expect(applyPracticeCall(p, 'onUndo', 'x' as unknown as unknown[])).toBe(false);
  });

  it('returns false and warns when the callback throws', () => {
    const p = makeProps();
    p.onRematch = () => { throw new Error('boom'); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(applyPracticeCall(p, 'onRematch', [])).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
