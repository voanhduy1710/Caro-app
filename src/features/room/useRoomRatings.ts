import type { MutableRefObject } from 'react';
import { supabase } from '../../config/supabase';
import { requestSeatTicket, resendPendingRatedResults, saveMatchRecord, submitRatedResult } from '../history/historyService';
import type { RatedSubmitOutcome } from '../history/historyService';
import type { UserProfile } from '../auth/AuthContext';
import { SEATS, seatOf } from './roomEngine';
import type { Clocks, Game, GameResult, RoomState } from './roomEngine';
import type { Intent, IntentPayloads, RatingReportStatus, Seat } from './protocol';
import { buildRatedBody, verifyResult } from './ratingCheck';
import { signed } from './useRoomUtilities';

export interface RoomRatingState {
  mirror: RoomState | null;
  memberId: string | null;
  games: Map<string, Game>;
  resultClocks: Map<string, Clocks | null>;
  handled: Set<string>;
  tickets: Set<string>;
  ticketRequests: Set<string>;
  ratedRefreshed: Set<string>;
  terminal: boolean;
}

interface CreateRoomRatingsOptions {
  state: RoomRatingState;
  userRef: MutableRefObject<UserProfile | null>;
  handlersRef: MutableRefObject<{ onRated?: () => void }>;
  sendIntent: (intent: Intent) => boolean;
  setRatingNotes: (update: (previous: Record<string, string>) => Record<string, string>) => void;
  writeHandled: (handled: string[]) => void;
}

export const createRoomRatings = ({ state, userRef, handlersRef, sendIntent, setRatingNotes, writeHandled }: CreateRoomRatingsOptions) => {
  const setRatingNote = (gameId: string, text: string) =>
    setRatingNotes((previous) => (previous[gameId] === text ? previous : { ...previous, [gameId]: text }));

  const report = (gameId: string, status: RatingReportStatus, why?: string, deltas?: { X: number; O: number }) => {
    const payload: IntentPayloads['RATING_REPORT'] = { gameId, status };
    if (why) payload.why = why.slice(0, 200);
    if (deltas) payload.deltas = deltas;
    sendIntent({ type: 'RATING_REPORT', payload });
  };

  const writeLocalHistory = (result: GameResult) => {
    const { X, O } = result.players;
    const winner = result.winner === 'DRAW' ? null : result.players[result.winner];
    void saveMatchRecord({
      mode: 'pvp', player1Uid: X.uid, player2Uid: O.uid, player1Name: X.name, player2Name: O.name,
      winnerUid: winner ? winner.uid : 'DRAW', winnerName: winner ? winner.name : 'DRAW',
      boardSize: result.settings.boardSize, timerConfig: `${result.settings.totalTimeMinutes}m / ${result.settings.turnTimeSeconds}s`,
      eloDeltaPlayer1: 0, eloDeltaPlayer2: 0, gameId: result.gameId,
    }, { localOnly: true });
  };

  const submitFor = async (result: GameResult, seat: Seat) => {
    const player = result.players[seat];
    const rating = result.rating;
    if (rating.status === 'unrated') return;
    const isSubmitter = rating.status === 'pending' && rating.submitters.includes(seat);
    const user = userRef.current;
    if (!user || user.isGuest || user.uid !== player.uid || !player.rated || !supabase) {
      if (isSubmitter) report(result.gameId, 'skipped', 'no_session');
      return;
    }
    let sessionUid: string | null = null;
    try { sessionUid = (await supabase.auth.getSession()).data.session?.user.id ?? null; } catch { /* treated as signed out */ }
    if (sessionUid !== player.uid) {
      if (isSubmitter) report(result.gameId, 'skipped', 'no_session');
      return;
    }
    const game = state.games.get(result.gameId) ?? null;
    const verdict = verifyResult(result, game, player.memberId, seat, state.resultClocks.get(result.gameId) ?? null);
    if (verdict === 'unverifiable') {
      setRatingNote(result.gameId, 'Not rated: the result could not be confirmed on this device.');
      if (isSubmitter) report(result.gameId, 'skipped', 'unverified');
      return;
    }
    const body = buildRatedBody(result, game);
    if (verdict === 'contradicted') body.dispute = true;
    let outcome: RatedSubmitOutcome = await submitRatedResult(body);
    for (let attempt = 1; outcome.status === 'network' && attempt < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      outcome = await submitRatedResult(body);
    }
    switch (outcome.status) {
      case 'saved': {
        const mine = seat === 'X' ? outcome.deltas.player1 : outcome.deltas.player2;
        setRatingNote(result.gameId, `Rating ${signed(mine)}`);
        if (isSubmitter) report(result.gameId, 'saved', undefined, { X: outcome.deltas.player1, O: outcome.deltas.player2 });
        handlersRef.current.onRated?.(); return;
      }
      case 'duplicate': if (isSubmitter) report(result.gameId, 'saved'); handlersRef.current.onRated?.(); return;
      case 'pending_claim': setRatingNote(result.gameId, 'Rating pending: recorded in 10 minutes unless disputed.'); if (isSubmitter) report(result.gameId, 'skipped', 'claim_pending'); return;
      case 'disputed': setRatingNote(result.gameId, 'Not rated: the result was disputed.'); if (isSubmitter) report(result.gameId, 'skipped', 'disputed'); return;
      case 'refused':
        if (outcome.code !== 'caller_would_gain' && outcome.code !== 'already_recorded') setRatingNote(result.gameId, 'Not rated.');
        if (outcome.code === 'caller_would_gain' && !isSubmitter) setRatingNote(result.gameId, 'Rating pending: confirming both players were seated…');
        if (isSubmitter) report(result.gameId, 'skipped', outcome.code); return;
      case 'failed': setRatingNote(result.gameId, 'The rating could not be saved.'); if (isSubmitter) report(result.gameId, 'failed', outcome.why); return;
      case 'network': setRatingNote(result.gameId, 'No connection. The rating will be sent when you are back online.'); if (isSubmitter) report(result.gameId, 'unknown', 'network'); return;
    }
  };

  const processResults = () => {
    const room = state.mirror;
    const memberId = state.memberId;
    if (!room || !memberId) return;
    for (const result of room.results) {
      const seat = SEATS.find((candidate) => result.players[candidate].memberId === memberId);
      if (!seat) continue;
      if (result.rating.status === 'saved' && !state.ratedRefreshed.has(result.gameId)) {
        state.ratedRefreshed.add(result.gameId);
        handlersRef.current.onRated?.();
      }
      if (state.handled.has(result.gameId)) continue;
      state.handled.add(result.gameId);
      writeHandled(Array.from(state.handled).slice(-50));
      writeLocalHistory(result);
      void submitFor(result, seat);
    }
  };

  const requestTickets = () => {
    const room = state.mirror;
    const memberId = state.memberId;
    const user = userRef.current;
    const game = room?.game;
    if (!room || !game || !memberId || !user || user.isGuest) return;
    if (!['opening', 'countdown', 'playing', 'paused'].includes(room.phase)) return;
    const seat = seatOf(room, memberId);
    const member = room.members.find((candidate) => candidate.id === memberId);
    if (!seat || !member?.profile.rated || seat === 'T') return;
    const key = `${game.id}:${seat}`;
    if (state.tickets.has(key) || state.ticketRequests.has(key)) return;
    state.ticketRequests.add(key);
    void requestSeatTicket(game.id, seat, room.roomId)
      .then((saved) => saved ? (state.tickets.add(key), resendPendingRatedResults().then(() => handlersRef.current.onRated?.())) : undefined)
      .finally(() => {
        state.ticketRequests.delete(key);
        if (!state.tickets.has(key) && state.mirror?.game?.id === game.id && !state.terminal) window.setTimeout(requestTickets, 5_000);
      });
  };

  return { processResults, requestTickets };
};
