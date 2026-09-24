import { createEmptyBoard } from '../../shared/utils/gomokuLogic';
import type { BoardMatrix } from '../../shared/utils/gomokuLogic';
import type { RoomSettings } from '../settings/types';
import { MAX_MEMBERS, RESULTS_CEILING, SEAT_LOG_CAP } from './roomEngineTypes';
import type { Clocks, EngineState, Game, GameResult, Member, PlayerRef, RoomState } from './roomEngineTypes';
import type { Seat } from './protocol';

export const SEATS: readonly Seat[] = ['X', 'O', 'T'];
export const activeSeats = (settings: RoomSettings): readonly Seat[] =>
  settings.playerMode === 'oneVsOneVsOne' ? SEATS : ['X', 'O'];

export const otherSeat = (seat: Seat): Seat => (seat === 'X' ? 'O' : 'X');

export const nextSeat = (seat: Seat, settings: RoomSettings): Seat => {
  const seats = activeSeats(settings);
  return seats[(seats.indexOf(seat) + 1) % seats.length];
};

export const pieceAt = (index: number, openingSeat: Seat = 'X', settings?: RoomSettings): Seat => {
  const seats = settings ? activeSeats(settings) : (['X', 'O'] as const);
  return seats[(seats.indexOf(openingSeat) + index) % seats.length];
};

export const boardFromMoves = (
  moves: ReadonlyArray<[number, number]>,
  size: number,
  openingSeat: Seat = 'X',
  settings?: RoomSettings,
): BoardMatrix => {
  const board = createEmptyBoard(size);
  moves.forEach(([row, col], i) => {
    board[row][col] = pieceAt(i, openingSeat, settings);
  });
  return board;
};

const roomOf = (state: EngineState | RoomState): RoomState => ('room' in state ? state.room : state);

export const findMember = (state: EngineState | RoomState, memberId: string | null): Member | undefined =>
  memberId === null ? undefined : roomOf(state).members.find((m) => m.id === memberId);

export const seatOf = (state: EngineState | RoomState, memberId: string | null): Seat | null => {
  const { seats } = roomOf(state);
  if (memberId === null) return null;
  if (seats.X === memberId) return 'X';
  if (seats.O === memberId) return 'O';
  if (seats.T === memberId) return 'T';
  return null;
};

export const occupant = (state: EngineState | RoomState, seat: Seat): Member | undefined =>
  findMember(state, roomOf(state).seats[seat]);

export const bothSeatedAndConnected = (state: EngineState | RoomState): boolean =>
  activeSeats(roomOf(state).settings).every((seat) => occupant(state, seat)?.connected === true);

/** The newest result, which the result card shows. */
export const latestResult = (state: EngineState | RoomState): GameResult | null => {
  const { results } = roomOf(state);
  return results.length ? results[results.length - 1] : null;
};

export const turnLimitMs = (settings: RoomSettings): number => settings.turnTimeSeconds * 1000;
export const bankLimitMs = (settings: RoomSettings): number => settings.totalTimeMinutes * 60_000;

/**
 * The clocks `ms` milliseconds after they were banked. Only a running clock
 * moves, and only the bank of the side to move, the per-move timer and the
 * elapsed time; a limit of 0 means unlimited, so that bank never moves.
 * Individual thinking time always accumulates so unlimited games still show
 * a useful clock for each player.
 * Clients call this with the time since the last ROOM_STATE, MOVE_APPLIED or
 * CLOCK_SYNC; the host calls it with the time since it last banked.
 */
export const liveClocks = (game: Pick<Game, 'clocks' | 'turn' | 'settings'>, ms: number): Clocks => {
  const clocks = {
    ...game.clocks,
    elapsedBySeat: { ...(game.clocks.elapsedBySeat ?? { X: 0, O: 0, T: 0 }) },
  };
  if (!clocks.running || ms <= 0) return clocks;
  if (game.settings.totalTimeMinutes > 0) clocks[game.turn] = Math.max(0, clocks[game.turn] - ms);
  if (game.settings.turnTimeSeconds > 0) clocks.turn = Math.max(0, clocks.turn - ms);
  clocks.elapsed += ms;
  clocks.elapsedBySeat[game.turn] += ms;
  return clocks;
};

export const liveClocksAt = (state: EngineState, now: number): Clocks | null => {
  const { game } = state.room;
  if (!game) return null;
  const since = state.host.runningSince;
  return liveClocks(game, since === null ? 0 : now - since);
};

export const playerRef = (member: Member): PlayerRef => ({
  memberId: member.id,
  uid: member.profile.uid,
  name: member.profile.name,
  rated: member.profile.rated,
  guest: member.profile.guest,
});

export type RatingDecision =
  | { rated: false; why: 'guest' | 'local_account'; guestSeats: Seat[] }
  | { rated: true; submitters: Seat[] };

/**
 * Who, if anyone, submits a result to the rating server.
 *
 * The server only accepts a submission from a player whose rating does not go
 * up, so the protection comes from the server, not from this choice. The
 * choice only has to name a client the server will accept: the loser on a
 * decisive result. On a draw the host cannot know which side's delta is not
 * positive, because that depends on stored ratings it cannot trust, so both
 * registered players attempt with the same gameId; the server keeps one and
 * refuses the other, and the idempotency key stops a double count.
 */
export const ratingDecision = (result: Pick<GameResult, 'winner' | 'players'>): RatingDecision => {
  const ratedSeats = result.players.T.memberId === result.players.X.memberId ? (['X', 'O'] as const) : SEATS;
  const unratedSeats = ratedSeats.filter((seat) => !result.players[seat].rated);
  if (unratedSeats.length > 0) {
    const anyGuest = unratedSeats.some((seat) => result.players[seat].guest);
    return { rated: false, why: anyGuest ? 'guest' : 'local_account', guestSeats: unratedSeats };
  }
  if (result.winner === 'DRAW') return { rated: true, submitters: ['X', 'O'] };
  return { rated: true, submitters: [otherSeat(result.winner)] };
};

/** Every rule the room must hold between two host mutations; empty when all hold. */
export const checkInvariants = (state: EngineState | RoomState): string[] => {
  const room = roomOf(state);
  const problems: string[] = [];
  const hasGame = room.game !== null;
  const gamePhase = room.phase !== 'waiting';
  if (hasGame !== gamePhase) problems.push(`phase ${room.phase} with game ${hasGame ? 'present' : 'absent'}`);
  if (room.phase === 'playing') {
    if (!bothSeatedAndConnected(room)) problems.push('playing without two connected occupants');
    if (!room.game?.clocks.running) problems.push('playing with stopped clocks');
  }
  if (room.game?.clocks.running && room.phase !== 'playing') problems.push('clocks running outside playing');
  if ((room.countdown !== null) !== (room.phase === 'countdown')) problems.push('countdown out of step with phase');
  const occupiedIds = SEATS.map((seat) => room.seats[seat]).filter((id): id is string => id !== null);
  if (new Set(occupiedIds).size !== occupiedIds.length) problems.push('one member in multiple seats');
  for (const seat of SEATS) {
    const id = room.seats[seat];
    if (id !== null && !room.members.some((m) => m.id === id)) problems.push(`seat ${seat} holds a non-member`);
  }
  const x = occupant(room, 'X');
  const o = occupant(room, 'O');
  if (x && o && x.profile.uid === o.profile.uid) problems.push('one account in both seats');
  if (room.members.length > MAX_MEMBERS) problems.push('too many members');
  if (!room.members[0]?.isHost || room.members.filter((m) => m.isHost).length !== 1) {
    problems.push('host is not the single first member');
  }
  if (room.game && room.game.moveBy.length !== room.game.moves.length) problems.push('moveBy out of step with moves');
  if (room.game && room.game.seatLog.length > SEAT_LOG_CAP) problems.push('seatLog over its cap');
  if (room.results.length > RESULTS_CEILING) problems.push('results over their ceiling');
  if ('host' in state) {
    if ((state.host.runningSince !== null) !== (room.game?.clocks.running === true)) {
      problems.push('runningSince out of step with the clocks');
    }
    if ((state.host.countdownEndsAt !== null) !== (room.phase === 'countdown')) {
      problems.push('countdown deadline out of step with phase');
    }
  }
  return problems;
};

// ---------------------------------------------------------------------------

