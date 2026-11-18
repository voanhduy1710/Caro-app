-- What: the anti-farming rules for rated games, on the database side.
--   1. gomoku_matches.unrated_reason: null on a rated row; on a game recorded
--      for history only it says why ('pair_daily_limit', 'pair_gain_cap').
--   2. gomoku_match_claims.move_count / duration_ms: what the claimant's client
--      reported, so submit-match can compare both players' reports.
--   3. gomoku_pair_day_stats(a, b): today's (UTC) rated games between two
--      accounts and what each gained from the other. submit-match calls it.
--   4. finalize_due_match_claims: a claim is recorded only when both players
--      hold seat tickets on opposite seats, the game looks long enough, names
--      come from gomoku_users, and the per-pair daily limits hold; over a limit
--      the game is recorded unrated (deltas 0, no W/L/D, no streak).
-- Why: a throwaway account could feed a main account Elo by losing to it in a
--   loop; the losing path needed no ticket from the opponent and nothing
--   limited how often one pair could play.
-- Constants (keep in step with supabase/functions/submit-match/rules.ts):
--   PAIR_DAILY_RATED_LIMIT 10, PAIR_DAILY_GAIN_CAP 60, MIN_RATED_MOVES 9,
--   MIN_RATED_SECONDS 20.
-- When: apply BEFORE deploying the new submit-match (it calls
--   gomoku_pair_day_stats and writes unrated_reason / move_count /
--   duration_ms) and after 20261118000300. Safe with the deployed submit-match
--   and client: every change is additive, the old function writes none of the
--   new columns (null = rated, as before), and only the finaliser's own
--   behaviour changes. Until the new submit-match is deployed its losing path
--   still records without limits; only claims get the new rules.
-- Rollback: re-run the finalize_due_match_claims definition from
--   20261016034515_min_elo_change.sql; drop function public.gomoku_pair_day_stats(text, text);
--   the added columns and index can stay (nothing reads them then).

alter table public.gomoku_matches
  add column if not exists unrated_reason text;

alter table public.gomoku_match_claims
  add column if not exists move_count integer,
  add column if not exists duration_ms integer;

create index if not exists gomoku_matches_timestamp_idx
  on public.gomoku_matches ("timestamp");

create or replace function public.gomoku_pair_day_stats(uid_a text, uid_b text)
returns table (rated_games integer, gained_a integer, gained_b integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::integer,
    coalesce(sum(case when m.player1_uid = uid_a then greatest(m.elo_delta_player1, 0)
                      else greatest(m.elo_delta_player2, 0) end), 0)::integer,
    coalesce(sum(case when m.player1_uid = uid_b then greatest(m.elo_delta_player1, 0)
                      else greatest(m.elo_delta_player2, 0) end), 0)::integer
  from public.gomoku_matches m
  where m.unrated_reason is null
    and m."timestamp" >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
    and ((m.player1_uid = uid_a and m.player2_uid = uid_b)
      or (m.player1_uid = uid_b and m.player2_uid = uid_a));
$$;

revoke all on function public.gomoku_pair_day_stats(text, text) from public, anon, authenticated;
grant execute on function public.gomoku_pair_day_stats(text, text) to service_role;

create or replace function public.finalize_due_match_claims()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Keep in step with supabase/functions/submit-match/rules.ts.
  pair_daily_rated_limit constant integer := 10;
  pair_daily_gain_cap constant integer := 60;
  min_rated_moves constant integer := 9;
  min_rated_seconds constant integer := 20;

  due record;
  claim public.gomoku_match_claims%rowtype;
  winners text[];
  u1 public.gomoku_users%rowtype;
  u2 public.gomoku_users%rowtype;
  has1 boolean;
  has2 boolean;
  score1 numeric;
  d1 integer;
  d2 integer;
  bonus integer;
  seat_count integer;
  ticket_count integer;
  first_ticket_at timestamptz;
  stats record;
  room integer;
  reason text;
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

    -- Both players seated in this game on opposite seats, both registered,
    -- and a game of some length. Claims written by an older submit-match were
    -- not checked for this, so it is checked here for every claim.
    select count(*), count(distinct seat), min(created_at)
      into ticket_count, seat_count, first_ticket_at
      from public.gomoku_game_seats
      where game_id = claim.game_id and uid in (claim.player1_uid, claim.player2_uid);
    if not has1 or not has2 or ticket_count <> 2 or seat_count <> 2
      or claim.created_at < first_ticket_at + make_interval(secs => min_rated_seconds)
      or (claim.move_count is not null and claim.move_count < min_rated_moves)
      or (claim.duration_ms is not null and claim.duration_ms < min_rated_seconds * 1000)
    then
      update public.gomoku_match_claims set status = 'disputed'
        where game_id = due.game_id and status = 'pending';
      continue;
    end if;

    score1 := case
      when claim.winner_uid = 'DRAW' then 0.5
      when claim.winner_uid = claim.player1_uid then 1
      else 0
    end;
    d1 := floor(32 * (score1 - 1 / (1 + power(10::numeric, (coalesce(u2.elo, 1200) - coalesce(u1.elo, 1200))::numeric / 400))) + 0.5);
    d2 := floor(32 * ((1 - score1) - 1 / (1 + power(10::numeric, (coalesce(u1.elo, 1200) - coalesce(u2.elo, 1200))::numeric / 400))) + 0.5);
    -- At least 1 point either way on a decisive game, before any double-down bonus.
    if score1 = 1 then
      d1 := greatest(d1, 1);
      d2 := least(d2, -1);
    elsif score1 = 0 then
      d1 := least(d1, -1);
      d2 := greatest(d2, 1);
    end if;

    -- A double down counts only when both players consented through their own
    -- session, exactly as submit-match decides it.
    bonus := 0;
    if claim.winner_uid <> 'DRAW' and (
      select count(*) from public.gomoku_game_seats
      where game_id = claim.game_id and double_down
        and uid in (claim.player1_uid, claim.player2_uid)
    ) = 2 then
      bonus := 20;
    end if;
    d1 := d1 + case when score1 = 1 then bonus else -bonus end;
    d2 := d2 + case when score1 = 0 then bonus else -bonus end;

    -- Per-pair daily limits, as applyPairLimits in rules.ts.
    reason := null;
    select * into stats from public.gomoku_pair_day_stats(claim.player1_uid, claim.player2_uid);
    if stats.rated_games >= pair_daily_rated_limit then
      reason := 'pair_daily_limit';
    else
      if d1 > 0 then
        room := pair_daily_gain_cap - stats.gained_a;
        if room <= 0 then
          reason := 'pair_gain_cap';
        elsif d1 > room then
          d1 := room;
          if d2 < 0 then d2 := greatest(d2, -room); end if;
        end if;
      end if;
      if reason is null and d2 > 0 then
        room := pair_daily_gain_cap - stats.gained_b;
        if room <= 0 then
          reason := 'pair_gain_cap';
        elsif d2 > room then
          d2 := room;
          if d1 < 0 then d1 := greatest(d1, -room); end if;
        end if;
      end if;
    end if;
    if reason is not null then
      d1 := 0;
      d2 := 0;
    end if;

    inserted_id := null;
    insert into public.gomoku_matches (
      mode, board_size, winner_uid, player1_uid, player1_name, player2_uid, player2_name,
      elo_delta_player1, elo_delta_player2, "timestamp", game_id, seat_log,
      moves_count, duration_seconds, unrated_reason
    ) values (
      claim.mode, claim.board_size, claim.winner_uid,
      claim.player1_uid, coalesce(nullif(btrim(left(u1.display_name, 40)), ''), 'Player 1'),
      claim.player2_uid, coalesce(nullif(btrim(left(u2.display_name, 40)), ''), 'Player 2'),
      d1, d2, now(), claim.game_id, claim.seat_log,
      claim.move_count, case when claim.duration_ms is null then null else round(claim.duration_ms / 1000.0)::integer end,
      reason
    )
    on conflict (game_id) do nothing
    returning id into inserted_id;

    -- An unrated game is on record for history only: no W/L/D, no streak.
    if inserted_id is not null and reason is null then
      update public.gomoku_users set
        elo = greatest(100, coalesce(u1.elo, 1200) + d1),
        wins = coalesce(u1.wins, 0) + case when claim.winner_uid = claim.player1_uid then 1 else 0 end,
        losses = coalesce(u1.losses, 0) + case when claim.winner_uid not in (claim.player1_uid, 'DRAW') then 1 else 0 end,
        draws = coalesce(u1.draws, 0) + case when claim.winner_uid = 'DRAW' then 1 else 0 end,
        streak = case
          when claim.winner_uid = 'DRAW' then 0
          when claim.winner_uid = claim.player1_uid then greatest(coalesce(u1.streak, 0), 0) + 1
          else least(coalesce(u1.streak, 0), 0) - 1
        end,
        updated_at = now()
      where uid = claim.player1_uid;
      update public.gomoku_users set
        elo = greatest(100, coalesce(u2.elo, 1200) + d2),
        wins = coalesce(u2.wins, 0) + case when claim.winner_uid = claim.player2_uid then 1 else 0 end,
        losses = coalesce(u2.losses, 0) + case when claim.winner_uid not in (claim.player2_uid, 'DRAW') then 1 else 0 end,
        draws = coalesce(u2.draws, 0) + case when claim.winner_uid = 'DRAW' then 1 else 0 end,
        streak = case
          when claim.winner_uid = 'DRAW' then 0
          when claim.winner_uid = claim.player2_uid then greatest(coalesce(u2.streak, 0), 0) + 1
          else least(coalesce(u2.streak, 0), 0) - 1
        end,
        updated_at = now()
      where uid = claim.player2_uid;
    end if;
    if inserted_id is not null then
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
