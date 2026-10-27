-- ============================================================================
-- Neon-ready: lets the same schema run with Neon as the primary database while
-- Supabase keeps Auth, Storage and Realtime delivery.
--
-- Additive and backward-compatible:
--   * emit_change() keeps its pg_notify behaviour. It only *also* records a
--     compact list of changes when the server asks for it (yoru.capture = on),
--     which only the Postgres/Neon adapter does. On Supabase nothing changes.
--   * new indexes only (search and foreign keys used by cascading deletes)
--   * one new server-only function for the abandoned-upload cleanup job
--   * no table, column or row is changed or removed
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Change capture for the realtime relay
-- ---------------------------------------------------------------------------
-- The Neon adapter runs each request in one transaction with
-- yoru.capture = 'on', reads yoru.changes just before COMMIT, and after the
-- commit publishes the events to the right people through Supabase Realtime
-- Broadcast. Only ids and the fields needed to route an event are kept:
-- message bodies are never captured. Notification text is kept because it is
-- what the recipient's toast shows (it already goes to them today).

create or replace function public.emit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  payload jsonb;
  row_json jsonb;
  n int;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;
  row_json := to_jsonb(rec);
  payload := jsonb_build_object('table', tg_table_name, 'op', tg_op, 'row', row_json);
  perform pg_notify('itn_changes', left(payload::text, 7900));

  if current_setting('yoru.capture', true) = 'on' then
    n := coalesce(nullif(current_setting('yoru.changes_n', true), '')::int, 0);
    if n >= 300 then
      -- Bulk writes (e.g. an admin broadcast to everyone): tell clients to
      -- refetch instead of shipping hundreds of events.
      perform set_config('yoru.changes_overflow', '1', true);
    else
      payload := jsonb_build_object(
        't', tg_table_name, 'op', tg_op,
        'id', row_json ->> 'id',
        'channel_id', row_json ->> 'channel_id',
        'message_id', row_json ->> 'message_id',
        'user_id', row_json ->> 'user_id',
        'author_id', row_json ->> 'author_id',
        'kind', row_json ->> 'kind',
        'body', case when tg_table_name = 'notifications' then left(row_json ->> 'body', 200) end
      );
      perform set_config('yoru.changes', coalesce(current_setting('yoru.changes', true), '') || payload::text || chr(10), true);
      perform set_config('yoru.changes_n', (n + 1)::text, true);
    end if;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Search: trigram indexes for the existing ILIKE searches (posts, people)
-- ---------------------------------------------------------------------------
-- Skipped where pg_trgm cannot be installed; search still works, just slower.

do $$
declare
  ext_schema text;
begin
  begin
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      create extension if not exists pg_trgm with schema extensions;
    else
      create extension if not exists pg_trgm;
    end if;
  exception when others then
    raise notice 'pg_trgm unavailable (%); search indexes skipped', sqlerrm;
    return;
  end;
  select n.nspname into ext_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';
  execute format('create index if not exists posts_body_trgm_idx on public.posts using gin (body %I.gin_trgm_ops) where deleted_at is null', ext_schema);
  execute format('create index if not exists profiles_username_trgm_idx on public.profiles using gin (username %I.gin_trgm_ops)', ext_schema);
  execute format('create index if not exists profiles_display_name_trgm_idx on public.profiles using gin (display_name %I.gin_trgm_ops)', ext_schema);
end $$;

-- ---------------------------------------------------------------------------
-- Foreign-key indexes: keep account deletion and post deletion (cascades)
-- from scanning whole tables as YORU grows.
-- ---------------------------------------------------------------------------

create index if not exists comments_parent_idx on public.comments (parent_id) where parent_id is not null;
create index if not exists comments_author_idx on public.comments (author_id);
create index if not exists reactions_user_idx on public.reactions (user_id);
create index if not exists comment_likes_user_idx on public.comment_likes (user_id);
create index if not exists bookmarks_post_idx on public.bookmarks (post_id);
create index if not exists awards_post_idx on public.awards (post_id);
create index if not exists awards_giver_idx on public.awards (giver_id);
create index if not exists poll_votes_user_idx on public.poll_votes (user_id);
create index if not exists stories_author_idx on public.stories (author_id);
create index if not exists story_views_user_idx on public.story_views (user_id);
create index if not exists messages_author_idx on public.messages (author_id);
create index if not exists messages_reply_idx on public.messages (reply_to) where reply_to is not null;
create index if not exists message_reactions_user_idx on public.message_reactions (user_id);
create index if not exists notifications_actor_idx on public.notifications (actor_id) where actor_id is not null;
create index if not exists notifications_post_idx on public.notifications (post_id) where post_id is not null;
create index if not exists notifications_message_idx on public.notifications (message_id) where message_id is not null;
create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists posts_target_user_idx on public.posts (target_user_id) where target_user_id is not null;
create index if not exists invite_redemptions_user_idx on public.invite_redemptions (user_id);

-- ---------------------------------------------------------------------------
-- Abandoned uploads: which of these storage paths are still referenced?
-- Server-only (the cleanup job). Uploaded files live under u/<user>/<file>.
-- ---------------------------------------------------------------------------

create or replace function public.media_paths_in_use(p_paths text[]) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m), '{}')
  from (
    select media_url as m from public.posts where media_url = any (p_paths)
    union all select media_url from public.stories where media_url = any (p_paths)
    union all select media_url from public.messages where media_url = any (p_paths)
    union all select avatar_url from public.profiles where avatar_url = any (p_paths)
  ) used
$$;

revoke execute on function public.media_paths_in_use(text[]) from public, anon, authenticated;
grant execute on function public.media_paths_in_use(text[]) to service_role;
