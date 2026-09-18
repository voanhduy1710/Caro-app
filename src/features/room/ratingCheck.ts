/**
 * What a seated player's own device checks before it records a result, and
 * the body it sends to submit-match.
 *
 * The host decides results, and the host is just another player's browser.
 * So before a registered player's client records a game against its own
 * account, it replays the game from its own mirror and confirms the result
 * could really have happened: the winning line is there, the resignation was
 * its own, the clock it saw had run out, and every stone in its seat since it
 * sat down is one it asked for. A result that fails is disputed, which keeps it
 * off the record; one it cannot judge (it arrived after a refresh, say) is
 * neither recorded nor disputed by this client.
 */
import { checkWin } from '../../shared/utils/gomokuLogic';
import type { RatedResultBody } from '../history/historyService';
import { boardFromMoves, otherSeat, pieceAt } from './roomEngine';
import type { Clocks, Game, GameResult, Seat } from './roomEngine';

/** How close to zero the losing clock must have looked here for a timeout to be believed. */
export const TIMEOUT_SLACK_MS = 3_000;

export type Verdict = 'confirmed' | 'contradicted' | 'unverifiable';

interface MyGameNotes {
  /** Every move this tab asked for in the game, as `${n}:${row}:${col}`. */
  requested: string[];
  resigned: boolean;
}

const notesKey = (gameId: string) => `caro_game_mine:${gameId}`;

/**
 * Kept in sessionStorage so a refresh in the middle of a game still knows which
 * stones were this player's own. A new tab has none, and cannot be the same
 * member anyway.
 */
const readNotes = (gameId: string): MyGameNotes => {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(notesKey(gameId)) || 'null');
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as MyGameNotes).requested)) {
      const notes = parsed as MyGameNotes;
      return {
        requested: notes.requested.filter((key): key is string => typeof key === 'string'),
        resigned: notes.resigned === true,
      };
    }
  } catch {
    // Unreadable notes are the same as none.
  }
  return { requested: [], resigned: false };
};

const writeNotes = (gameId: string, notes: MyGameNotes) => {
  try {
    sessionStorage.setItem(notesKey(gameId), JSON.stringify(notes));
  } catch {
    // Without storage the check falls back to what this tab saw since it loaded.
  }
};

export const noteRequestedMove = (gameId: string, n: number, row: number, col: number) => {
  const notes = readNotes(gameId);
  const key = `${n}:${row}:${col}`;
  if (!notes.requested.includes(key)) writeNotes(gameId, { ...notes, requested: [...notes.requested, key] });
};

export const noteResigned = (gameId: string) => {
  writeNotes(gameId, { ...readNotes(gameId), resigned: true });
};

/**
 * The move index from which `memberId` has held `seat` without a break, or
 * null when the seat log says they do not hold it. Moves before that index
 * belong to whoever sat there earlier and are not this player's to vouch for.
 */
export const mySeatSince = (game: Game, memberId: string, seat: Seat): number | null => {
  let since: number | null = game.startedWith[seat].memberId === memberId ? 0 : null;
  for (const change of game.seatLog) {
    if (change.seat !== seat) continue;
    if (change.to?.memberId === memberId) since = change.atMove;
    else if (change.from?.memberId === memberId) since = null;
  }
  return since;
};

export const verifyResult = (
  result: GameResult,
  game: Game | null,
  memberId: string,
  seat: Seat,
  /** The losing side's clocks as this device last showed them, when the game ended in play. */
  lastClocks: Clocks | null,
): Verdict => {
  if (!game || game.id !== result.gameId || game.moves.length !== result.movesLength) return 'unverifiable';
  const size = game.settings.boardSize;
  const notes = readNotes(game.id);

  // A host that places stones in my seat could otherwise walk me into a loss.
  const since = mySeatSince(game, memberId, seat);
  if (since === null) return 'contradicted';
  for (let i = since; i < game.moves.length; i += 1) {
    if (pieceAt(i, game.openingSeat) !== seat) continue;
    const [row, col] = game.moves[i];
    if (game.moveBy[i] !== memberId || !notes.requested.includes(`${i}:${row}:${col}`)) return 'contradicted';
  }

  const loser = result.winner === 'DRAW' ? null : otherSeat(result.winner);
  switch (result.reason) {
    case '5_in_a_row': {
      if (!loser || game.moves.length === 0) return 'contradicted';
      const last = game.moves.length - 1;
      const [row, col] = game.moves[last];
      const win = checkWin(boardFromMoves(game.moves, size, game.openingSeat), row, col, size);
      return win && win.winner === result.winner && pieceAt(last, game.openingSeat) === result.winner ? 'confirmed' : 'contradicted';
    }
    case 'board_full':
      return result.winner === 'DRAW' && game.moves.length === size * size ? 'confirmed' : 'contradicted';
    case 'resigned':
      // Only the loser can know whether they resigned; the winner takes it on
      // trust, and the loser's own client disputes a resignation it never sent.
      if (seat === loser) return notes.resigned ? 'confirmed' : 'contradicted';
      return 'confirmed';
    case 'disconnected':
      // The winner's client watched the room's reconnect grace period expire.
      // The disconnected player cannot report, so this allows the survivor to
      // submit the normal rated-result claim rather than leaving it unrecorded.
      return loser && seat !== loser ? 'confirmed' : 'unverifiable';
    case 'turn_timeout':
    case 'total_time_out': {
      if (!loser || game.turn !== loser) return 'contradicted';
      if (!lastClocks) return 'unverifiable';
      const limited = result.reason === 'turn_timeout' ? game.settings.turnTimeSeconds > 0 : game.settings.totalTimeMinutes > 0;
      if (!limited) return 'contradicted';
      const left = result.reason === 'turn_timeout' ? lastClocks.turn : lastClocks[loser];
      return left <= TIMEOUT_SLACK_MS ? 'confirmed' : 'contradicted';
    }
  }
};

/** The submit-match body for a result: the final occupants, the game id, and who sat where. */
export const buildRatedBody = (result: GameResult, game: Game | null): RatedResultBody => {
  const { X, O } = result.players;
  const body: RatedResultBody = {
    mode: 'pvp',
    boardSize: result.settings.boardSize,
    winnerUid: result.winner === 'DRAW' ? 'DRAW' : result.players[result.winner].uid,
    player1Uid: X.uid,
    player1Name: X.name,
    player2Uid: O.uid,
    player2Name: O.name,
    gameId: result.gameId,
  };
  if (game && game.id === result.gameId) {
    body.seatLog = {
      startedWith: { X: game.startedWith.X.uid, O: game.startedWith.O.uid },
      changes: game.seatLog.map((change) => ({
        seat: change.seat,
        fromUid: change.from?.uid ?? null,
        toUid: change.to?.uid ?? null,
        atMove: change.atMove,
        reason: change.reason,
      })),
    };
  }
  return body;
};
