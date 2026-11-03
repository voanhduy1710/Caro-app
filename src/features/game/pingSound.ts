import type { BoardPings } from '../room/protocol';

/** Observe accepted shared markers, with one sound budget for the whole room. */
export function createPingSoundNotifier() {
  let previousGame: string | null | undefined;
  let previous: BoardPings = {};
  let lastSoundAt: number | null = null;
  return (gameId: string | null, pings: BoardPings | undefined, now: number, play: () => void) => {
    const next = pings ?? {};
    const changed = (['X', 'O', 'T'] as const).some((seat) => {
      const ping = next[seat];
      return ping && (ping.row !== previous[seat]?.row || ping.col !== previous[seat]?.col);
    });
    const sameGame = gameId !== null && gameId === previousGame;
    previousGame = gameId;
    previous = structuredClone(next);
    // Rejoins and initial snapshots establish a baseline, rather than replaying old pings.
    if (!sameGame || !changed || (lastSoundAt !== null && now - lastSoundAt < 5_000)) return;
    lastSoundAt = now;
    play();
  };
}
