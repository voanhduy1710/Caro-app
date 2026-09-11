-- The previous migration stamped email_confirmed_at on EVERY new auth user, not
-- only on the synthetic <username>@gomoku.app addresses it was written for.
-- That let anyone register a password account under someone else's real
-- address, already confirmed, and a later "Continue with Google" by the real
-- owner could be linked into it. Only the synthetic domain, which receives no
-- mail and so can never complete a confirmation, is confirmed on insert now;
-- every other address is confirmed by its owner as normal. OAuth identities are
-- confirmed by Supabase itself and never needed this trigger.
create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Repeated here, not only in the trigger's WHEN clause, so the function stays
  -- safe if it is ever attached somewhere else.
  if lower(coalesce(new.email, '')) like '%@gomoku.app' then
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists auto_confirm_new_user on auth.users;

create trigger auto_confirm_new_user
  before insert on auth.users
  for each row
  when (lower(new.email) like '%@gomoku.app')
  execute function public.auto_confirm_new_user();

-- The API never issues TRUNCATE or creates triggers, and row level security
-- does not apply to TRUNCATE at all, so these default grants were pure risk.
revoke truncate, trigger on public.gomoku_users, public.gomoku_matches from anon, authenticated;
