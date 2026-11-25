-- What: anon and authenticated may no longer read gomoku_users.email. The
--   table-wide SELECT grant from 20260910071416 is replaced by a SELECT grant on
--   every other column. The row policy (select using true) stays: profiles,
--   ratings and the leaderboard remain public, only the address is hidden.
-- Why: with the table-wide grant, anyone holding the public anon key could list
--   every Google player's email address.
-- When: safe to apply BEFORE any new client or function deploy. Every query the
--   deployed client (git HEAD) makes on gomoku_users names its columns and none
--   of them names email (profileService, leaderboardService and
--   AuthContextProvider.refreshUserProfile select named columns; the profile
--   update returns only uid; both fallback upserts send no select, so
--   PostgREST asks for no RETURNING). The edge functions use the service role
--   and the two SECURITY DEFINER functions run as their owner, so neither is
--   affected. The profile's email in the app always comes from the session.
-- Rollback: grant select on public.gomoku_users to anon, authenticated;
--
-- Inserting email stays allowed (the deployed signup and profile fallback send
-- it); updating it is removed in 20261118000200.

revoke select on public.gomoku_users from anon, authenticated;

grant select (
  uid,
  username,
  display_name,
  photo_url,
  elo,
  wins,
  losses,
  draws,
  streak,
  created_at,
  updated_at
) on public.gomoku_users to anon, authenticated;
