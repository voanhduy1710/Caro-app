import { CLAIM_DISCONNECT_WIN_MS, createRoom, cryptoEnv, seatOf } from './roomEngine';
import type { RoomState } from './roomEngine';
import { endGame, newCtx } from './roomEngineLifecycle';

/** Ends the guest's local copy once the absent host has missed the same claim window as a guest. */
export const claimLostHost = (room: RoomState, claimantId: string, lostAt: number, now: number): RoomState | null => {
  const game = room.game;
  const host = room.members.find((member) => member.isHost);
  const claimantSeat = seatOf(room, claimantId);
  if (!game || !host || !claimantSeat || claimantSeat === 'T' || claimantId === host.id) return null;
  if (room.phase !== 'playing' && room.phase !== 'paused') return null;
  if (game.settings.playerMode !== 'oneVsOne' || now - lostAt < CLAIM_DISCONNECT_WIN_MS) return null;
  if (room.seats[claimantSeat === 'X' ? 'O' : 'X'] !== host.id) return null;

  // This engine is never published or used for networking. It lets the local
  // claim share the host's result, score and rating rules without copying them.
  const local = createRoom({
    roomId: room.roomId,
    isPublic: room.isPublic,
    mode: room.mode,
    settings: room.settings,
    hostProfile: { uid: host.profile.uid, name: host.profile.name, avatar: host.profile.avatar, isGuest: host.profile.guest },
  }, now);
  local.room = structuredClone(room);
  local.host.hostMemberId = host.id;
  local.host.runningSince = null; // stop at the last clocks received from the host
  endGame(local, claimantSeat, 'disconnected', null, newCtx(now, cryptoEnv));
  local.room.rev += 1;
  return local.room;
};
