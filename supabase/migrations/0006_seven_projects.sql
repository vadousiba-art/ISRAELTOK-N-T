-- ============================================================================
-- Seven Supabase projects: lets YORU spread live updates and new media over
-- six extra Supabase projects while this (original) project keeps Auth and
-- every relational table. See docs/seven-projects.md.
--
-- Additive and backward-compatible:
--   * realtime_outbox: changes waiting to be relayed to the realtime projects.
--     emit_change() only writes to it while a server has drained it in the last
--     15 minutes (REALTIME_SHARDS=on). Otherwise nothing is written, so it can
--     never grow on its own. pg_notify and the Neon capture are unchanged.
--   * valid_media_path() also accepts files stored in project n (s<n>/u/...).
--     Every path that was valid before is still valid.
--   * no existing table, column or row is changed.
-- Safe to run more than once.
-- ============================================================================

create table if not exists public.realtime_outbox (
  id bigserial primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.realtime_outbox_state (
  id int primary key default 1 check (id = 1),
  last_drained_at timestamptz
);
insert into public.realtime_outbox_state (id) values (1) on conflict (id) do nothing;

-- Server-only plumbing: no policies and no grants for anon/authenticated.
alter table public.realtime_outbox enable row level security;
alter table public.realtime_outbox_state enable row level security;
revoke all on public.realtime_outbox, public.realtime_outbox_state from anon, authenticated;
grant all on public.realtime_outbox, public.realtime_outbox_state to service_role;
revoke all on sequence public.realtime_outbox_id_seq from anon, authenticated;
grant all on sequence public.realtime_outbox_id_seq to service_role;

create or replace function public.emit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  payload jsonb;
  row_json jsonb;
  compact jsonb;
  n int;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;
  row_json := to_jsonb(rec);
  payload := jsonb_build_object('table', tg_table_name, 'op', tg_op, 'row', row_json);
  perform pg_notify('itn_changes', left(payload::text, 7900));

  -- Only ids and routing fields; never message text. Notification text is
  -- the recipient's own toast.
  compact := jsonb_build_object(
    't', tg_table_name, 'op', tg_op,
    'id', row_json ->> 'id',
    'channel_id', row_json ->> 'channel_id',
    'message_id', row_json ->> 'message_id',
    'user_id', row_json ->> 'user_id',
    'author_id', row_json ->> 'author_id',
    'kind', row_json ->> 'kind',
    'body', case when tg_table_name = 'notifications' then left(row_json ->> 'body', 200) end
  );

  -- Neon adapter: transaction-local capture (migration 0005).
  if current_setting('yoru.capture', true) = 'on' then
    n := coalesce(nullif(current_setting('yoru.changes_n', true), '')::int, 0);
    if n >= 300 then
      perform set_config('yoru.changes_overflow', '1', true);
    else
      perform set_config('yoru.changes', coalesce(current_setting('yoru.changes', true), '') || compact::text || chr(10), true);
      perform set_config('yoru.changes_n', (n + 1)::text, true);
    end if;
  end if;

  -- Seven projects: outbox, only while a server is draining it.
  if exists (select 1 from public.realtime_outbox_state
             where id = 1 and last_drained_at > now() - interval '15 minutes') then
    n := coalesce(nullif(current_setting('yoru.outbox_n', true), '')::int, 0);
    if n < 300 then
      insert into public.realtime_outbox (payload) values (compact);
    elsif n = 300 then
      -- Bulk write (e.g. an admin broadcast): one "refetch" instead of hundreds.
      insert into public.realtime_outbox (payload) values (jsonb_build_object('t', 'resync', 'op', 'RESYNC'));
    end if;
    perform set_config('yoru.outbox_n', (n + 1)::text, true);
  end if;
  return null;
end $$;

-- Takes up to p_limit waiting changes (each exactly once, even with several
-- servers draining at the same time), plus what the relay needs to route chat
-- events: the channel type and, for DMs and private groups, the members.
-- Also keeps the outbox switched on for the next 15 minutes.
create or replace function public.drain_realtime_outbox(p_limit int default 300) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  events jsonb;
  msg_ids uuid[];
  chan_ids uuid[];
begin
  update public.realtime_outbox_state set last_drained_at = now() where id = 1;
  -- Nobody was listening for these any more.
  delete from public.realtime_outbox where created_at < now() - interval '15 minutes';

  with taken as (
    delete from public.realtime_outbox
    where id in (
      select id from public.realtime_outbox order by id
      limit least(greatest(coalesce(p_limit, 300), 1), 1000)
      for update skip locked
    )
    returning id, payload
  )
  select coalesce(jsonb_agg(payload order by id), '[]'::jsonb) into events from taken;

  select coalesce(array_agg(distinct (e ->> 'message_id')::uuid), '{}') into msg_ids
  from jsonb_array_elements(events) e
  where e ->> 't' = 'message_reactions' and e ->> 'message_id' is not null;

  select coalesce(array_agg(distinct c), '{}') into chan_ids from (
    select (e ->> 'channel_id')::uuid as c from jsonb_array_elements(events) e
    where e ->> 't' = 'messages' and e ->> 'channel_id' is not null
    union
    select m.channel_id from public.messages m where m.id = any (msg_ids)
  ) x;

  return jsonb_build_object(
    'events', events,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'channel_id', m.channel_id))
                          from public.messages m where m.id = any (msg_ids)), '[]'::jsonb),
    'channels', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'is_private', c.is_private))
                          from public.channels c where c.id = any (chan_ids)), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('channel_id', cm.channel_id, 'user_id', cm.user_id))
                         from public.channel_members cm join public.channels c on c.id = cm.channel_id
                         where cm.channel_id = any (chan_ids) and (c.kind = 'dm' or c.is_private)), '[]'::jsonb)
  );
end $$;

revoke execute on function public.drain_realtime_outbox(int) from public, anon, authenticated;
grant execute on function public.drain_realtime_outbox(int) to service_role;

-- Uploaded files may now live in another project: s<n>/u/<user>/<file>.
create or replace function public.valid_media_path(p_url text, p_user uuid) returns boolean
language sql immutable as $$
  select p_url is null
      or p_url like 'u/' || p_user::text || '/%'
      or p_url ~ ('^s[1-7]/u/' || p_user::text || '/')
      or p_url ~ '^/seed/[a-z0-9_-]+\.(png|jpg|jpeg|gif|webp)$'
$$;

-- media_paths_in_use() (0005) compares exact paths, so prefixed paths work as-is.
