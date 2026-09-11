-- Settle due claims every minute, so a winner's claim is recorded within a
-- minute of its window closing even when nobody is playing to trigger it.
-- submit-match also settles them on every call; this covers the quiet hours.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'finalize-match-claims',
  '* * * * *',
  $cron$select public.finalize_due_match_claims()$cron$
);
