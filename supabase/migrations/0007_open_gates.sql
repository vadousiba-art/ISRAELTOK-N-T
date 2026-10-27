-- ============================================================================
-- YORU — Open Gates (release 1). docs/open-gates.md
--
--   Open Horizons   language preference, interests, discovery, profile
--                   identity (banner style, avatar frame, achievement
--                   showcase), saved themes (Theme Forge+), Collections+
--   Open Experience Ghost Mode, discoverability, Creator Showcase
--                   (applications + admin review), report categories and
--                   automatic escalation
--   Open Access     entitlement records for YORU Pro (no payment provider is
--                   connected; admins can grant complimentary Pro), Night Pass
--                   streak shield
--
-- Additive and backward-compatible:
--   * new columns all have defaults; no existing row changes meaning
--   * new tables have RLS on, no INSERT/UPDATE/DELETE for app roles; every
--     write goes through a checked function (same model as 0001)
--   * existing functions redefined here keep their signature and behaviour,
--     plus the new checks (profile_lite, touch_presence, daily_checkin,
--     get_members); create_report gains an optional category
--   * open_gates_version() lets the app show the new features only once this
--     migration exists, so the app can be deployed before or after it
-- Safe to run more than once.
-- ============================================================================

create or replace function public.open_gates_version() returns int
language sql immutable as $$ select 1 $$;

-- ---------------------------------------------------------------------------
-- Profile identity
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists locale text;
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists ghost_mode boolean not null default false;
alter table public.profiles add column if not exists discoverable boolean not null default true;
alter table public.profiles add column if not exists banner_style text not null default 'aurora';
alter table public.profiles add column if not exists avatar_frame text not null default 'none';
alter table public.profiles add column if not exists showcase_badges text[] not null default '{}';
alter table public.profiles add column if not exists creator_category text;
alter table public.profiles add column if not exists creator_since timestamptz;
alter table public.profiles add column if not exists streak_shield_on date;

do $$ begin
  alter table public.profiles add constraint profiles_locale_check
    check (locale is null or locale in ('en','ja','fr','es','pt','de','ko','zh-Hans','zh-Hant','id','th','vi','it','nl','ru','ar'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_banner_style_check
    check (banner_style in ('aurora','ink','minimal','sakura_night','crimson_moon','manga_panel'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_avatar_frame_check
    check (avatar_frame in ('none','ring','neon','hanko'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_interests_check check (cardinality(interests) <= 8);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_showcase_check check (cardinality(showcase_badges) <= 3);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_creator_category_check
    check (creator_category is null or creator_category in ('artist','writer','cosplayer','musician','video','streamer','developer'));
exception when duplicate_object then null; end $$;

create index if not exists profiles_interests_idx on public.profiles using gin (interests);
create index if not exists profiles_creator_idx on public.profiles (creator_category) where creator_category is not null;

create or replace function public.interest_keys() returns text[]
language sql immutable as $$
  select array['anime','manga','gaming','vocaloid','jpop','jrock','art','cosplay','music','writing',
               'film','tech','memes','fashion','food','travel','vtubers','figures']
$$;

-- ---------------------------------------------------------------------------
-- Entitlements (YORU Pro). Payment providers are NOT connected: rows are only
-- created by admins (source 'comp'). A future verified webhook would write
-- source 'stripe'/'paddle'/... with a unique external_id (idempotent).
-- ---------------------------------------------------------------------------

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan text not null default 'pro' check (plan in ('pro')),
  source text not null check (source in ('comp','stripe','paddle','paypal','lemonsqueezy')),
  status text not null default 'active' check (status in ('active','canceled','expired')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  external_id text unique,
  note text not null default '' check (char_length(note) <= 200),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists entitlements_user_idx on public.entitlements (user_id, status);

-- Payment provider events, stored once per provider event id (replays are
-- ignored). Unused until a provider is connected.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

create or replace function public.is_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user and e.plan = 'pro' and e.status = 'active'
      and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
  )
$$;

-- ---------------------------------------------------------------------------
-- Collections+ (named, organised saves; bookmarks keep working as before)
-- ---------------------------------------------------------------------------

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  description text not null default '' check (char_length(description) <= 200),
  emoji text not null default '📁' check (char_length(emoji) <= 8),
  visibility text not null default 'private' check (visibility in ('private','members')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists collections_owner_idx on public.collections (owner_id, updated_at desc);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, post_id)
);
create index if not exists collection_items_post_idx on public.collection_items (post_id);

-- ---------------------------------------------------------------------------
-- Theme Forge+ (saved looks; free 3, Pro 12)
-- ---------------------------------------------------------------------------

create table if not exists public.saved_themes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  accent_hue int not null check (accent_hue between 0 and 359),
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  ambience text not null default 'off' check (ambience in ('off','stars','sakura','rain','fireflies')),
  created_at timestamptz not null default now()
);
create index if not exists saved_themes_owner_idx on public.saved_themes (owner_id, created_at);

-- ---------------------------------------------------------------------------
-- Creator Showcase
-- ---------------------------------------------------------------------------

create table if not exists public.creator_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('artist','writer','cosplayer','musician','video','streamer','developer')),
  portfolio_url text not null check (portfolio_url ~ '^https?://' and char_length(portfolio_url) <= 300),
  statement text not null check (char_length(btrim(statement)) between 20 and 600),
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn','revoked')),
  review_note text not null default '' check (char_length(review_note) <= 300),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists creator_applications_queue_idx on public.creator_applications (status, created_at);
create unique index if not exists creator_applications_one_pending on public.creator_applications (user_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Reports: category and escalation
-- ---------------------------------------------------------------------------

alter table public.reports add column if not exists category text not null default 'other';
alter table public.reports add column if not exists escalated boolean not null default false;
do $$ begin
  alter table public.reports add constraint reports_category_check
    check (category in ('harassment','hate','privacy','spam','explicit','impersonation','self_harm','other'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Row-level security for the new tables (reads only; writes via functions)
-- ---------------------------------------------------------------------------

alter table public.entitlements enable row level security;
alter table public.payment_events enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.saved_themes enable row level security;
alter table public.creator_applications enable row level security;

drop policy if exists "own entitlements" on public.entitlements;
create policy "own entitlements" on public.entitlements for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "visible collections" on public.collections;
create policy "visible collections" on public.collections for select to authenticated
  using (owner_id = auth.uid() or (visibility = 'members' and public.is_member() and not public.is_hidden_author(owner_id)));

drop policy if exists "visible collection items" on public.collection_items;
create policy "visible collection items" on public.collection_items for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id
                 and (c.owner_id = auth.uid() or (c.visibility = 'members' and public.is_member()))));

drop policy if exists "own themes" on public.saved_themes;
create policy "own themes" on public.saved_themes for select to authenticated using (owner_id = auth.uid());

drop policy if exists "own or admin creator applications" on public.creator_applications;
create policy "own or admin creator applications" on public.creator_applications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- payment_events: no policy at all (server only).

revoke all on public.entitlements, public.payment_events, public.collections, public.collection_items,
  public.saved_themes, public.creator_applications from anon, authenticated;
grant select on public.entitlements, public.collections, public.collection_items,
  public.saved_themes, public.creator_applications to authenticated;
grant all on public.entitlements, public.payment_events, public.collections, public.collection_items,
  public.saved_themes, public.creator_applications to service_role;

-- ---------------------------------------------------------------------------
-- Ghost Mode, enforced where the data is written: while it is on, YORU does
-- not record when you were last active, so nothing can show it (not other
-- members, not direct table reads, not the admin member list).
-- ---------------------------------------------------------------------------

create or replace function public.touch_presence() returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  update public.profiles set last_seen_at = case when ghost_mode then null else now() end where id = v;
end $$;

create or replace function public.profile_lite(p public.profiles) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'badge', p.badge, 'verified', p.verified,
    'is_bot', p.is_bot, 'role', p.role, 'status', p.status,
    'online', p.is_bot or (not p.ghost_mode and coalesce(p.last_seen_at > now() - interval '5 minutes', false)),
    'level', public.level_for(p.xp), 'accent_hue', p.accent_hue, 'flair', p.flair,
    'creator', p.creator_category, 'frame', p.avatar_frame
  )
$$;

create or replace function public.get_members() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(public.profile_lite(p)
             order by p.is_bot, case when p.ghost_mode then null else p.last_seen_at end desc nulls last, p.display_name)
    from public.profiles p where not p.banned and not public.is_hidden_author(p.id)
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Identity: read and update
-- ---------------------------------------------------------------------------

create or replace function public.get_my_identity() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  me public.profiles;
  pro boolean := public.is_pro(v);
begin
  select * into me from public.profiles where id = v;
  return jsonb_build_object(
    'locale', me.locale, 'interests', to_jsonb(me.interests),
    'ghost_mode', me.ghost_mode, 'discoverable', me.discoverable,
    'banner_style', me.banner_style, 'avatar_frame', me.avatar_frame,
    'showcase_badges', to_jsonb(me.showcase_badges),
    'creator_category', me.creator_category,
    'pro', pro,
    'pro_until', (select max(coalesce(ends_at, 'infinity'::timestamptz)) from public.entitlements
                  where user_id = v and status = 'active' and (ends_at is null or ends_at > now())),
    'theme_slots', case when pro then 12 else 3 end,
    'streak_shield_on', me.streak_shield_on
  );
end $$;

create or replace function public.update_my_identity(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  k text;
  pro boolean := public.is_pro(v);
  ints text[];
  show text[];
begin
  perform public.enforce_rate_limit('identity', 60, 3600);
  for k in select jsonb_object_keys(coalesce(p, '{}'::jsonb)) loop
    if k not in ('locale','interests','ghost_mode','discoverable','banner_style','avatar_frame','showcase_badges') then
      raise exception 'INVALID|Unknown profile field: %', k;
    end if;
  end loop;
  if p ? 'interests' then
    if jsonb_typeof(p -> 'interests') <> 'array' then raise exception 'INVALID|Interests must be a list.'; end if;
    select coalesce(array_agg(distinct i), '{}') into ints
    from jsonb_array_elements_text(p -> 'interests') i where i = any (public.interest_keys());
    if cardinality(ints) > 8 then raise exception 'INVALID|Pick up to 8 interests.'; end if;
  end if;
  if p ? 'showcase_badges' then
    if jsonb_typeof(p -> 'showcase_badges') <> 'array' then raise exception 'INVALID|Showcase must be a list.'; end if;
    select coalesce(array_agg(b), '{}') into show
    from (select distinct b from jsonb_array_elements_text(p -> 'showcase_badges') b where b ~ '^[a-z_]{2,30}$' limit 3) x;
  end if;
  if p ->> 'banner_style' in ('sakura_night','crimson_moon','manga_panel') and not pro then
    raise exception 'FORBIDDEN|That banner is part of YORU Pro.' using errcode = '42501';
  end if;
  if p ->> 'avatar_frame' in ('neon','hanko') and not pro then
    raise exception 'FORBIDDEN|That frame is part of YORU Pro.' using errcode = '42501';
  end if;
  update public.profiles set
    locale = case when p ? 'locale' then nullif(p ->> 'locale', '') else locale end,
    interests = coalesce(ints, interests),
    ghost_mode = coalesce((p ->> 'ghost_mode')::boolean, ghost_mode),
    -- turning Ghost Mode on also forgets the last recorded activity time
    last_seen_at = case when (p ->> 'ghost_mode')::boolean then null else last_seen_at end,
    discoverable = coalesce((p ->> 'discoverable')::boolean, discoverable),
    banner_style = coalesce(p ->> 'banner_style', banner_style),
    avatar_frame = coalesce(p ->> 'avatar_frame', avatar_frame),
    showcase_badges = coalesce(show, showcase_badges)
  where id = v;
  return public.get_my_identity();
end $$;

-- Public identity of any member: what their profile page shows.
create or replace function public.get_profile_identity(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  p public.profiles;
begin
  select * into p from public.profiles where lower(username) = lower(p_username);
  if p.id is null or (p.banned and not public.is_admin()) or public.is_hidden_author(p.id) then
    raise exception 'NOT_FOUND|No such member.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'interests', to_jsonb(p.interests), 'banner_style', p.banner_style, 'avatar_frame', p.avatar_frame,
    'showcase_badges', to_jsonb(p.showcase_badges),
    'creator_category', p.creator_category, 'creator_since', p.creator_since,
    'pro', public.is_pro(p.id),
    'ghost_mode', case when p.id = v then p.ghost_mode else null end,
    'collections', coalesce((
      select jsonb_agg(public.collection_json(c, v) order by c.updated_at desc)
      from public.collections c
      where c.owner_id = p.id and (c.owner_id = v or c.visibility = 'members')
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Discovery (Global Community Bridge): people beyond your circle, by shared
-- interests and language. Only members who left "discoverable" on; never
-- banned, blocked or bot accounts. Explains why each person is suggested.
-- ---------------------------------------------------------------------------

create or replace function public.get_discover(
  p_interest text default null, p_locale text default null, p_creators_only boolean default false,
  p_limit int default 24, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  mine text[];
  my_locale text;
begin
  select interests, locale into mine, my_locale from public.profiles where id = v;
  return coalesce((
    select jsonb_agg(x.j order by x.shared desc, x.recent desc nulls last, x.name)
    from (
      select public.profile_lite(p) || jsonb_build_object(
               'interests', to_jsonb(p.interests), 'locale', p.locale, 'bio', left(p.bio, 140),
               'shared', to_jsonb(array(select unnest(p.interests) intersect select unnest(mine))),
               'same_language', p.locale is not null and p.locale = my_locale
             ) as j,
             cardinality(array(select unnest(p.interests) intersect select unnest(mine))) as shared,
             case when p.ghost_mode then null else p.last_seen_at end as recent,
             p.display_name as name
      from public.profiles p
      where p.id <> v and p.discoverable and not p.banned and not p.is_bot
        and not public.is_hidden_author(p.id)
        and (p_interest is null or p_interest = any (p.interests))
        and (p_locale is null or p.locale = p_locale)
        and (not coalesce(p_creators_only, false) or p.creator_category is not null)
      order by shared desc, recent desc nulls last, p.display_name
      limit least(greatest(coalesce(p_limit, 24), 1), 50)
      offset least(greatest(coalesce(p_offset, 0), 0), 2000)
    ) x
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Collections+ functions
-- ---------------------------------------------------------------------------

create or replace function public.collection_json(c public.collections, v uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'description', c.description, 'emoji', c.emoji,
    'visibility', c.visibility, 'created_at', c.created_at, 'updated_at', c.updated_at,
    'is_mine', c.owner_id = v,
    'owner', (select public.profile_lite(o) from public.profiles o where o.id = c.owner_id),
    'count', (select count(*) from public.collection_items i join public.posts p on p.id = i.post_id
              where i.collection_id = c.id and p.deleted_at is null),
    'cover', (select p.media_url from public.collection_items i join public.posts p on p.id = i.post_id
              where i.collection_id = c.id and p.deleted_at is null and p.media_url is not null
                and p.media_type in ('image','gif') and not public.is_hidden_author(p.author_id)
              order by i.added_at desc limit 1)
  )
$$;

create or replace function public.get_my_collections(p_post_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(public.collection_json(c, v) || jsonb_build_object(
             'has_post', p_post_id is not null and exists (
               select 1 from public.collection_items i where i.collection_id = c.id and i.post_id = p_post_id))
           order by c.updated_at desc)
    from public.collections c where c.owner_id = v
  ), '[]'::jsonb);
end $$;

create or replace function public.get_collection(p_id uuid, p_before timestamptz default null, p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  c public.collections;
begin
  select * into c from public.collections where id = p_id;
  if c.id is null or not (c.owner_id = v or (c.visibility = 'members' and not public.is_hidden_author(c.owner_id))) then
    raise exception 'NOT_FOUND|That collection is private or gone.' using errcode = 'P0002';
  end if;
  return public.collection_json(c, v) || jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(public.post_json(p, v) || jsonb_build_object('added_at', x.added_at) order by x.added_at desc)
      from (
        select i.added_at, i.post_id from public.collection_items i join public.posts p on p.id = i.post_id
        where i.collection_id = c.id and p.deleted_at is null and not public.is_hidden_author(p.author_id)
          and (p_before is null or i.added_at < p_before)
        order by i.added_at desc limit least(greatest(coalesce(p_limit, 20), 1), 50)
      ) x join public.posts p on p.id = x.post_id
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.save_collection(
  p_id uuid default null, p_name text default null, p_description text default null,
  p_emoji text default null, p_visibility text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  c public.collections;
begin
  perform public.enforce_rate_limit('collections', 60, 3600);
  if p_id is null then
    if (select count(*) from public.collections where owner_id = v) >= 50 then
      raise exception 'INVALID|You can have up to 50 collections.';
    end if;
    insert into public.collections (owner_id, name, description, emoji, visibility)
    values (v, btrim(coalesce(p_name, '')), coalesce(p_description, ''), coalesce(nullif(p_emoji, ''), '📁'),
            coalesce(p_visibility, 'private'))
    returning * into c;
  else
    update public.collections set
      name = coalesce(btrim(p_name), name),
      description = coalesce(p_description, description),
      emoji = coalesce(nullif(p_emoji, ''), emoji),
      visibility = coalesce(p_visibility, visibility),
      updated_at = now()
    where id = p_id and owner_id = v
    returning * into c;
    if c.id is null then raise exception 'NOT_FOUND|That collection is not yours.' using errcode = 'P0002'; end if;
  end if;
  return public.collection_json(c, v);
end $$;

create or replace function public.delete_collection(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  delete from public.collections where id = p_id and owner_id = v;
  if not found then raise exception 'NOT_FOUND|That collection is not yours.' using errcode = 'P0002'; end if;
end $$;

-- Adds or removes a post (idempotent: repeating the same action changes nothing).
create or replace function public.set_collection_item(p_collection_id uuid, p_post_id uuid, p_in boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  perform public.enforce_rate_limit('collection_items', 300, 3600);
  if not exists (select 1 from public.collections where id = p_collection_id and owner_id = v) then
    raise exception 'NOT_FOUND|That collection is not yours.' using errcode = 'P0002';
  end if;
  if p_in then
    if not exists (select 1 from public.posts where id = p_post_id and deleted_at is null and not public.is_hidden_author(author_id)) then
      raise exception 'NOT_FOUND|That post is gone.' using errcode = 'P0002';
    end if;
    if (select count(*) from public.collection_items where collection_id = p_collection_id) >= 500 then
      raise exception 'INVALID|A collection holds up to 500 posts.';
    end if;
    insert into public.collection_items (collection_id, post_id) values (p_collection_id, p_post_id) on conflict do nothing;
  else
    delete from public.collection_items where collection_id = p_collection_id and post_id = p_post_id;
  end if;
  update public.collections set updated_at = now() where id = p_collection_id;
  return jsonb_build_object('in', p_in);
end $$;

-- ---------------------------------------------------------------------------
-- Theme Forge+ functions
-- ---------------------------------------------------------------------------

create or replace function public.get_my_themes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'accent_hue', t.accent_hue,
                                        'theme', t.theme, 'ambience', t.ambience, 'created_at', t.created_at)
                     order by t.created_at)
    from public.saved_themes t where t.owner_id = v
  ), '[]'::jsonb);
end $$;

create or replace function public.save_theme(p_name text, p_accent_hue int, p_theme text default 'dark', p_ambience text default 'off') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  slots int := case when public.is_pro(v) then 12 else 3 end;
begin
  perform public.enforce_rate_limit('themes', 60, 3600);
  if (select count(*) from public.saved_themes where owner_id = v) >= slots then
    raise exception 'INVALID|All % theme slots are used. Delete one first.', slots;
  end if;
  insert into public.saved_themes (owner_id, name, accent_hue, theme, ambience)
  values (v, btrim(coalesce(p_name, '')), p_accent_hue, coalesce(p_theme, 'dark'), coalesce(p_ambience, 'off'));
  return public.get_my_themes();
end $$;

create or replace function public.delete_theme(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  delete from public.saved_themes where id = p_id and owner_id = v;
  return public.get_my_themes();
end $$;

-- ---------------------------------------------------------------------------
-- Creator Showcase functions
-- ---------------------------------------------------------------------------

create or replace function public.creator_application_json(a public.creator_applications) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', a.id, 'category', a.category, 'portfolio_url', a.portfolio_url,
    'statement', a.statement, 'status', a.status, 'review_note', a.review_note,
    'reviewed_at', a.reviewed_at, 'created_at', a.created_at)
$$;

create or replace function public.get_my_creator_application() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  a public.creator_applications;
begin
  select * into a from public.creator_applications where user_id = v order by created_at desc limit 1;
  return jsonb_build_object(
    'creator_category', (select creator_category from public.profiles where id = v),
    'application', case when a.id is null then null else public.creator_application_json(a) end
  );
end $$;

create or replace function public.apply_creator(p_category text, p_portfolio_url text, p_statement text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  perform public.enforce_rate_limit('creator_apply', 3, 86400);
  if (select creator_category from public.profiles where id = v) is not null then
    raise exception 'INVALID|You are already an approved creator.';
  end if;
  if exists (select 1 from public.creator_applications where user_id = v and status = 'pending') then
    raise exception 'INVALID|Your application is already waiting for review.';
  end if;
  insert into public.creator_applications (user_id, category, portfolio_url, statement)
  values (v, p_category, btrim(p_portfolio_url), btrim(p_statement));
  return public.get_my_creator_application();
end $$;

create or replace function public.withdraw_creator_application() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  update public.creator_applications set status = 'withdrawn' where user_id = v and status = 'pending';
  return public.get_my_creator_application();
end $$;

create or replace function public.admin_creator_queue(p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
begin
  return coalesce((
    select jsonb_agg(public.creator_application_json(a) || jsonb_build_object(
             'applicant', public.profile_lite(p),
             'previous', (select count(*) from public.creator_applications x where x.user_id = a.user_id and x.id <> a.id))
           order by a.created_at)
    from public.creator_applications a join public.profiles p on p.id = a.user_id
    where a.status = coalesce(p_status, 'pending')
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_review_creator(p_application_id uuid, p_approve boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
  a public.creator_applications;
begin
  select * into a from public.creator_applications where id = p_application_id for update;
  if a.id is null or a.status <> 'pending' then
    raise exception 'INVALID|That application is not waiting for review.';
  end if;
  update public.creator_applications set
    status = case when p_approve then 'approved' else 'rejected' end,
    review_note = left(coalesce(p_note, ''), 300), reviewed_by = v, reviewed_at = now()
  where id = a.id;
  if p_approve then
    update public.profiles set creator_category = a.category, creator_since = now() where id = a.user_id;
  end if;
  perform public.notify_user(a.user_id, null, 'system', null, null, null, null,
    case when p_approve then 'Your creator application was approved. Welcome to the Creator Showcase.'
         else 'Your creator application was not approved this time.' ||
              case when coalesce(p_note, '') <> '' then ' Note: ' || left(p_note, 120) else '' end end);
  perform public.audit(case when p_approve then 'creator.approve' else 'creator.reject' end, a.user_id, a.id::text,
    jsonb_build_object('category', a.category));
end $$;

create or replace function public.admin_revoke_creator(p_user uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
begin
  update public.profiles set creator_category = null, creator_since = null where id = p_user;
  update public.creator_applications set status = 'revoked', review_note = left(coalesce(p_note, ''), 300),
    reviewed_by = v, reviewed_at = now()
  where user_id = p_user and status = 'approved';
  perform public.audit('creator.revoke', p_user, null, jsonb_build_object('note', left(coalesce(p_note, ''), 120)));
end $$;

-- ---------------------------------------------------------------------------
-- YORU Pro administration (complimentary grants; no payments)
-- ---------------------------------------------------------------------------

create or replace function public.admin_grant_pro(p_user uuid, p_days int default 30, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
begin
  if p_days is null or p_days not between 1 and 366 then
    raise exception 'INVALID|Grant between 1 and 366 days.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and not is_bot) then
    raise exception 'NOT_FOUND|No such member.' using errcode = 'P0002';
  end if;
  insert into public.entitlements (user_id, plan, source, status, starts_at, ends_at, note, granted_by)
  values (p_user, 'pro', 'comp', 'active', now(), now() + make_interval(days => p_days), left(coalesce(p_note, ''), 200), v);
  perform public.audit('pro.grant', p_user, null, jsonb_build_object('days', p_days));
end $$;

create or replace function public.admin_revoke_pro(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
begin
  update public.entitlements set status = 'canceled', updated_at = now()
  where user_id = p_user and status = 'active' and source = 'comp';
  perform public.audit('pro.revoke', p_user, null, '{}'::jsonb);
end $$;

create or replace function public.admin_pro_members() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('user', public.profile_lite(p), 'source', e.source, 'ends_at', e.ends_at,
                                        'note', e.note, 'created_at', e.created_at) order by e.created_at desc)
    from public.entitlements e join public.profiles p on p.id = e.user_id
    where e.status = 'active' and (e.ends_at is null or e.ends_at > now())
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Night Pass: streak shield. A Pro member who misses exactly one night keeps
-- their streak, at most once every 7 days. Server-side only.
-- ---------------------------------------------------------------------------

create or replace function public.daily_checkin(p_offset_minutes int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  me public.profiles;
  today date := (now() + make_interval(mins => least(greatest(coalesce(p_offset_minutes, 0), -840), 840)))::date;
  new_streak int;
  gained int;
  before_level int;
  new_xp int;
  shielded boolean := false;
begin
  select * into me from public.profiles where id = v for update;
  if me.last_checkin is not null and me.last_checkin >= today then
    return jsonb_build_object('already', true, 'streak', me.streak, 'xp', me.xp, 'level', public.level_for(me.xp), 'gained', 0);
  end if;
  if me.last_checkin = today - 1 then
    new_streak := me.streak + 1;
  elsif me.last_checkin = today - 2 and me.streak > 0 and public.is_pro(v)
        and (me.streak_shield_on is null or me.streak_shield_on <= today - 7) then
    new_streak := me.streak + 1;
    shielded := true;
  else
    new_streak := 1;
  end if;
  gained := 20 + least(new_streak - 1, 7) * 5;
  before_level := public.level_for(me.xp);
  update public.profiles
  set streak = new_streak, best_streak = greatest(best_streak, new_streak), last_checkin = today,
      streak_shield_on = case when shielded then today else streak_shield_on end
  where id = v;
  new_xp := public.add_xp(v, gained);
  return jsonb_build_object(
    'already', false, 'streak', new_streak, 'gained', gained, 'xp', new_xp,
    'level', public.level_for(new_xp), 'leveled_up', public.level_for(new_xp) > before_level,
    'shielded', shielded
  );
end $$;

-- ---------------------------------------------------------------------------
-- Reports: category + automatic escalation. Escalation only *flags* for
-- faster human review when three or more different members report the same
-- thing; it never removes content or punishes anyone by itself.
-- ---------------------------------------------------------------------------

drop function if exists public.create_report(text, uuid, text);
create or replace function public.create_report(p_target_type text, p_target_id uuid, p_reason text, p_category text default 'other') returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  reporters int;
begin
  perform public.enforce_rate_limit('report', 20, 86400);
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'INVALID|Tell the mods what happened.';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, category)
  values (v, p_target_type, p_target_id, left(trim(p_reason), 500), coalesce(p_category, 'other'));
  select count(distinct reporter_id) into reporters from public.reports
  where target_type = p_target_type and target_id = p_target_id and status = 'open';
  if reporters >= 3 or p_category = 'self_harm' then
    update public.reports set escalated = true
    where target_type = p_target_type and target_id = p_target_id and status = 'open';
  end if;
end $$;

create or replace function public.admin_report_flags() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
begin
  return coalesce((
    select jsonb_object_agg(r.id, jsonb_build_object(
      'category', r.category, 'escalated', r.escalated,
      'same_target', (select count(distinct x.reporter_id) from public.reports x
                      where x.target_type = r.target_type and x.target_id = r.target_id)))
    from public.reports r
  ), '{}'::jsonb);
end $$;

create or replace function public.admin_escalate_report(p_report_id uuid, p_escalated boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
begin
  update public.reports set escalated = p_escalated where id = p_report_id;
  perform public.audit(case when p_escalated then 'report.escalate' else 'report.deescalate' end, null, p_report_id::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.is_pro(uuid) from public, anon;
revoke execute on function public.collection_json(public.collections, uuid) from public, anon;
revoke execute on function public.creator_application_json(public.creator_applications) from public, anon;
revoke execute on function public.open_gates_version() from public, anon;
revoke execute on function public.interest_keys() from public, anon;
grant execute on function public.open_gates_version() to authenticated, service_role;
grant execute on function public.interest_keys() to authenticated, service_role;
grant execute on function public.is_pro(uuid) to authenticated, service_role;
grant execute on function public.collection_json(public.collections, uuid) to authenticated, service_role;
grant execute on function public.creator_application_json(public.creator_applications) to authenticated, service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'get_my_identity()', 'update_my_identity(jsonb)', 'get_profile_identity(text)',
    'get_discover(text, text, boolean, int, int)',
    'get_my_collections(uuid)', 'get_collection(uuid, timestamptz, int)',
    'save_collection(uuid, text, text, text, text)', 'delete_collection(uuid)',
    'set_collection_item(uuid, uuid, boolean)',
    'get_my_themes()', 'save_theme(text, int, text, text)', 'delete_theme(uuid)',
    'get_my_creator_application()', 'apply_creator(text, text, text)', 'withdraw_creator_application()',
    'admin_creator_queue(text)', 'admin_review_creator(uuid, boolean, text)', 'admin_revoke_creator(uuid, text)',
    'admin_grant_pro(uuid, int, text)', 'admin_revoke_pro(uuid)', 'admin_pro_members()',
    'create_report(text, uuid, text, text)', 'admin_report_flags()', 'admin_escalate_report(uuid, boolean)',
    'daily_checkin(int)', 'touch_presence()', 'get_members()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
