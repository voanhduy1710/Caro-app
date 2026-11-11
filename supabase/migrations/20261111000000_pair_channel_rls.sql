-- Mobile pairing: a phone signed in to the same account as a desktop remote-
-- controls the desktop's game over a private Realtime broadcast channel named
-- `pair:<uid>:<sessionId>`. Private channels are authorised by RLS on
-- realtime.messages, so these policies let an authenticated user receive
-- (select) and send (insert) broadcasts only on pair topics whose uid segment
-- is their own auth.uid(). Other users, the anon role and every non-pair topic
-- get nothing from these policies.

create policy "pair_channel_select_own" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) = 'pair'
    and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text
  );

create policy "pair_channel_insert_own" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) = 'pair'
    and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text
  );
