-- Profiles are created server-side on signup, so the browser never needs
-- permission to invent a row with whatever rating it likes.
create or replace function public.handle_new_gomoku_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gomoku_users (uid, username, display_name, photo_url, email)
  values (
    new.id::text,
    new.raw_user_meta_data->>'username',
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      new.raw_user_meta_data->>'username',
      split_part(coalesce(new.email, 'player@gomoku.app'), '@', 1)
    ),
    '/Avatar/Zerom.gif',
    new.email
  )
  on conflict (uid) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_gomoku on auth.users;
create trigger on_auth_user_created_gomoku
  after insert on auth.users
  for each row execute function public.handle_new_gomoku_user();

-- Replace the wide-open "Allow full access" policies.
drop policy if exists "Allow full access" on public.gomoku_users;
drop policy if exists "Allow full access" on public.gomoku_matches;

create policy "gomoku_users_select_all" on public.gomoku_users
  for select to anon, authenticated using (true);

create policy "gomoku_users_insert_own" on public.gomoku_users
  for insert to authenticated
  with check (uid = auth.uid()::text);

create policy "gomoku_users_update_own" on public.gomoku_users
  for update to authenticated
  using (uid = auth.uid()::text)
  with check (uid = auth.uid()::text);

create policy "gomoku_matches_select_all" on public.gomoku_matches
  for select to anon, authenticated using (true);

-- Column privileges are what actually keep ratings out of reach: even on their
-- own row a player may only touch profile fields. elo/wins/losses/draws/streak
-- are written solely by the submit-match edge function via the service role.
revoke insert, update, delete on public.gomoku_users from anon, authenticated;
revoke insert, update, delete on public.gomoku_matches from anon, authenticated;

grant select on public.gomoku_users to anon, authenticated;
grant select on public.gomoku_matches to anon, authenticated;

grant insert (uid, username, display_name, photo_url, email, created_at, updated_at)
  on public.gomoku_users to authenticated;
grant update (username, display_name, photo_url, email, updated_at)
  on public.gomoku_users to authenticated;
