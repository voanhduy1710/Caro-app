-- Practice games against the AI bot. They used to live only in the browser's
-- localStorage, so a player's practice history vanished with cleared site data
-- or a new device. They are kept apart from gomoku_matches on purpose: that
-- table is public, feeds the leaderboard and only the service role may write
-- it, while a practice result is unverified and private to its player.

create table if not exists public.gomoku_practice_matches (
  id uuid primary key default gen_random_uuid(),
  uid text not null default (auth.uid())::text
    references public.gomoku_users (uid) on delete cascade,
  -- The record's id on the device that played it. With uid it makes the upload
  -- idempotent, so the same local game can be sent any number of times.
  client_id text not null check (char_length(client_id) between 1 and 64),
  player_name text not null check (char_length(player_name) between 1 and 64),
  result text not null check (result in ('win', 'loss', 'draw')),
  board_size integer not null check (board_size between 5 and 30),
  timer_config text check (char_length(timer_config) <= 32),
  played_at timestamptz not null check (played_at <= now() + interval '5 minutes'),
  created_at timestamptz not null default now(),
  unique (uid, client_id)
);

create index if not exists gomoku_practice_matches_uid_played_at_idx
  on public.gomoku_practice_matches (uid, played_at desc);

alter table public.gomoku_practice_matches enable row level security;

create policy "gomoku_practice_matches_select_own" on public.gomoku_practice_matches
  for select to authenticated
  using (uid = (select auth.uid())::text);

create policy "gomoku_practice_matches_insert_own" on public.gomoku_practice_matches
  for insert to authenticated
  with check (uid = (select auth.uid())::text);

-- Rows are append-only from the browser: no update, no delete, nothing for anon.
revoke all on public.gomoku_practice_matches from anon, authenticated;
grant select on public.gomoku_practice_matches to authenticated;
grant insert (uid, client_id, player_name, result, board_size, timer_config, played_at)
  on public.gomoku_practice_matches to authenticated;
