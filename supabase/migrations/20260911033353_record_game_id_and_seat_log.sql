-- A game played in a room now has an id, so the same result can be submitted
-- more than once - a retry after a lost response, or both players offering a
-- draw - and still be recorded exactly once. The unique index is what makes
-- that hold under a race: the second insert fails with 23505 instead of
-- applying the ratings twice. NULLs never collide, so rows from clients that
-- send no id are unaffected.
--
-- seat_log keeps who held each seat and when, since a seat can change hands
-- mid-game and the rating goes to whoever sits at the end. It is stored so
-- that rule can be tightened later with real data behind it.
alter table public.gomoku_matches
  add column if not exists game_id text,
  add column if not exists seat_log jsonb;

create unique index if not exists gomoku_matches_game_id_key
  on public.gomoku_matches (game_id);
