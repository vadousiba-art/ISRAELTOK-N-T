-- ============================================================================
-- IsraelTokn't — core schema
-- "The internet was a mistake. You made it worse."
--
-- Design:
--   * Private by default: every table has RLS; only non-banned members can read.
--   * All writes go through SECURITY DEFINER RPCs that check membership,
--     validate input and enforce rate limits. Clients get no direct
--     insert/update/delete grants.
--   * Reads go through SECURITY INVOKER RPCs so RLS still applies.
--   * Errors are raised as 'CODE|Human message' so the API can map them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  bio text not null default '' check (char_length(bio) <= 280),
  status text not null default '' check (char_length(status) <= 80),
  badge text not null default '' check (char_length(badge) <= 8),
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  verified boolean not null default false,
  is_bot boolean not null default false,
  banned boolean not null default false,
  roast_opt_in boolean not null default false,
  roast_intensity int not null default 2 check (roast_intensity between 1 and 3),
  leaderboard_opt_in boolean not null default true,
  ai_context_opt_in boolean not null default false,
  notification_prefs jsonb not null default
    '{"likes":true,"comments":true,"mentions":true,"reposts":true,"messages":true,"awards":true,"friend_posts":false}'::jsonb,
  inside_jokes text[] not null default '{}',
  chaos_points int not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

create table if not exists public.invites (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{4,40}$'),
  created_by uuid references public.profiles (id) on delete set null,
  note text not null default '' check (char_length(note) <= 80),
  max_uses int not null default 5 check (max_uses between 1 and 500),
  uses int not null default 0,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.invite_redemptions (
  code text not null references public.invites (code) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null default '' check (char_length(name) <= 40),
  emoji text not null default '💬' check (char_length(emoji) <= 8),
  description text not null default '' check (char_length(description) <= 200),
  kind text not null default 'group' check (kind in ('group', 'dm')),
  is_private boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists channel_members_user_idx on public.channel_members (user_id);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'post' check (kind in ('post', 'poll', 'roast', 'news', 'repost')),
  body text not null default '' check (char_length(body) <= 2000),
  media_url text check (media_url is null or char_length(media_url) <= 300),
  media_type text check (media_type is null or media_type in ('image', 'video', 'gif')),
  link_url text check (link_url is null or (link_url ~ '^https?://' and char_length(link_url) <= 500)),
  roast text check (roast is null or char_length(roast) <= 800),
  roast_label text check (roast_label is null or char_length(roast_label) <= 40),
  target_user_id uuid references public.profiles (id) on delete set null,
  repost_of uuid references public.posts (id) on delete cascade,
  hashtags text[] not null default '{}',
  mentions uuid[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc) where deleted_at is null;
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_repost_idx on public.posts (repost_of);
create index if not exists posts_hashtags_idx on public.posts using gin (hashtags);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  position int not null default 0
);
create index if not exists poll_options_post_idx on public.poll_options (post_id);

create table if not exists public.poll_votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('heart', 'skull', 'fire', 'clown', 'cap', 'crying', 'salute', 'w', 'l')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);
create index if not exists reactions_post_idx on public.reactions (post_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  is_ai boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.bookmarks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.awards (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  giver_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('menace', 'war_crime', 'touch_grass', 'galaxy_brain', 'skill_issue', 'ratio')),
  created_at timestamptz not null default now(),
  unique (post_id, giver_id, kind)
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  channel_id uuid references public.channels (id) on delete cascade,
  media_url text check (media_url is null or char_length(media_url) <= 300),
  media_type text check (media_type is null or media_type in ('image', 'video', 'gif')),
  text text not null default '' check (char_length(text) <= 200),
  bg text not null default 'lime' check (bg in ('lime', 'pink', 'purple', 'blue', 'fire', 'void')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  deleted_at timestamptz,
  check (media_url is not null or char_length(text) > 0)
);
create index if not exists stories_active_idx on public.stories (expires_at desc);

create table if not exists public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  media_url text check (media_url is null or char_length(media_url) <= 300),
  media_type text check (media_type is null or media_type in ('image', 'video', 'gif')),
  reply_to uuid references public.messages (id) on delete set null,
  is_ai boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or media_url is not null)
);
create index if not exists messages_channel_idx on public.messages (channel_id, created_at desc);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  kind text not null,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  channel_id uuid references public.channels (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'message', 'user', 'story')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  action text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, bucket, window_start)
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_user_idx on public.ai_messages (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The AI Menace bot account (not a login — it only speaks through the server)
-- ---------------------------------------------------------------------------

insert into public.profiles (id, username, display_name, avatar_url, bio, badge, verified, is_bot, leaderboard_opt_in)
values (
  '00000000-0000-4000-8000-00000000a1e7',
  'UNHatingAmbassador',
  'The AI Menace',
  '/seed/avatar-menace.png',
  'Unhinged AI comedian. Roasts on request. Diplomatic immunity pending.',
  '🤖',
  true,
  true,
  false
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.bot_id() returns uuid
language sql immutable as $$ select '00000000-0000-4000-8000-00000000a1e7'::uuid $$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and not banned and not is_bot
  )
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and not banned and role in ('owner', 'admin')
  )
$$;

create or replace function public.is_channel_member(p_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channel_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.channel_id = p_channel and cm.user_id = auth.uid() and not p.banned
  )
$$;

create or replace function public.can_see_channel(p_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and exists (
    select 1 from public.channels c
    where c.id = p_channel and (
      (c.kind = 'group' and not c.is_private) or public.is_channel_member(c.id)
    )
  )
$$;

create or replace function public.require_member() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := auth.uid();
begin
  if v is null or not exists (select 1 from public.profiles where id = v and not banned and not is_bot) then
    raise exception 'NOT_MEMBER|Members only. Get an invite, civilian.' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN|Admins only. Nice try, intern.' using errcode = '42501';
  end if;
  return v;
end $$;

-- Hidden = blocked either direction, or banned.
create or replace function public.is_hidden_author(p_author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.blocks
      where (blocker_id = auth.uid() and blocked_id = p_author)
         or (blocker_id = p_author and blocked_id = auth.uid())
    )
    or exists (select 1 from public.profiles where id = p_author and banned)
$$;

create or replace function public.enforce_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v uuid := auth.uid();
  ws timestamptz;
  c int;
begin
  if v is null then
    return; -- server/service calls are limited at the API layer
  end if;
  ws := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits (user_id, bucket, window_start, count)
  values (v, p_bucket, ws, 1)
  on conflict (user_id, bucket, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into c;
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  if c > p_max then
    raise exception 'RATE_LIMIT|Slow down, menace. Try again in a bit.' using errcode = 'P0001';
  end if;
end $$;

-- Callable quota check for server-side features (AI, uploads).
create or replace function public.consume_quota(p_bucket text, p_max int, p_window_seconds int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  ws timestamptz;
  c int;
begin
  if p_bucket !~ '^[a-z_]{2,30}$' or p_max < 1 or p_window_seconds < 10 then
    raise exception 'INVALID|Bad quota request.';
  end if;
  ws := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits (user_id, bucket, window_start, count)
  values (v, p_bucket, ws, 1)
  on conflict (user_id, bucket, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into c;
  return jsonb_build_object(
    'allowed', c <= p_max,
    'remaining', greatest(p_max - c, 0),
    'reset_at', ws + make_interval(secs => p_window_seconds)
  );
end $$;

create or replace function public.extract_hashtags(p_body text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct lower(m[1])), '{}')
  from regexp_matches(coalesce(p_body, ''), '#([^[:space:]#.,!?;:()\[\]{}"''<>/\\]{1,40})', 'g') as m
$$;

create or replace function public.extract_mentions(p_body text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct p.id), '{}')
  from regexp_matches(coalesce(p_body, ''), '@([A-Za-z0-9_]{3,20})', 'g') as m
  join public.profiles p on lower(p.username) = lower(m[1])
$$;

create or replace function public.posts_before_write() returns trigger
language plpgsql as $$
begin
  new.hashtags := public.extract_hashtags(new.body);
  new.mentions := public.extract_mentions(new.body);
  return new;
end $$;

drop trigger if exists posts_before_write on public.posts;
create trigger posts_before_write before insert or update of body on public.posts
for each row execute function public.posts_before_write();

-- Server-side check for uploaded media paths: users may only attach files
-- from their own upload folder (or the bundled seed images).
create or replace function public.valid_media_path(p_url text, p_user uuid) returns boolean
language sql immutable as $$
  select p_url is null
      or p_url like 'u/' || p_user::text || '/%'
      or p_url ~ '^/seed/[a-z0-9_-]+\.(png|jpg|jpeg|gif|webp)$'
$$;

-- ---------------------------------------------------------------------------
-- Notifications + realtime fan-out
-- ---------------------------------------------------------------------------

create or replace function public.notify_user(
  p_user uuid, p_actor uuid, p_kind text,
  p_post uuid default null, p_comment uuid default null,
  p_channel uuid default null, p_message uuid default null,
  p_body text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare
  prefs jsonb;
  pref_key text;
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  select notification_prefs into prefs from public.profiles
  where id = p_user and not is_bot and not banned;
  if not found then
    return;
  end if;
  pref_key := case p_kind
    when 'like' then 'likes' when 'reaction' then 'likes'
    when 'comment' then 'comments' when 'reply' then 'comments' when 'roast' then 'comments'
    when 'mention' then 'mentions' when 'repost' then 'reposts'
    when 'message' then 'messages' when 'award' then 'awards'
    when 'friend_post' then 'friend_posts'
    else null end;
  if pref_key is not null and coalesce((prefs ->> pref_key)::boolean, true) = false then
    return;
  end if;
  if p_actor is not null and exists (
    select 1 from public.blocks where blocker_id = p_user and blocked_id = p_actor
  ) then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, kind, post_id, comment_id, channel_id, message_id, body)
  values (p_user, p_actor, p_kind, p_post, p_comment, p_channel, p_message, left(coalesce(p_body, ''), 200));
end $$;

-- pg_notify is used by demo mode's in-process realtime. On Supabase it is a
-- harmless no-op; Supabase Realtime streams postgres_changes instead.
create or replace function public.emit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  payload jsonb;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;
  payload := jsonb_build_object('table', tg_table_name, 'op', tg_op, 'row', to_jsonb(rec));
  perform pg_notify('itn_changes', left(payload::text, 7900));
  return null;
end $$;

drop trigger if exists messages_emit on public.messages;
create trigger messages_emit after insert or update on public.messages
for each row execute function public.emit_change();
drop trigger if exists message_reactions_emit on public.message_reactions;
create trigger message_reactions_emit after insert or delete on public.message_reactions
for each row execute function public.emit_change();
drop trigger if exists notifications_emit on public.notifications;
create trigger notifications_emit after insert on public.notifications
for each row execute function public.emit_change();
drop trigger if exists posts_emit on public.posts;
create trigger posts_emit after insert on public.posts
for each row execute function public.emit_change();
drop trigger if exists stories_emit on public.stories;
create trigger stories_emit after insert on public.stories
for each row execute function public.emit_change();

create or replace function public.on_reaction_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  author uuid;
begin
  select author_id into author from public.posts where id = new.post_id;
  perform public.notify_user(author, new.user_id,
    case when new.kind = 'heart' then 'like' else 'reaction' end,
    new.post_id, null, null, null, new.kind);
  return null;
end $$;
drop trigger if exists reactions_notify on public.reactions;
create trigger reactions_notify after insert on public.reactions
for each row execute function public.on_reaction_insert();

create or replace function public.on_comment_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  post_author uuid;
  parent_author uuid;
  m uuid;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
  end if;
  if new.is_ai then
    perform public.notify_user(coalesce(parent_author, post_author), new.author_id, 'roast',
      new.post_id, new.id, null, null, new.body);
    return null;
  end if;
  perform public.notify_user(post_author, new.author_id, 'comment', new.post_id, new.id, null, null, new.body);
  if parent_author is not null and parent_author is distinct from post_author then
    perform public.notify_user(parent_author, new.author_id, 'reply', new.post_id, new.id, null, null, new.body);
  end if;
  foreach m in array public.extract_mentions(new.body) loop
    if m is distinct from post_author and m is distinct from parent_author then
      perform public.notify_user(m, new.author_id, 'mention', new.post_id, new.id, null, null, new.body);
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
for each row execute function public.on_comment_insert();

create or replace function public.on_post_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m uuid;
  orig_author uuid;
  fan uuid;
begin
  if new.repost_of is not null then
    select author_id into orig_author from public.posts where id = new.repost_of;
    perform public.notify_user(orig_author, new.author_id, 'repost', new.repost_of, null, null, null, new.body);
  end if;
  foreach m in array new.mentions loop
    perform public.notify_user(m, new.author_id, 'mention', new.id, null, null, null, new.body);
  end loop;
  if new.target_user_id is not null then
    perform public.notify_user(new.target_user_id, new.author_id, 'roast', new.id, null, null, null, coalesce(new.roast, new.body));
  end if;
  if new.repost_of is null and new.author_id <> public.bot_id() then
    for fan in
      select id from public.profiles
      where id <> new.author_id and not is_bot and not banned
        and coalesce((notification_prefs ->> 'friend_posts')::boolean, false)
    loop
      perform public.notify_user(fan, new.author_id, 'friend_post', new.id, null, null, null, new.body);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists posts_notify on public.posts;
create trigger posts_notify after insert on public.posts
for each row execute function public.on_post_insert();

create or replace function public.on_award_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  author uuid;
begin
  select author_id into author from public.posts where id = new.post_id;
  perform public.notify_user(author, new.giver_id, 'award', new.post_id, null, null, null, new.kind);
  return null;
end $$;
drop trigger if exists awards_notify on public.awards;
create trigger awards_notify after insert on public.awards
for each row execute function public.on_award_insert();

create or replace function public.on_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ch public.channels;
  m uuid;
  other uuid;
begin
  update public.channels set last_message_at = new.created_at where id = new.channel_id
  returning * into ch;
  if ch.kind = 'dm' then
    for other in select user_id from public.channel_members where channel_id = ch.id and user_id <> new.author_id loop
      perform public.notify_user(other, new.author_id, 'message', null, null, ch.id, new.id, new.body);
    end loop;
  else
    foreach m in array public.extract_mentions(new.body) loop
      if exists (select 1 from public.channel_members where channel_id = ch.id and user_id = m) then
        perform public.notify_user(m, new.author_id, 'mention', null, null, ch.id, new.id, new.body);
      end if;
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
for each row execute function public.on_message_insert();

-- ---------------------------------------------------------------------------
-- Sign-up: invite-only. Runs for every new auth user, so even direct calls to
-- the auth API cannot skip the invite check. The very first human becomes owner.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  invite_code text := meta ->> 'invite_code';
  inv public.invites;
  uname text;
  new_role text := 'member';
begin
  if not exists (select 1 from public.profiles where not is_bot) then
    new_role := 'owner';
  else
    select * into inv from public.invites where code = invite_code for update;
    if inv.code is null or inv.revoked or inv.uses >= inv.max_uses
       or (inv.expires_at is not null and inv.expires_at < now()) then
      raise exception 'INVALID_INVITE|That invite is dead. Like your social life.' using errcode = 'P0001';
    end if;
    update public.invites set uses = uses + 1 where code = inv.code;
  end if;

  uname := coalesce(nullif(meta ->> 'username', ''), split_part(new.email, '@', 1));
  uname := left(regexp_replace(uname, '[^A-Za-z0-9_]', '', 'g'), 20);
  if char_length(uname) < 3 then
    uname := uname || substr(md5(new.id::text), 1, 5);
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(uname)) then
    raise exception 'USERNAME_TAKEN|Username already taken. Be original for once.' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, username, display_name, avatar_url, role)
  values (
    new.id, uname,
    left(coalesce(nullif(trim(meta ->> 'display_name'), ''), uname), 40),
    nullif(meta ->> 'avatar_url', ''),
    new_role
  );
  if inv.code is not null then
    insert into public.invite_redemptions (code, user_id) values (inv.code, new.id);
  end if;
  insert into public.channel_members (channel_id, user_id)
  select id, new.id from public.channels where kind = 'group' and not is_private
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Public invite check (called by the server before showing the join form).
create or replace function public.check_invite(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  inv public.invites;
  inviter text;
  first_user boolean := not exists (select 1 from public.profiles where not is_bot);
begin
  if first_user then
    return jsonb_build_object('valid', true, 'first_user', true);
  end if;
  select * into inv from public.invites where code = p_code;
  if inv.code is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if inv.revoked then
    return jsonb_build_object('valid', false, 'reason', 'revoked');
  end if;
  if inv.uses >= inv.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'used_up');
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  select display_name into inviter from public.profiles where id = inv.created_by;
  return jsonb_build_object('valid', true, 'first_user', false, 'inviter', inviter);
end $$;

-- ---------------------------------------------------------------------------
-- JSON builders (security invoker: RLS applies)
-- ---------------------------------------------------------------------------

create or replace function public.profile_lite(p public.profiles) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'badge', p.badge, 'verified', p.verified,
    'is_bot', p.is_bot, 'role', p.role, 'status', p.status,
    'online', p.is_bot or coalesce(p.last_seen_at > now() - interval '5 minutes', false)
  )
$$;

create or replace function public.post_json_core(p public.posts, v uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'body', p.body,
    'media_url', p.media_url, 'media_type', p.media_type, 'link_url', p.link_url,
    'roast', p.roast, 'roast_label', p.roast_label, 'hashtags', to_jsonb(p.hashtags),
    'created_at', p.created_at,
    'author', (select public.profile_lite(a) from public.profiles a where a.id = p.author_id),
    'target', (select public.profile_lite(t) from public.profiles t where t.id = p.target_user_id),
    'counts', jsonb_build_object(
      'likes', (select count(*) from public.reactions r where r.post_id = p.id and r.kind = 'heart'),
      'comments', (select count(*) from public.comments c where c.post_id = p.id and c.deleted_at is null),
      'reposts', (select count(*) from public.posts rp where rp.repost_of = p.id and rp.deleted_at is null)
    ),
    'reactions', coalesce((
      select jsonb_object_agg(x.kind, x.n)
      from (select kind, count(*) as n from public.reactions where post_id = p.id group by kind) x
    ), '{}'::jsonb),
    'my_reactions', coalesce((
      select jsonb_agg(kind) from public.reactions where post_id = p.id and user_id = v
    ), '[]'::jsonb),
    'bookmarked', exists (select 1 from public.bookmarks b where b.post_id = p.id and b.user_id = v),
    'reposted', exists (
      select 1 from public.posts rp
      where rp.repost_of = p.id and rp.author_id = v and rp.deleted_at is null and rp.kind = 'repost'
    ),
    'awards', coalesce((
      select jsonb_object_agg(x.kind, x.n)
      from (select kind, count(*) as n from public.awards where post_id = p.id group by kind) x
    ), '{}'::jsonb),
    'my_awards', coalesce((
      select jsonb_agg(kind) from public.awards where post_id = p.id and giver_id = v
    ), '[]'::jsonb),
    'poll', case when p.kind = 'poll' then jsonb_build_object(
      'options', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o.id, 'label', o.label,
          'votes', (select count(*) from public.poll_votes pv where pv.option_id = o.id)
        ) order by o.position)
        from public.poll_options o where o.post_id = p.id
      ), '[]'::jsonb),
      'total', (select count(*) from public.poll_votes pv where pv.post_id = p.id),
      'my_vote', (select option_id from public.poll_votes pv where pv.post_id = p.id and pv.user_id = v)
    ) end
  )
$$;

create or replace function public.post_json(p public.posts, v uuid) returns jsonb
language sql stable as $$
  select public.post_json_core(p, v) || jsonb_build_object(
    'repost_of', (
      select public.post_json_core(rp, v) from public.posts rp
      where rp.id = p.repost_of and rp.deleted_at is null
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Read RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_me() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
  me public.profiles;
begin
  select * into me from public.profiles where id = v;
  return public.profile_lite(me) || jsonb_build_object(
    'bio', me.bio,
    'roast_opt_in', me.roast_opt_in,
    'roast_intensity', me.roast_intensity,
    'leaderboard_opt_in', me.leaderboard_opt_in,
    'ai_context_opt_in', me.ai_context_opt_in,
    'notification_prefs', me.notification_prefs,
    'inside_jokes', to_jsonb(me.inside_jokes),
    'chaos_points', me.chaos_points,
    'created_at', me.created_at,
    'unread_notifications', (select count(*) from public.notifications where user_id = v and read_at is null),
    'unread_messages', (
      select count(*) from public.messages m
      join public.channel_members cm on cm.channel_id = m.channel_id and cm.user_id = v
      where m.created_at > cm.last_read_at and m.author_id <> v and m.deleted_at is null
        and not public.is_hidden_author(m.author_id)
    )
  );
end $$;

create or replace function public.get_feed(
  p_mode text default 'latest',
  p_arg text default null,
  p_before timestamptz default null,
  p_offset int default 0,
  p_limit int default 15
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
  lim int := least(greatest(coalesce(p_limit, 15), 1), 50);
  target uuid;
  pattern text;
  res jsonb;
begin
  if p_mode = 'trending' then
    select coalesce(jsonb_agg(public.post_json(p, v) order by s.score desc), '[]'::jsonb) into res
    from (
      select p.id,
        ((select count(*) from public.reactions r where r.post_id = p.id)
          + 2 * (select count(*) from public.comments c where c.post_id = p.id and c.deleted_at is null)
          + 3 * (select count(*) from public.posts rp where rp.repost_of = p.id and rp.deleted_at is null)
          + 2 * (select count(*) from public.awards a where a.post_id = p.id)
          + 1)::float
        / power(extract(epoch from (now() - p.created_at)) / 3600.0 + 2, 1.2) as score
      from public.posts p
      where p.deleted_at is null and p.kind <> 'repost'
        and p.created_at > now() - interval '14 days'
        and not public.is_hidden_author(p.author_id)
      order by score desc
      offset greatest(coalesce(p_offset, 0), 0) limit lim
    ) s
    join public.posts p on p.id = s.id;
    return res;
  end if;

  if p_mode in ('user', 'media') then
    select id into target from public.profiles where lower(username) = lower(coalesce(p_arg, ''));
  end if;
  if p_mode = 'search' then
    pattern := '%' || replace(replace(replace(coalesce(p_arg, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select coalesce(jsonb_agg(public.post_json(p, v) order by p.created_at desc), '[]'::jsonb) into res
  from (
    select p.id from public.posts p
    where p.deleted_at is null
      and (p_before is null or p.created_at < p_before)
      and not public.is_hidden_author(p.author_id)
      and case p_mode
        when 'latest' then p.kind <> 'repost'
        when 'user' then p.author_id = target
        when 'media' then p.author_id = target and p.media_url is not null
        when 'tag' then lower(coalesce(p_arg, '')) = any (p.hashtags)
        when 'search' then char_length(coalesce(p_arg, '')) >= 2 and p.body ilike pattern
        when 'bookmarks' then exists (select 1 from public.bookmarks b where b.post_id = p.id and b.user_id = v)
        else false
      end
    order by p.created_at desc
    limit lim
  ) s
  join public.posts p on p.id = s.id;
  return res;
end $$;

create or replace function public.get_post(p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
  p public.posts;
begin
  select * into p from public.posts where id = p_id and deleted_at is null;
  if p.id is null or public.is_hidden_author(p.author_id) then
    raise exception 'NOT_FOUND|This post got yeeted into the void.' using errcode = 'P0002';
  end if;
  return public.post_json(p, v);
end $$;

create or replace function public.get_comments(p_post_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'post_id', c.post_id, 'parent_id', c.parent_id,
      'body', case when c.deleted_at is null then c.body else '' end,
      'deleted', c.deleted_at is not null,
      'is_ai', c.is_ai, 'created_at', c.created_at,
      'author', public.profile_lite(a),
      'likes', (select count(*) from public.comment_likes l where l.comment_id = c.id),
      'liked', exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = v)
    ) order by c.created_at)
    from public.comments c
    join public.profiles a on a.id = c.author_id
    where c.post_id = p_post_id and not public.is_hidden_author(c.author_id)
  ), '[]'::jsonb);
end $$;

create or replace function public.get_stories() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(g order by (g ->> 'all_viewed')::boolean, g ->> 'latest' desc)
    from (
      select jsonb_build_object(
        'key', coalesce('c:' || s.channel_id::text, 'u:' || min(s.author_id::text)),
        'label', coalesce(max(c.name), max(a.display_name)),
        'channel_id', s.channel_id,
        'author', case when s.channel_id is null then (select public.profile_lite(pa) from public.profiles pa where pa.id = min(s.author_id::text)::uuid) end,
        'online', bool_or(a.last_seen_at > now() - interval '5 minutes'),
        'latest', max(s.created_at),
        'all_viewed', bool_and(exists (select 1 from public.story_views sv where sv.story_id = s.id and sv.user_id = v)),
        'items', jsonb_agg(jsonb_build_object(
          'id', s.id, 'media_url', s.media_url, 'media_type', s.media_type,
          'text', s.text, 'bg', s.bg, 'created_at', s.created_at, 'expires_at', s.expires_at,
          'author', public.profile_lite(a),
          'viewed', exists (select 1 from public.story_views sv where sv.story_id = s.id and sv.user_id = v),
          'views', case when s.author_id = v then (select count(*) from public.story_views sv where sv.story_id = s.id) end
        ) order by s.created_at)
      ) as g
      from public.stories s
      join public.profiles a on a.id = s.author_id
      left join public.channels c on c.id = s.channel_id
      where s.deleted_at is null and s.expires_at > now()
        and not public.is_hidden_author(s.author_id)
        and (s.channel_id is null or public.can_see_channel(s.channel_id))
      group by s.channel_id, case when s.channel_id is null then s.author_id end
    ) groups
  ), '[]'::jsonb);
end $$;

create or replace function public.get_channels() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(x order by (x ->> 'is_member')::boolean desc, x ->> 'last_message_at' desc)
    from (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'emoji', c.emoji, 'description', c.description,
        'kind', c.kind, 'is_private', c.is_private, 'last_message_at', c.last_message_at,
        'is_member', cm.user_id is not null,
        'member_count', (select count(*) from public.channel_members m where m.channel_id = c.id),
        'unread', case when cm.user_id is null then 0 else (
          select count(*) from public.messages m
          where m.channel_id = c.id and m.created_at > cm.last_read_at
            and m.author_id <> v and m.deleted_at is null and not public.is_hidden_author(m.author_id)
        ) end,
        'dm_user', case when c.kind = 'dm' then (
          select public.profile_lite(p) from public.channel_members om
          join public.profiles p on p.id = om.user_id
          where om.channel_id = c.id and om.user_id <> v limit 1
        ) end,
        'last_message', (
          select jsonb_build_object(
            'body', case when m.body = '' and m.media_url is not null then '📎 media' else m.body end,
            'author', a.display_name, 'created_at', m.created_at)
          from public.messages m join public.profiles a on a.id = m.author_id
          where m.channel_id = c.id and m.deleted_at is null and not public.is_hidden_author(m.author_id)
          order by m.created_at desc limit 1
        )
      ) as x
      from public.channels c
      left join public.channel_members cm on cm.channel_id = c.id and cm.user_id = v
      where (c.kind = 'group' and not c.is_private) or cm.user_id is not null
    ) q
  ), '[]'::jsonb);
end $$;

create or replace function public.get_channel(p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
  c public.channels;
begin
  select * into c from public.channels where id = p_id;
  if c.id is null or not public.can_see_channel(c.id) then
    raise exception 'NOT_FOUND|That chat does not exist. Or you were never invited. Awkward.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', c.id, 'name', c.name, 'emoji', c.emoji, 'description', c.description,
    'kind', c.kind, 'is_private', c.is_private, 'created_by', c.created_by,
    'is_member', public.is_channel_member(c.id),
    'members', coalesce((
      select jsonb_agg(public.profile_lite(p) order by p.display_name)
      from public.channel_members cm join public.profiles p on p.id = cm.user_id
      where cm.channel_id = c.id
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.message_json(m public.messages, v uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'channel_id', m.channel_id,
    'body', case when m.deleted_at is null then m.body else '' end,
    'media_url', case when m.deleted_at is null then m.media_url end,
    'media_type', m.media_type,
    'deleted', m.deleted_at is not null, 'is_ai', m.is_ai, 'created_at', m.created_at,
    'author', (select public.profile_lite(a) from public.profiles a where a.id = m.author_id),
    'reply_to', (
      select jsonb_build_object('id', r.id, 'body', case when r.deleted_at is null then left(r.body, 140) else '' end,
        'author', (select display_name from public.profiles a where a.id = r.author_id))
      from public.messages r where r.id = m.reply_to
    ),
    'reactions', coalesce((
      select jsonb_agg(jsonb_build_object('emoji', x.emoji, 'count', x.n, 'mine', x.mine) order by x.first)
      from (
        select emoji, count(*) as n, bool_or(user_id = v) as mine, min(created_at) as first
        from public.message_reactions where message_id = m.id group by emoji
      ) x
    ), '[]'::jsonb)
  )
$$;

create or replace function public.get_messages(p_channel_id uuid, p_before timestamptz default null, p_after timestamptz default null, p_limit int default 50)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
  lim int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if not public.is_channel_member(p_channel_id) then
    raise exception 'FORBIDDEN|Join the chat first.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.message_json(m, v) order by m.created_at)
    from (
      select * from public.messages m
      where m.channel_id = p_channel_id
        and (p_before is null or m.created_at < p_before)
        and (p_after is null or m.created_at > p_after)
        and not public.is_hidden_author(m.author_id)
      order by m.created_at desc
      limit lim
    ) m
  ), '[]'::jsonb);
end $$;

create or replace function public.get_message(p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
  m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if m.id is null or not public.is_channel_member(m.channel_id) then
    raise exception 'NOT_FOUND|Message not found.' using errcode = 'P0002';
  end if;
  return public.message_json(m, v);
end $$;

create or replace function public.get_notifications(p_before timestamptz default null, p_limit int default 30)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'body', n.body, 'read', n.read_at is not null,
      'created_at', n.created_at, 'post_id', n.post_id, 'comment_id', n.comment_id,
      'channel_id', n.channel_id, 'message_id', n.message_id,
      'actor', (select public.profile_lite(a) from public.profiles a where a.id = n.actor_id)
    ) order by n.created_at desc)
    from (
      select * from public.notifications
      where user_id = v and (p_before is null or created_at < p_before)
      order by created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) n
  ), '[]'::jsonb);
end $$;

create or replace function public.get_members() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(public.profile_lite(p) order by p.is_bot, p.last_seen_at desc nulls last)
    from public.profiles p where not p.banned and not public.is_hidden_author(p.id)
  ), '[]'::jsonb);
end $$;

create or replace function public.profile_stats(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posts', (select count(*) from public.posts where author_id = p_id and deleted_at is null and kind <> 'repost'),
    'likes', (select count(*) from public.reactions r join public.posts p on p.id = r.post_id
              where p.author_id = p_id and r.kind = 'heart' and p.deleted_at is null),
    'reactions', (select count(*) from public.reactions r join public.posts p on p.id = r.post_id
              where p.author_id = p_id and p.deleted_at is null),
    'comments', (select count(*) from public.comments where author_id = p_id and deleted_at is null),
    'awards', (select count(*) from public.awards a join public.posts p on p.id = a.post_id
              where p.author_id = p_id and p.deleted_at is null),
    'roasted', (select count(*) from public.comments c join public.posts p on p.id = c.post_id
              where c.is_ai and p.author_id = p_id)
             + (select count(*) from public.posts where target_user_id = p_id and deleted_at is null),
    'best_post_likes', coalesce((select max(n) from (
              select count(*) as n from public.reactions r join public.posts p on p.id = r.post_id
              where p.author_id = p_id and r.kind = 'heart' and p.deleted_at is null group by p.id) x), 0),
    'challenges', (select count(*) from public.posts where author_id = p_id and deleted_at is null
              and 'dailychallenge' = any (hashtags)),
    'chaos_points', (select chaos_points from public.profiles where id = p_id)
  )
$$;

create or replace function public.get_profile(p_username text) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
  p public.profiles;
  stats jsonb;
  badges text[] := '{}';
begin
  select * into p from public.profiles where lower(username) = lower(p_username);
  if p.id is null or (p.banned and not public.is_admin()) then
    raise exception 'NOT_FOUND|No such menace. They might have touched grass permanently.' using errcode = 'P0002';
  end if;
  stats := public.profile_stats(p.id);
  if p.role = 'owner' then badges := badges || 'founder'::text; end if;
  if p.verified then badges := badges || 'verified'::text; end if;
  if (stats ->> 'posts')::int >= 1 then badges := badges || 'first_blood'::text; end if;
  if (stats ->> 'posts')::int >= 25 then badges := badges || 'yapper'::text; end if;
  if (stats ->> 'best_post_likes')::int >= 10 then badges := badges || 'banger'::text; end if;
  if (stats ->> 'likes')::int >= 100 then badges := badges || 'ratio_god'::text; end if;
  if (stats ->> 'roasted')::int >= 1 then badges := badges || 'roast_survivor'::text; end if;
  if (stats ->> 'awards')::int >= 5 then badges := badges || 'award_magnet'::text; end if;
  if (stats ->> 'chaos_points')::int >= 50 then badges := badges || 'chaos_agent'::text; end if;
  if (stats ->> 'challenges')::int >= 1 then badges := badges || 'challenge_accepted'::text; end if;
  if p.roast_opt_in and p.roast_intensity = 3 then badges := badges || 'fireproof'::text; end if;
  return public.profile_lite(p) || jsonb_build_object(
    'bio', p.bio, 'created_at', p.created_at, 'inside_jokes', to_jsonb(p.inside_jokes),
    'roast_opt_in', p.roast_opt_in, 'banned', p.banned,
    'last_seen_at', p.last_seen_at,
    'stats', stats, 'badges', to_jsonb(badges),
    'is_me', p.id = v,
    'blocked', exists (select 1 from public.blocks where blocker_id = v and blocked_id = p.id)
  );
end $$;

create or replace function public.get_leaderboard() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return (
    with eligible as (
      select p.* from public.profiles p
      where p.leaderboard_opt_in and not p.is_bot and not p.banned
    ), s as (
      select e.id, public.profile_lite(e) as profile, public.profile_stats(e.id) as st,
        (select count(*) from public.posts x where x.author_id = e.id and x.deleted_at is null
           and x.created_at > now() - interval '7 days' and x.kind <> 'repost') as week_posts
      from eligible e
    )
    select jsonb_build_object(
      'likes', coalesce((select jsonb_agg(jsonb_build_object('profile', profile, 'score', (st ->> 'likes')::int) order by (st ->> 'likes')::int desc)
        from (select * from s where (st ->> 'likes')::int > 0 order by (st ->> 'likes')::int desc limit 10) a), '[]'::jsonb),
      'chaos', coalesce((select jsonb_agg(jsonb_build_object('profile', profile, 'score', (st ->> 'chaos_points')::int) order by (st ->> 'chaos_points')::int desc)
        from (select * from s where (st ->> 'chaos_points')::int > 0 order by (st ->> 'chaos_points')::int desc limit 10) a), '[]'::jsonb),
      'awards', coalesce((select jsonb_agg(jsonb_build_object('profile', profile, 'score', (st ->> 'awards')::int) order by (st ->> 'awards')::int desc)
        from (select * from s where (st ->> 'awards')::int > 0 order by (st ->> 'awards')::int desc limit 10) a), '[]'::jsonb),
      'roasted', coalesce((select jsonb_agg(jsonb_build_object('profile', profile, 'score', (st ->> 'roasted')::int) order by (st ->> 'roasted')::int desc)
        from (select * from s where (st ->> 'roasted')::int > 0 order by (st ->> 'roasted')::int desc limit 10) a), '[]'::jsonb),
      'yappers', coalesce((select jsonb_agg(jsonb_build_object('profile', profile, 'score', week_posts) order by week_posts desc)
        from (select * from s where week_posts > 0 order by week_posts desc limit 10) a), '[]'::jsonb),
      'opted_in', (select leaderboard_opt_in from public.profiles where id = v)
    )
  );
end $$;

create or replace function public.get_trending_tags(p_limit int default 10) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  perform public.require_member();
  return coalesce((
    select jsonb_agg(jsonb_build_object('tag', tag, 'count', n) order by n desc, tag)
    from (
      select t.tag, count(*) as n
      from public.posts p, unnest(p.hashtags) as t(tag)
      where p.deleted_at is null and p.created_at > now() - interval '7 days'
      group by t.tag order by n desc, t.tag limit least(greatest(coalesce(p_limit, 10), 1), 30)
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.search_profiles(p_q text) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  pattern text := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public.require_member();
  if char_length(coalesce(p_q, '')) < 1 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.profile_lite(p))
    from (select * from public.profiles p
          where not p.banned and (p.username ilike pattern or p.display_name ilike pattern)
            and not public.is_hidden_author(p.id)
          order by p.display_name limit 10) p
  ), '[]'::jsonb);
end $$;

create or replace function public.get_blocked() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(public.profile_lite(p) order by p.display_name)
    from public.blocks b join public.profiles p on p.id = b.blocked_id
    where b.blocker_id = v
  ), '[]'::jsonb);
end $$;

create or replace function public.get_ai_history(p_limit int default 40) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'role', role, 'content', content, 'created_at', created_at) order by created_at)
    from (select * from public.ai_messages where user_id = v order by created_at desc
          limit least(greatest(coalesce(p_limit, 40), 1), 100)) m
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Write RPCs (security definer, explicit checks)
-- ---------------------------------------------------------------------------

create or replace function public.touch_presence() returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  update public.profiles set last_seen_at = now() where id = v;
end $$;

create or replace function public.update_my_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  jokes text[];
begin
  perform public.enforce_rate_limit('profile', 30, 600);
  if p ? 'avatar_url' and not public.valid_media_path(nullif(p ->> 'avatar_url', ''), v) then
    raise exception 'INVALID|That avatar is not yours.';
  end if;
  if p ? 'inside_jokes' then
    select coalesce(array_agg(left(trim(j), 40)), '{}') into jokes
    from (select jsonb_array_elements_text(p -> 'inside_jokes') as j limit 12) x
    where trim(j) <> '';
  end if;
  update public.profiles set
    display_name = coalesce(nullif(trim(p ->> 'display_name'), ''), display_name),
    avatar_url = case when p ? 'avatar_url' then nullif(p ->> 'avatar_url', '') else avatar_url end,
    bio = coalesce(p ->> 'bio', bio),
    status = coalesce(p ->> 'status', status),
    badge = coalesce(p ->> 'badge', badge),
    roast_opt_in = coalesce((p ->> 'roast_opt_in')::boolean, roast_opt_in),
    roast_intensity = coalesce((p ->> 'roast_intensity')::int, roast_intensity),
    leaderboard_opt_in = coalesce((p ->> 'leaderboard_opt_in')::boolean, leaderboard_opt_in),
    ai_context_opt_in = coalesce((p ->> 'ai_context_opt_in')::boolean, ai_context_opt_in),
    notification_prefs = case when jsonb_typeof(p -> 'notification_prefs') = 'object'
      then notification_prefs || (
        select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
        from jsonb_each(p -> 'notification_prefs')
        where key in ('likes', 'comments', 'mentions', 'reposts', 'messages', 'awards', 'friend_posts')
          and jsonb_typeof(value) = 'boolean'
      ) else notification_prefs end,
    inside_jokes = coalesce(jokes, inside_jokes)
  where id = v;
  return public.get_me();
end $$;

create or replace function public.create_post(
  p_body text default '',
  p_media_url text default null,
  p_media_type text default null,
  p_link_url text default null,
  p_poll_options text[] default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  new_id uuid;
  opt text;
  i int := 0;
  body text := trim(coalesce(p_body, ''));
  is_poll boolean := p_poll_options is not null and array_length(p_poll_options, 1) is not null;
begin
  perform public.enforce_rate_limit('post', 20, 600);
  if not public.valid_media_path(p_media_url, v) then
    raise exception 'INVALID|You can only attach your own uploads.';
  end if;
  if p_media_url is not null and p_media_type is null then
    raise exception 'INVALID|Media type missing.';
  end if;
  if body = '' and p_media_url is null and not is_poll then
    raise exception 'INVALID|Empty post. Even your silence is mid.';
  end if;
  if is_poll then
    if array_length(p_poll_options, 1) not between 2 and 6 then
      raise exception 'INVALID|Polls need 2 to 6 options.';
    end if;
    if body = '' then
      raise exception 'INVALID|Ask an actual question for your poll.';
    end if;
  end if;
  insert into public.posts (author_id, kind, body, media_url, media_type, link_url)
  values (v, case when is_poll then 'poll' else 'post' end, body,
          p_media_url, case when p_media_url is null then null else p_media_type end,
          nullif(trim(coalesce(p_link_url, '')), ''))
  returning id into new_id;
  if is_poll then
    foreach opt in array p_poll_options loop
      if trim(opt) = '' then
        raise exception 'INVALID|Poll options cannot be blank.';
      end if;
      insert into public.poll_options (post_id, label, position) values (new_id, left(trim(opt), 80), i);
      i := i + 1;
    end loop;
  end if;
  if 'dailychallenge' = any (public.extract_hashtags(body)) then
    update public.profiles set chaos_points = chaos_points + 5 where id = v;
  end if;
  return new_id;
end $$;

create or replace function public.delete_post(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  author uuid;
begin
  select author_id into author from public.posts where id = p_id and deleted_at is null;
  if author is null then
    raise exception 'NOT_FOUND|Already gone.' using errcode = 'P0002';
  end if;
  if author <> v and not public.is_admin() then
    raise exception 'FORBIDDEN|Not your post, not your problem.' using errcode = '42501';
  end if;
  update public.posts set deleted_at = now() where id = p_id;
end $$;

create or replace function public.toggle_repost(p_post_id uuid, p_quote text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  orig public.posts;
  existing uuid;
  quote text := nullif(trim(coalesce(p_quote, '')), '');
begin
  select * into orig from public.posts where id = p_post_id and deleted_at is null;
  if orig.id is null or public.is_hidden_author(orig.author_id) then
    raise exception 'NOT_FOUND|That post is gone.' using errcode = 'P0002';
  end if;
  if orig.repost_of is not null and orig.kind = 'repost' then
    select * into orig from public.posts where id = orig.repost_of and deleted_at is null;
    if orig.id is null then
      raise exception 'NOT_FOUND|The original got deleted.' using errcode = 'P0002';
    end if;
  end if;
  perform public.enforce_rate_limit('repost', 60, 600);
  if quote is null then
    select id into existing from public.posts
    where repost_of = orig.id and author_id = v and kind = 'repost' and deleted_at is null;
    if existing is not null then
      update public.posts set deleted_at = now() where id = existing;
      return jsonb_build_object('reposted', false);
    end if;
    insert into public.posts (author_id, kind, body, repost_of) values (v, 'repost', '', orig.id);
    return jsonb_build_object('reposted', true);
  end if;
  insert into public.posts (author_id, kind, body, repost_of) values (v, 'post', left(quote, 2000), orig.id)
  returning id into existing;
  return jsonb_build_object('reposted', true, 'quote_id', existing);
end $$;

create or replace function public.toggle_reaction(p_post_id uuid, p_kind text default 'heart') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  active boolean;
  author uuid;
begin
  select author_id into author from public.posts where id = p_post_id and deleted_at is null;
  if author is null or public.is_hidden_author(author) then
    raise exception 'NOT_FOUND|That post is gone.' using errcode = 'P0002';
  end if;
  perform public.enforce_rate_limit('react', 400, 600);
  delete from public.reactions where post_id = p_post_id and user_id = v and kind = p_kind;
  if found then
    active := false;
  else
    insert into public.reactions (post_id, user_id, kind) values (p_post_id, v, p_kind);
    active := true;
  end if;
  return jsonb_build_object('active', active, 'kind', p_kind);
end $$;

create or replace function public.vote_poll(p_post_id uuid, p_option_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  p public.posts;
begin
  select * into p from public.posts where id = p_post_id and deleted_at is null and kind = 'poll';
  if p.id is null then
    raise exception 'NOT_FOUND|That poll is gone.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.poll_options where id = p_option_id and post_id = p_post_id) then
    raise exception 'INVALID|That is not an option. Democracy has rules.';
  end if;
  perform public.enforce_rate_limit('vote', 120, 600);
  insert into public.poll_votes (post_id, option_id, user_id) values (p_post_id, p_option_id, v)
  on conflict (post_id, user_id) do update set option_id = excluded.option_id, created_at = now();
  return public.post_json(p, v);
end $$;

create or replace function public.toggle_bookmark(p_post_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  if not exists (select 1 from public.posts where id = p_post_id and deleted_at is null) then
    raise exception 'NOT_FOUND|That post is gone.' using errcode = 'P0002';
  end if;
  delete from public.bookmarks where user_id = v and post_id = p_post_id;
  if found then
    return jsonb_build_object('bookmarked', false);
  end if;
  insert into public.bookmarks (user_id, post_id) values (v, p_post_id);
  return jsonb_build_object('bookmarked', true);
end $$;

create or replace function public.add_comment(p_post_id uuid, p_body text, p_parent_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  author uuid;
  new_id uuid;
begin
  select author_id into author from public.posts where id = p_post_id and deleted_at is null;
  if author is null or public.is_hidden_author(author) then
    raise exception 'NOT_FOUND|That post is gone.' using errcode = 'P0002';
  end if;
  if trim(coalesce(p_body, '')) = '' then
    raise exception 'INVALID|Say something. Anything. Please.';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from public.comments where id = p_parent_id and post_id = p_post_id
  ) then
    raise exception 'INVALID|You are replying to a ghost.';
  end if;
  perform public.enforce_rate_limit('comment', 60, 600);
  insert into public.comments (post_id, parent_id, author_id, body)
  values (p_post_id, p_parent_id, v, left(trim(p_body), 1000))
  returning id into new_id;
  return jsonb_build_object('id', new_id);
end $$;

create or replace function public.delete_comment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  c public.comments;
  post_author uuid;
begin
  select * into c from public.comments where id = p_id and deleted_at is null;
  if c.id is null then
    raise exception 'NOT_FOUND|Already gone.' using errcode = 'P0002';
  end if;
  select author_id into post_author from public.posts where id = c.post_id;
  if c.author_id <> v and post_author <> v and not public.is_admin() then
    raise exception 'FORBIDDEN|Not yours to delete.' using errcode = '42501';
  end if;
  update public.comments set deleted_at = now() where id = p_id;
end $$;

create or replace function public.toggle_comment_like(p_comment_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  if not exists (select 1 from public.comments where id = p_comment_id and deleted_at is null) then
    raise exception 'NOT_FOUND|That comment is gone.' using errcode = 'P0002';
  end if;
  perform public.enforce_rate_limit('react', 400, 600);
  delete from public.comment_likes where comment_id = p_comment_id and user_id = v;
  if found then
    return jsonb_build_object('liked', false);
  end if;
  insert into public.comment_likes (comment_id, user_id) values (p_comment_id, v);
  return jsonb_build_object('liked', true);
end $$;

create or replace function public.give_award(p_post_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  author uuid;
  today int;
begin
  select author_id into author from public.posts where id = p_post_id and deleted_at is null;
  if author is null then
    raise exception 'NOT_FOUND|That post is gone.' using errcode = 'P0002';
  end if;
  if author = v then
    raise exception 'INVALID|Awarding yourself? Seek help.';
  end if;
  select count(*) into today from public.awards where giver_id = v and created_at > now() - interval '24 hours';
  if today >= 5 then
    raise exception 'RATE_LIMIT|You are out of awards for today. The committee is exhausted.';
  end if;
  insert into public.awards (post_id, giver_id, kind) values (p_post_id, v, p_kind)
  on conflict do nothing;
  if not found then
    raise exception 'INVALID|You already gave that award here.';
  end if;
  update public.profiles set chaos_points = chaos_points + 2 where id = author;
  return jsonb_build_object('ok', true, 'remaining', 4 - today);
end $$;

create or replace function public.create_story(
  p_text text default '', p_media_url text default null, p_media_type text default null,
  p_bg text default 'lime', p_channel_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  new_id uuid;
begin
  perform public.enforce_rate_limit('story', 15, 3600);
  if not public.valid_media_path(p_media_url, v) then
    raise exception 'INVALID|You can only post your own uploads.';
  end if;
  if p_channel_id is not null and not public.is_channel_member(p_channel_id) then
    raise exception 'FORBIDDEN|You are not in that group.' using errcode = '42501';
  end if;
  if p_media_url is null and trim(coalesce(p_text, '')) = '' then
    raise exception 'INVALID|A story needs a picture or some words.';
  end if;
  insert into public.stories (author_id, channel_id, media_url, media_type, text, bg)
  values (v, p_channel_id, p_media_url, case when p_media_url is null then null else coalesce(p_media_type, 'image') end,
          left(trim(coalesce(p_text, '')), 200), coalesce(p_bg, 'lime'))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.view_story(p_story_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  insert into public.story_views (story_id, user_id)
  select id, v from public.stories where id = p_story_id and expires_at > now() and deleted_at is null
  on conflict do nothing;
end $$;

create or replace function public.delete_story(p_story_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  update public.stories set deleted_at = now()
  where id = p_story_id and (author_id = v or public.is_admin());
  if not found then
    raise exception 'FORBIDDEN|Not your story.' using errcode = '42501';
  end if;
end $$;

create or replace function public.create_channel(
  p_name text, p_emoji text default '💬', p_description text default '',
  p_is_private boolean default false, p_member_ids uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  new_id uuid;
begin
  perform public.enforce_rate_limit('channel', 10, 3600);
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'INVALID|Name your chat. "Untitled" is not a vibe.';
  end if;
  insert into public.channels (name, emoji, description, kind, is_private, created_by)
  values (left(trim(p_name), 40), coalesce(nullif(p_emoji, ''), '💬'), left(coalesce(p_description, ''), 200), 'group', coalesce(p_is_private, false), v)
  returning id into new_id;
  insert into public.channel_members (channel_id, user_id, role) values (new_id, v, 'owner');
  if coalesce(p_is_private, false) then
    insert into public.channel_members (channel_id, user_id)
    select new_id, p.id from public.profiles p
    where p.id = any (coalesce(p_member_ids, '{}')) and not p.is_bot and not p.banned and p.id <> v
    on conflict do nothing;
  else
    insert into public.channel_members (channel_id, user_id)
    select new_id, p.id from public.profiles p where not p.is_bot and not p.banned and p.id <> v
    on conflict do nothing;
  end if;
  return new_id;
end $$;

create or replace function public.start_dm(p_user_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  existing uuid;
begin
  if p_user_id = v then
    raise exception 'INVALID|Talking to yourself? Use the notes app.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and not is_bot and not banned) then
    raise exception 'NOT_FOUND|That person does not exist here.' using errcode = 'P0002';
  end if;
  if public.is_hidden_author(p_user_id) then
    raise exception 'FORBIDDEN|You cannot DM this person.' using errcode = '42501';
  end if;
  select c.id into existing from public.channels c
  where c.kind = 'dm'
    and exists (select 1 from public.channel_members where channel_id = c.id and user_id = v)
    and exists (select 1 from public.channel_members where channel_id = c.id and user_id = p_user_id)
  limit 1;
  if existing is not null then
    return existing;
  end if;
  perform public.enforce_rate_limit('channel', 10, 3600);
  insert into public.channels (kind, is_private, created_by, emoji) values ('dm', true, v, '✉️')
  returning id into existing;
  insert into public.channel_members (channel_id, user_id) values (existing, v), (existing, p_user_id);
  return existing;
end $$;

create or replace function public.join_channel(p_channel_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  if not exists (select 1 from public.channels where id = p_channel_id and kind = 'group' and not is_private) then
    raise exception 'FORBIDDEN|That chat is invite-only.' using errcode = '42501';
  end if;
  insert into public.channel_members (channel_id, user_id) values (p_channel_id, v) on conflict do nothing;
end $$;

create or replace function public.leave_channel(p_channel_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  delete from public.channel_members where channel_id = p_channel_id and user_id = v;
end $$;

create or replace function public.add_channel_members(p_channel_id uuid, p_member_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  if not public.is_channel_member(p_channel_id)
     or exists (select 1 from public.channels where id = p_channel_id and kind = 'dm') then
    raise exception 'FORBIDDEN|You cannot add people here.' using errcode = '42501';
  end if;
  insert into public.channel_members (channel_id, user_id)
  select p_channel_id, p.id from public.profiles p
  where p.id = any (coalesce(p_member_ids, '{}')) and not p.is_bot and not p.banned
  on conflict do nothing;
end $$;

create or replace function public.mark_channel_read(p_channel_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  update public.channel_members set last_read_at = now() where channel_id = p_channel_id and user_id = v;
end $$;

create or replace function public.send_message(
  p_channel_id uuid, p_body text default '', p_media_url text default null,
  p_media_type text default null, p_reply_to uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  m public.messages;
begin
  if not public.is_channel_member(p_channel_id) then
    if exists (select 1 from public.channels where id = p_channel_id and kind = 'group' and not is_private) then
      insert into public.channel_members (channel_id, user_id) values (p_channel_id, v) on conflict do nothing;
    else
      raise exception 'FORBIDDEN|You are not in this chat.' using errcode = '42501';
    end if;
  end if;
  if not public.valid_media_path(p_media_url, v) then
    raise exception 'INVALID|You can only send your own uploads.';
  end if;
  if trim(coalesce(p_body, '')) = '' and p_media_url is null then
    raise exception 'INVALID|Empty message. Very mysterious. Very annoying.';
  end if;
  if p_reply_to is not null and not exists (
    select 1 from public.messages where id = p_reply_to and channel_id = p_channel_id
  ) then
    raise exception 'INVALID|Replying to a message from another dimension.';
  end if;
  perform public.enforce_rate_limit('message', 120, 300);
  insert into public.messages (channel_id, author_id, body, media_url, media_type, reply_to)
  values (p_channel_id, v, left(trim(coalesce(p_body, '')), 2000), p_media_url,
          case when p_media_url is null then null else coalesce(p_media_type, 'image') end, p_reply_to)
  returning * into m;
  update public.channel_members set last_read_at = now() where channel_id = p_channel_id and user_id = v;
  return public.message_json(m, v);
end $$;

create or replace function public.delete_message(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  update public.messages set deleted_at = now()
  where id = p_id and deleted_at is null and (author_id = v or public.is_admin());
  if not found then
    raise exception 'FORBIDDEN|Not your message.' using errcode = '42501';
  end if;
end $$;

create or replace function public.toggle_message_reaction(p_message_id uuid, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  ch uuid;
begin
  select channel_id into ch from public.messages where id = p_message_id and deleted_at is null;
  if ch is null or not public.is_channel_member(ch) then
    raise exception 'NOT_FOUND|Message not found.' using errcode = 'P0002';
  end if;
  perform public.enforce_rate_limit('react', 400, 600);
  delete from public.message_reactions where message_id = p_message_id and user_id = v and emoji = p_emoji;
  if found then
    return jsonb_build_object('active', false);
  end if;
  insert into public.message_reactions (message_id, user_id, emoji) values (p_message_id, v, p_emoji);
  return jsonb_build_object('active', true);
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  update public.notifications set read_at = now()
  where user_id = v and read_at is null and (p_ids is null or id = any (p_ids));
end $$;

create or replace function public.toggle_block(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  if p_user_id = v then
    raise exception 'INVALID|You cannot block yourself. We tried.';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and is_bot) then
    raise exception 'INVALID|You cannot block the Menace. Turn off roasts in settings instead.';
  end if;
  delete from public.blocks where blocker_id = v and blocked_id = p_user_id;
  if found then
    return jsonb_build_object('blocked', false);
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (v, p_user_id);
  return jsonb_build_object('blocked', true);
end $$;

create or replace function public.create_report(p_target_type text, p_target_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  perform public.enforce_rate_limit('report', 20, 86400);
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'INVALID|Tell the mods what happened.';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (v, p_target_type, p_target_id, left(trim(p_reason), 500));
end $$;

create or replace function public.save_ai_exchange(p_user_text text, p_ai_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  insert into public.ai_messages (user_id, role, content, created_at) values
    (v, 'user', left(coalesce(p_user_text, ''), 4000), now()),
    (v, 'assistant', left(coalesce(p_ai_text, ''), 4000), now() + interval '1 millisecond');
  delete from public.ai_messages where user_id = v and id not in (
    select id from public.ai_messages where user_id = v order by created_at desc limit 200
  );
end $$;

create or replace function public.clear_ai_history() returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  delete from public.ai_messages where user_id = v;
end $$;

create or replace function public.add_chaos_points(p_points int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  total int;
begin
  perform public.enforce_rate_limit('chaos', 60, 3600);
  update public.profiles set chaos_points = chaos_points + least(greatest(coalesce(p_points, 1), 1), 5)
  where id = v returning chaos_points into total;
  return total;
end $$;

-- AI context: only data the user explicitly opted in to share.
create or replace function public.get_ai_context(p_user_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  target uuid := coalesce(p_user_id, v);
  p public.profiles;
begin
  select * into p from public.profiles where id = target and not banned;
  if p.id is null then
    raise exception 'NOT_FOUND|No such user.' using errcode = 'P0002';
  end if;
  if target <> v and not p.roast_opt_in then
    return jsonb_build_object('id', p.id, 'display_name', p.display_name, 'roast_opt_in', false, 'shared', false);
  end if;
  return jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'username', p.username,
    'roast_opt_in', p.roast_opt_in,
    'roast_intensity', p.roast_intensity,
    'shared', p.ai_context_opt_in,
    'bio', case when p.ai_context_opt_in then p.bio end,
    'status', case when p.ai_context_opt_in then p.status end,
    'inside_jokes', case when p.ai_context_opt_in then to_jsonb(p.inside_jokes) end,
    'recent_posts', case when p.ai_context_opt_in then (
      select coalesce(jsonb_agg(body), '[]'::jsonb) from (
        select body from public.posts where author_id = p.id and deleted_at is null and body <> ''
        order by created_at desc limit 5) x
    ) end
  );
end $$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
begin
  return jsonb_build_object(
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', i.code, 'note', i.note, 'max_uses', i.max_uses, 'uses', i.uses,
        'expires_at', i.expires_at, 'revoked', i.revoked, 'created_at', i.created_at,
        'created_by', (select display_name from public.profiles where id = i.created_by)
      ) order by i.created_at desc) from public.invites i
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(public.profile_lite(p) || jsonb_build_object(
        'banned', p.banned, 'created_at', p.created_at, 'last_seen_at', p.last_seen_at,
        'posts', (select count(*) from public.posts where author_id = p.id and deleted_at is null)
      ) order by p.created_at) from public.profiles p where not p.is_bot
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'target_type', r.target_type, 'target_id', r.target_id, 'reason', r.reason,
        'status', r.status, 'action', r.action, 'created_at', r.created_at,
        'reporter', (select public.profile_lite(p) from public.profiles p where p.id = r.reporter_id),
        'target', case r.target_type
          when 'post' then (select jsonb_build_object('body', p.body, 'media_url', p.media_url, 'deleted', p.deleted_at is not null,
                              'author', (select public.profile_lite(a) from public.profiles a where a.id = p.author_id))
                            from public.posts p where p.id = r.target_id)
          when 'comment' then (select jsonb_build_object('body', c.body, 'post_id', c.post_id, 'deleted', c.deleted_at is not null,
                              'author', (select public.profile_lite(a) from public.profiles a where a.id = c.author_id))
                            from public.comments c where c.id = r.target_id)
          when 'message' then (select jsonb_build_object('body', m.body, 'media_url', m.media_url, 'deleted', m.deleted_at is not null,
                              'author', (select public.profile_lite(a) from public.profiles a where a.id = m.author_id))
                            from public.messages m where m.id = r.target_id)
          when 'story' then (select jsonb_build_object('body', s.text, 'media_url', s.media_url, 'deleted', s.deleted_at is not null,
                              'author', (select public.profile_lite(a) from public.profiles a where a.id = s.author_id))
                            from public.stories s where s.id = r.target_id)
          when 'user' then (select jsonb_build_object('body', p.bio, 'deleted', p.banned, 'author', public.profile_lite(p))
                            from public.profiles p where p.id = r.target_id)
        end
      ) order by (r.status = 'open') desc, r.created_at desc)
      from (select * from public.reports order by created_at desc limit 100) r
    ), '[]'::jsonb),
    'my_role', (select role from public.profiles where id = v)
  );
end $$;

create or replace function public.admin_create_invite(p_max_uses int default 5, p_expires_hours int default 168, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
  new_code text;
begin
  perform public.enforce_rate_limit('invite', 30, 86400);
  new_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  insert into public.invites (code, created_by, note, max_uses, expires_at)
  values (new_code, v, left(coalesce(p_note, ''), 80), least(greatest(coalesce(p_max_uses, 5), 1), 500),
          case when coalesce(p_expires_hours, 0) > 0 then now() + make_interval(hours => least(p_expires_hours, 24 * 90)) end);
  return jsonb_build_object('code', new_code);
end $$;

create or replace function public.admin_revoke_invite(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.invites set revoked = true where code = p_code;
end $$;

create or replace function public.admin_set_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
  my_role text;
  their_role text;
begin
  select role into my_role from public.profiles where id = v;
  select role into their_role from public.profiles where id = p_user_id and not is_bot;
  if their_role is null then
    raise exception 'NOT_FOUND|No such member.' using errcode = 'P0002';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'INVALID|Roles are admin or member. Ownership is forever.';
  end if;
  if my_role <> 'owner' or their_role = 'owner' then
    raise exception 'FORBIDDEN|Only the owner hands out the crowns.' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end $$;

create or replace function public.admin_set_banned(p_user_id uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
  their_role text;
begin
  select role into their_role from public.profiles where id = p_user_id and not is_bot;
  if their_role is null then
    raise exception 'NOT_FOUND|No such member.' using errcode = 'P0002';
  end if;
  if p_user_id = v or their_role = 'owner'
     or (their_role = 'admin' and (select role from public.profiles where id = v) <> 'owner') then
    raise exception 'FORBIDDEN|You cannot ban that person.' using errcode = '42501';
  end if;
  update public.profiles set banned = coalesce(p_banned, true) where id = p_user_id;
end $$;

create or replace function public.admin_set_verified(p_user_id uuid, p_verified boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.profiles set verified = coalesce(p_verified, false) where id = p_user_id and not is_bot;
end $$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
  r public.reports;
  target_author uuid;
begin
  select * into r from public.reports where id = p_report_id;
  if r.id is null then
    raise exception 'NOT_FOUND|No such report.' using errcode = 'P0002';
  end if;
  if p_action not in ('dismiss', 'delete', 'ban') then
    raise exception 'INVALID|Unknown moderation action.';
  end if;
  if p_action in ('delete', 'ban') then
    if r.target_type = 'post' then
      update public.posts set deleted_at = coalesce(deleted_at, now()) where id = r.target_id returning author_id into target_author;
    elsif r.target_type = 'comment' then
      update public.comments set deleted_at = coalesce(deleted_at, now()) where id = r.target_id returning author_id into target_author;
    elsif r.target_type = 'message' then
      update public.messages set deleted_at = coalesce(deleted_at, now()) where id = r.target_id returning author_id into target_author;
    elsif r.target_type = 'story' then
      update public.stories set deleted_at = coalesce(deleted_at, now()) where id = r.target_id returning author_id into target_author;
    elsif r.target_type = 'user' then
      target_author := r.target_id;
    end if;
  end if;
  if p_action = 'ban' and target_author is not null then
    perform public.admin_set_banned(target_author, true);
  end if;
  update public.reports
  set status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end,
      action = p_action, resolved_by = v, resolved_at = now()
  where id = p_report_id;
end $$;

-- ---------------------------------------------------------------------------
-- Bot RPCs — only the server (service role) may call these.
-- ---------------------------------------------------------------------------

create or replace function public.bot_add_comment(p_post_id uuid, p_body text, p_parent_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  insert into public.comments (post_id, parent_id, author_id, body, is_ai)
  values (p_post_id, p_parent_id, public.bot_id(), left(p_body, 1000), true)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.bot_create_post(
  p_body text, p_roast text default null, p_roast_label text default null,
  p_kind text default 'post', p_target_user_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  insert into public.posts (author_id, kind, body, roast, roast_label, target_user_id)
  values (public.bot_id(), p_kind, left(coalesce(p_body, ''), 2000), left(p_roast, 800), left(p_roast_label, 40), p_target_user_id)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.bot_send_message(p_channel_id uuid, p_body text, p_reply_to uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  insert into public.messages (channel_id, author_id, body, reply_to, is_ai)
  values (p_channel_id, public.bot_id(), left(p_body, 2000), p_reply_to, true)
  returning id into new_id;
  return new_id;
end $$;

-- Latest roastable post from someone who opted in to roasts.
create or replace function public.bot_pick_roast_target() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('user_id', p.id, 'display_name', p.display_name, 'username', p.username,
    'roast_intensity', p.roast_intensity, 'post_body', x.body)
  from public.profiles p
  join lateral (
    select body from public.posts where author_id = p.id and deleted_at is null and body <> ''
    order by created_at desc limit 1
  ) x on true
  where p.roast_opt_in and not p.banned and not p.is_bot
  order by random() limit 1
$$;

create or replace function public.bot_roast_of_day_exists() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts
    where author_id = public.bot_id() and kind = 'roast' and created_at > now() - interval '20 hours' and deleted_at is null
  )
$$;

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_username ~ '^[A-Za-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(p_username))
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.posts enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.awards enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.rate_limits enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles for select to authenticated using (public.is_member());

drop policy if exists "admins read invites" on public.invites;
create policy "admins read invites" on public.invites for select to authenticated using (public.is_admin());

drop policy if exists "admins read redemptions" on public.invite_redemptions;
create policy "admins read redemptions" on public.invite_redemptions for select to authenticated using (public.is_admin());

drop policy if exists "members read visible channels" on public.channels;
create policy "members read visible channels" on public.channels for select to authenticated
  using (public.can_see_channel(id));

drop policy if exists "members read channel membership" on public.channel_members;
create policy "members read channel membership" on public.channel_members for select to authenticated
  using (public.can_see_channel(channel_id));

drop policy if exists "members read posts" on public.posts;
create policy "members read posts" on public.posts for select to authenticated
  using (public.is_member() and deleted_at is null);

drop policy if exists "members read poll options" on public.poll_options;
create policy "members read poll options" on public.poll_options for select to authenticated using (public.is_member());

drop policy if exists "members read poll votes" on public.poll_votes;
create policy "members read poll votes" on public.poll_votes for select to authenticated using (public.is_member());

drop policy if exists "members read reactions" on public.reactions;
create policy "members read reactions" on public.reactions for select to authenticated using (public.is_member());

drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments for select to authenticated using (public.is_member());

drop policy if exists "members read comment likes" on public.comment_likes;
create policy "members read comment likes" on public.comment_likes for select to authenticated using (public.is_member());

drop policy if exists "own bookmarks" on public.bookmarks;
create policy "own bookmarks" on public.bookmarks for select to authenticated using (user_id = auth.uid() and public.is_member());

drop policy if exists "members read awards" on public.awards;
create policy "members read awards" on public.awards for select to authenticated using (public.is_member());

drop policy if exists "members read stories" on public.stories;
create policy "members read stories" on public.stories for select to authenticated
  using (public.is_member() and deleted_at is null and expires_at > now()
         and (channel_id is null or public.can_see_channel(channel_id)));

drop policy if exists "story views" on public.story_views;
create policy "story views" on public.story_views for select to authenticated
  using (public.is_member() and (user_id = auth.uid()
    or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())));

drop policy if exists "channel members read messages" on public.messages;
create policy "channel members read messages" on public.messages for select to authenticated
  using (public.is_channel_member(channel_id));

drop policy if exists "channel members read message reactions" on public.message_reactions;
create policy "channel members read message reactions" on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_channel_member(m.channel_id)));

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid() and public.is_member());

drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks for select to authenticated using (blocker_id = auth.uid());

drop policy if exists "reports visible to admins and reporter" on public.reports;
create policy "reports visible to admins and reporter" on public.reports for select to authenticated
  using (public.is_admin() or reporter_id = auth.uid());

drop policy if exists "own ai messages" on public.ai_messages;
create policy "own ai messages" on public.ai_messages for select to authenticated
  using (user_id = auth.uid() and public.is_member());

-- rate_limits: no policies at all (server-only).

-- ---------------------------------------------------------------------------
-- Grants: read-only table access for signed-in users, everything else via RPC.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
revoke select on public.rate_limits from authenticated;
grant all on all tables in schema public to service_role;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

revoke execute on function public.bot_add_comment(uuid, text, uuid) from authenticated;
revoke execute on function public.bot_create_post(text, text, text, text, uuid) from authenticated;
revoke execute on function public.bot_send_message(uuid, text, uuid) from authenticated;
revoke execute on function public.bot_pick_roast_target() from authenticated;
revoke execute on function public.bot_roast_of_day_exists() from authenticated;
revoke execute on function public.check_invite(text) from authenticated;
revoke execute on function public.username_available(text) from authenticated;
revoke execute on function public.notify_user(uuid, uuid, text, uuid, uuid, uuid, uuid, text) from authenticated;
revoke execute on function public.enforce_rate_limit(text, int, int) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (Supabase). Skipped silently where the publication does not exist.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.messages;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.message_reactions;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.posts;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.stories;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Default channels everybody joins.
insert into public.channels (id, name, emoji, description, kind, is_private)
values
  ('00000000-0000-4000-8000-0000000c0001', 'The Boys', '🫡', 'Main group chat. Abandon all hope.', 'group', false),
  ('00000000-0000-4000-8000-0000000c0002', 'War Room', '🗺️', 'Geopolitics takes nobody asked for.', 'group', false),
  ('00000000-0000-4000-8000-0000000c0003', 'Meme Dump', '🗑️', 'Post it here before it reaches the feed.', 'group', false)
on conflict (id) do nothing;
