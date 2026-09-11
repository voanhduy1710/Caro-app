-- Seat tickets and pending claims: how a winner can record a result the loser
-- walked away from, without letting anyone record a game that never happened.
--
-- submit-match only records a result immediately when it comes from the player
-- it does not favour. That stops fabricated wins, but it let a loser dodge by
-- closing the tab before their client submitted. A seat ticket is a row a
-- registered player writes through their own session when they sit in a game:
-- proof that this account really played game G. With tickets from BOTH
-- players, the winner's claim is held for ten minutes and then recorded unless
-- a player disputes it. A loser who concedes records it at once; a client that
-- cannot confirm the result disputes it, and a disputed game counts for nobody.

create table if not exists public.gomoku_game_seats (
  game_id text not null,
  uid text not null,
  seat text not null check (seat in ('X', 'O')),
  room_id text,
  created_at timestamptz not null default now(),
  primary key (game_id, uid)
);

create table if not exists public.gomoku_match_claims (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  claimant_uid text not null,
  mode text not null default 'pvp',
  board_size integer not null,
  winner_uid text not null,
  player1_uid text not null,
  player1_name text not null,
  player2_uid text not null,
  player2_name text not null,
  seat_log jsonb,
  status text not null default 'pending' check (status in ('pending', 'final', 'disputed', 'superseded')),
  confirm_after timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now(),
  unique (game_id, claimant_uid)
);

create index if not exists gomoku_match_claims_due
  on public.gomoku_match_claims (confirm_after) where status = 'pending';

-- Only the edge functions, through the service role, and the definer function
-- below touch these tables.
alter table public.gomoku_game_seats enable row level security;
alter table public.gomoku_match_claims enable row level security;
revoke all on public.gomoku_game_seats from anon, authenticated;
revoke all on public.gomoku_match_claims from anon, authenticated;

-- Records every claim whose window has closed. The rating arithmetic mirrors
-- submit-match exactly, including Math.round's rounding of halves towards +inf,
-- so a game scores the same whichever path records it. Safe for anyone to call:
-- it only ever acts on claims that are already due.
create or replace function public.finalize_due_match_claims()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  due record;
  claim public.gomoku_match_claims%rowtype;
  winners text[];
  u1 public.gomoku_users%rowtype;
  u2 public.gomoku_users%rowtype;
  has1 boolean;
  has2 boolean;
  elo1 numeric;
  elo2 numeric;
  score1 numeric;
  d1 integer;
  d2 integer;
  inserted_id text;
  finalized integer := 0;
begin
  for due in
    select distinct game_id
    from public.gomoku_match_claims
    where status = 'pending' and confirm_after <= now()
  loop
    -- Serialise with any other finaliser working on the same game.
    perform 1 from public.gomoku_match_claims where game_id = due.game_id for update;

    -- The loser already conceded through submit-match: nothing left to apply.
    if exists (select 1 from public.gomoku_matches where game_id = due.game_id) then
      update public.gomoku_match_claims set status = 'superseded'
        where game_id = due.game_id and status = 'pending';
      continue;
    end if;

    -- Claims that disagree, or any dispute, and the game counts for nobody.
    select array_agg(distinct winner_uid) into winners
      from public.gomoku_match_claims
      where game_id = due.game_id and status in ('pending', 'disputed');
    if coalesce(array_length(winners, 1), 0) <> 1 or winners[1] = 'DISPUTED' then
      update public.gomoku_match_claims set status = 'disputed'
        where game_id = due.game_id and status = 'pending';
      continue;
    end if;

    select * into claim from public.gomoku_match_claims
      where game_id = due.game_id and status = 'pending'
      order by created_at
      limit 1;
    if not found then
      continue;
    end if;

    select * into u1 from public.gomoku_users where uid = claim.player1_uid;
    has1 := found;
    select * into u2 from public.gomoku_users where uid = claim.player2_uid;
    has2 := found;
    elo1 := case when has1 then coalesce(u1.elo, 1200) else 1200 end;
    elo2 := case when has2 then coalesce(u2.elo, 1200) else 1200 end;
    score1 := case
      when claim.winner_uid = 'DRAW' then 0.5
      when claim.winner_uid = claim.player1_uid then 1
      else 0
    end;
    d1 := floor(32 * (score1 - 1 / (1 + power(10::numeric, (elo2 - elo1) / 400))) + 0.5);
    d2 := floor(32 * ((1 - score1) - 1 / (1 + power(10::numeric, (elo1 - elo2) / 400))) + 0.5);

    inserted_id := null;
    insert into public.gomoku_matches (
      mode, board_size, winner_uid, player1_uid, player1_name, player2_uid, player2_name,
      elo_delta_player1, elo_delta_player2, "timestamp", game_id, seat_log
    ) values (
      claim.mode, claim.board_size, claim.winner_uid, claim.player1_uid, claim.player1_name,
      claim.player2_uid, claim.player2_name,
      case when has1 then d1 else 0 end, case when has2 then d2 else 0 end,
      now(), claim.game_id, claim.seat_log
    )
    on conflict (game_id) do nothing
    returning id into inserted_id;

    if inserted_id is not null then
      if has1 then
        update public.gomoku_users set
          elo = greatest(100, coalesce(u1.elo, 1200) + d1),
          wins = coalesce(u1.wins, 0) + case when claim.winner_uid = claim.player1_uid then 1 else 0 end,
          losses = coalesce(u1.losses, 0) + case when claim.winner_uid not in (claim.player1_uid, 'DRAW') then 1 else 0 end,
          draws = coalesce(u1.draws, 0) + case when claim.winner_uid = 'DRAW' then 1 else 0 end,
          streak = case when claim.winner_uid = claim.player1_uid then coalesce(u1.streak, 0) + 1 else 0 end,
          updated_at = now()
        where uid = claim.player1_uid;
      end if;
      if has2 then
        update public.gomoku_users set
          elo = greatest(100, coalesce(u2.elo, 1200) + d2),
          wins = coalesce(u2.wins, 0) + case when claim.winner_uid = claim.player2_uid then 1 else 0 end,
          losses = coalesce(u2.losses, 0) + case when claim.winner_uid not in (claim.player2_uid, 'DRAW') then 1 else 0 end,
          draws = coalesce(u2.draws, 0) + case when claim.winner_uid = 'DRAW' then 1 else 0 end,
          streak = case when claim.winner_uid = claim.player2_uid then coalesce(u2.streak, 0) + 1 else 0 end,
          updated_at = now()
        where uid = claim.player2_uid;
      end if;
      finalized := finalized + 1;
    end if;

    update public.gomoku_match_claims set status = 'final'
      where game_id = due.game_id and status = 'pending';
  end loop;

  return finalized;
end;
$$;

revoke all on function public.finalize_due_match_claims() from public;
grant execute on function public.finalize_due_match_claims() to anon, authenticated, service_role;
