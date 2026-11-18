-- What: one seat ticket per seat per game: unique (game_id, seat). The first
--   player to take a seat keeps it; a second account asking for the same seat
--   is refused by seat-ticket. With the existing primary key (game_id, uid) a
--   game therefore has at most two tickets, on opposite seats.
-- Why: any registered account could take a ticket for any game id, so a
--   spectator (or a throwaway account) could join a real game's tickets and
--   then dispute or void its result, and two accounts controlled by one person
--   could both "sit" in X.
-- When: apply BEFORE deploying the new seat-ticket and submit-match functions
--   (the new submit-match relies on there being at most one ticket per seat).
--   Safe with the deployed functions: the old seat-ticket's insert for an
--   already-taken seat now fails with 23505 and it answers 500, which the
--   deployed client retries and then gives up on - the same "no ticket"
--   outcome the new function gives on purpose.
--   Read-only check on the live database (2026-11-18): 333 tickets, no
--   (game_id, seat) duplicates. The delete below is kept for a duplicate
--   written between that check and this migration: it keeps the earliest
--   ticket for the seat (first writer wins), exactly what the new rule says.
-- Rollback: drop index if exists public.gomoku_game_seats_game_seat_key;
--   (any deleted duplicate tickets are not restored; they could not have been
--   used by the new rules anyway).

delete from public.gomoku_game_seats s
using public.gomoku_game_seats earlier
where s.game_id = earlier.game_id
  and s.seat = earlier.seat
  and s.uid <> earlier.uid
  and (earlier.created_at, earlier.uid) < (s.created_at, s.uid);

create unique index if not exists gomoku_game_seats_game_seat_key
  on public.gomoku_game_seats (game_id, seat);
