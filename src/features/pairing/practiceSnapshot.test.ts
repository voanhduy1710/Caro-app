import { describe, expect, it, vi } from 'vitest';
import type { PracticeMatchViewProps } from '../../app/PracticeMatchView';
import { applyPracticeCall, buildPracticeSnapshot, createRemotePracticeProps, PRACTICE_CALLS } from './practiceSnapshot';

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
    remote.onUndo(); remote.onRematch(); remote.onBotFirst();
    expect(call.mock.calls.map((c) => c[0])).toEqual(['onCellClick', 'onUndo', 'onRematch', 'onBotFirst']);
    expect(remote.onExit).toBe(local.onExit);
    expect(remote.user).toBeNull();
    expect(remote.openProfileModal).toBe(local.openProfileModal);
    expect(remote.setOpponent).toBe(local.setOpponent);
    expect(remote.board).toEqual(makeProps().board);
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
