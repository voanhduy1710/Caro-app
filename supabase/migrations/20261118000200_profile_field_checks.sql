-- What: (1) a player may update only display_name, photo_url and updated_at on
--   their own gomoku_users row (username and email are no longer updatable);
--   (2) CHECK constraints on display_name, username and photo_url;
--   (3) the signup trigger makes a Google / metadata name fit those checks
--   instead of failing the signup.
-- Why: display_name had no length limit, the owner could rewrite their
--   username and email, and photo_url could be any URL, which every
--   leaderboard viewer's browser then loads (tracking pixel, abuse image).
-- Rules mirror src/features/auth/authRules.ts; keep the two in step.
-- When: safe to apply BEFORE the new client. The deployed client (git HEAD)
--   updates only display_name, photo_url and updated_at, writes champion ids,
--   ragnarok:<file>, the Data Dragon URL or a Google photo, and its sign-up
--   form already caps names at 40. A HEAD client whose profile modal allows a
--   longer name gets the save refused and rolls it back (it checks the error).
--   Read-only check on the live database (2026-11-18): 5 rows, 0 violate any
--   of these checks, so the constraints are validated at once. If a row that
--   violates appears before this runs, the VALIDATE fails and the whole
--   migration rolls back; then fix or null that row and run it again.
-- Rollback:
--   alter table public.gomoku_users drop constraint gomoku_users_display_name_check,
--     drop constraint gomoku_users_username_check, drop constraint gomoku_users_photo_url_check;
--   grant update (username, email) on public.gomoku_users to authenticated;
--   and re-create handle_new_gomoku_user from 20260910071416.

-- (1) Column privileges.
revoke update on public.gomoku_users from anon, authenticated;
grant update (display_name, photo_url, updated_at) on public.gomoku_users to authenticated;

-- (2) Field checks. Postgres regexes allow at most 255 repetitions, so the
-- open-ended parts use + and the length cap limits them.
alter table public.gomoku_users
  add constraint gomoku_users_display_name_check check (
    char_length(display_name) between 1 and 40
    and btrim(display_name) <> ''
    and display_name !~ '[\x01-\x1f\x7f]'
  ) not valid;

alter table public.gomoku_users
  add constraint gomoku_users_username_check check (
    username is null or username ~ '^[a-z0-9_]{3,24}$'
  ) not valid;

alter table public.gomoku_users
  add constraint gomoku_users_photo_url_check check (
    photo_url is null or (
      char_length(photo_url) <= 512 and (
        photo_url ~ '^[A-Za-z0-9_]{1,40}(\.(png|gif))?$'
        or photo_url ~ '^/?[Aa]vatar/[A-Za-z0-9 _.()''-]{1,120}$'
        or photo_url ~ '^ragnarok:[A-Za-z0-9 _.()''-]{1,120}$'
        or photo_url ~ '^https://ddragon\.leagueoflegends\.com/cdn/[0-9.]{1,20}/img/champion/[A-Za-z0-9_]{1,40}\.png$'
        or photo_url ~ '^https://lh[0-9]\.googleusercontent\.com/[A-Za-z0-9_/=+.~-]+$'
      )
    )
  ) not valid;

alter table public.gomoku_users validate constraint gomoku_users_display_name_check;
alter table public.gomoku_users validate constraint gomoku_users_username_check;
alter table public.gomoku_users validate constraint gomoku_users_photo_url_check;

-- (3) The signup trigger. raw_user_meta_data is whatever the signup request
-- sent (or Google's profile), so it is cleaned rather than trusted: a name is
-- stripped of control characters and cut to 40, a username that breaks the
-- rule is dropped (the account still signs in by email). Same behaviour as
-- toValidDisplayName in authRules.ts.
create or replace function public.handle_new_gomoku_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_username text := lower(btrim(coalesce(new.raw_user_meta_data->>'username', '')));
  clean_username text := case when raw_username ~ '^[a-z0-9_]{3,24}$' then raw_username end;
  raw_name text := coalesce(
    nullif(btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', ''), '[\x01-\x1f\x7f]', '', 'g')), ''),
    clean_username,
    nullif(btrim(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[\x01-\x1f\x7f]', '', 'g')), ''),
    'Gomoku Master'
  );
  clean_name text := coalesce(nullif(btrim(left(raw_name, 40)), ''), 'Gomoku Master');
begin
  insert into public.gomoku_users (uid, username, display_name, photo_url, email)
  values (new.id::text, clean_username, clean_name, '/Avatar/Zerom.gif', new.email)
  on conflict (uid) do nothing;
  return new;
end;
$$;
