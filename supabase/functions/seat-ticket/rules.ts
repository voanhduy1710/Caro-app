/**
 * Who may hold which seat ticket. Pure so vitest can test it (rules.test.ts).
 *
 * First writer wins: the first account to take a seat in a game keeps it
 * (unique game_id, seat in migration 20261118000300). The same account asking
 * again for the same seat gets its existing ticket; asking for the other seat,
 * or for a seat someone else holds, is refused.
 */

export type Seat = 'X' | 'O';

export interface ExistingTicket {
  uid: string;
  seat: string;
}

export type TicketDecision =
  | { action: 'exists' }
  | { action: 'insert' }
  | { action: 'refuse'; code: 'seat_taken' | 'seat_mismatch' };

export const decideTicket = (existing: ExistingTicket[], callerId: string, seat: Seat): TicketDecision => {
  const mine = existing.find((t) => t.uid === callerId);
  if (mine) return mine.seat === seat ? { action: 'exists' } : { action: 'refuse', code: 'seat_mismatch' };
  if (existing.some((t) => t.seat === seat)) return { action: 'refuse', code: 'seat_taken' };
  return { action: 'insert' };
};
