-- Accounts here are keyed by username and mapped to <username>@gomoku.app, a
-- domain that receives no mail. An email confirmation step can therefore never
-- be completed by anyone, which locked every account out of sign-in with
-- "Email not confirmed". Stamp the confirmation at insert time instead.
create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;

drop trigger if exists auto_confirm_new_user on auth.users;

create trigger auto_confirm_new_user
  before insert on auth.users
  for each row
  execute function public.auto_confirm_new_user();
