-- Double down: during a 1v1 game either player may offer, once, to raise the
-- stakes. When both agree, the decisive result is worth 20 more rating points
-- either way. Each player records their own consent on their seat ticket via
-- the seat-ticket function; the bonus applies only when both tickets carry it,
-- so neither player can impose it on the other.

alter table public.gomoku_game_seats
  add column if not exists double_down boolean not null default false;

-- The finaliser mirrors submit-match, so it learns the bonus too.
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
  bonus integer;
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
