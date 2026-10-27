-- ============================================================================
-- Run on the SUPABASE project at CUTOVER to Neon, after writes are paused and
-- the final copy is verified (docs/database-migration.md, stage 5).
--
-- Supabase Auth keeps creating logins, but profiles now live on Neon, where
-- the same handle_new_user trigger runs (the server mirrors each new login
-- into Neon's auth.users). The Supabase copy of the data is frozen from this
-- point, so its trigger must stop validating sign-ups against stale rows
-- (it could reject a username that is free on Neon, or apply an old
-- "sign-ups closed" setting).
--
-- This keeps the trigger in place and makes the Supabase-side function a
-- no-op. Undo with neon-rollback-signup.sql (restores the 0004 definition).
-- ============================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Cut over to Neon: profiles are created there (see docs/architecture.md).
  return new;
end $$;
