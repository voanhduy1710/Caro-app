import { useCallback } from 'react';
import { liveClocks } from './roomEngine';
import type { Clocks, RoomState } from './roomEngine';

interface TimingState { mirror: RoomState | null; receivedAt: number; hostLostSince: number | null; }

export const useRoomTiming = (state: TimingState, room: RoomState | null, hostLostSince: number | null, hostLostGiveUpMs: number) => {
  const clocksNow = useCallback((): Clocks | null => {
    const current = state.mirror;
    const game = current?.game;
    if (!current || !game) return null;
    return current.phase === 'playing' && state.hostLostSince === null
      ? liveClocks(game, performance.now() - state.receivedAt)
      : game.clocks;
  }, [state]);
  const elapsed = () => performance.now() - state.receivedAt;
  const countdownSecondsLeft = room?.countdown ? Math.max(0, Math.ceil((room.countdown.msLeft - elapsed()) / 1000)) : null;
  const graceSecondsLeft = useCallback((memberId: string): number | null => {
    const member = state.mirror?.members.find((candidate) => candidate.id === memberId);
    if (!member || member.connected || member.graceMsLeft === null) return null;
    return Math.max(0, Math.ceil((member.graceMsLeft - elapsed()) / 1000));
  }, [state]);
  const hostNow = useCallback(() => state.mirror ? state.mirror.sentAt + elapsed() : Date.now(), [state]);
  const hostGraceSecondsLeft = hostLostSince === null ? null : Math.max(0, Math.ceil((hostLostGiveUpMs - (Date.now() - hostLostSince)) / 1000));
  return { clocksNow, countdownSecondsLeft, graceSecondsLeft, hostNow, hostGraceSecondsLeft };
};
