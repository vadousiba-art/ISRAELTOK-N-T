-- ============================================================================
-- Run on the SUPABASE project, only when switching app data to Neon
-- (DATA_BACKEND=neon). Not a migration: supabase/migrations never runs this.
--
-- With data on Neon, Supabase Realtime can no longer stream table changes, so
-- the server relays them over Realtime Broadcast to private topics:
--   yoru:u:<user id>  one per person (notifications, DMs, private groups)
--   yoru:all          all signed-in members (new posts/stories, public groups)
-- This policy lets a signed-in user join only their own user topic and the
-- all-members topic. There is no INSERT policy, so browsers cannot send on
-- these topics; only the server (secret key) can.
-- Typing indicators keep using public "typing:<channel>" broadcast channels,
-- so leave "Allow public access" on in Realtime settings.
-- Additive and reversible: drop the policy to undo.
-- ============================================================================

drop policy if exists "yoru relay topics" on realtime.messages;
create policy "yoru relay topics" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      (select realtime.topic()) = 'yoru:u:' || (select auth.uid())::text
      or (select realtime.topic()) = 'yoru:all'
    )
  );

-- Undo:
-- drop policy if exists "yoru relay topics" on realtime.messages;
