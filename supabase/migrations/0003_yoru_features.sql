-- ============================================================================
-- YORU features: night streaks + XP levels, personal color, pinned posts,
-- featured posts, site controls (announcement, quiet mode, slow mode, word
-- filter, nightly prompt), member mutes and flair, admin analytics, audit log.
--
-- Additive and backward-compatible:
--   * only new tables, new nullable/defaulted columns, new functions/triggers
--   * no existing rows are rewritten; XP starts at 0 for everyone (admins can
--     optionally rebuild it from history with admin_recalculate_xp)
--   * RLS on every new table; writes only through checked RPCs
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists xp int not null default 0;
alter table public.profiles add column if not exists streak int not null default 0;
alter table public.profiles add column if not exists best_streak int not null default 0;
alter table public.profiles add column if not exists last_checkin date;
-- Personal color: the hue (0-359) every accent in the app is generated from.
-- 351 is YORU red (#F20D2F).
alter table public.profiles add column if not exists accent_hue int not null default 351;
alter table public.profiles add column if not exists currently_kind text;
alter table public.profiles add column if not exists currently_title text;
alter table public.profiles add column if not exists flair text not null default '';
alter table public.profiles add column if not exists muted_until timestamptz;
alter table public.profiles add column if not exists pinned_post_id uuid references public.posts (id) on delete set null;

do $$ begin
  alter table public.profiles add constraint profiles_accent_hue_check check (accent_hue between 0 and 359);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_currently_check
    check ((currently_kind is null or currently_kind in ('watching', 'reading', 'listening', 'playing'))
       and (currently_title is null or char_length(currently_title) <= 60));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_flair_check check (char_length(flair) <= 24);
exception when duplicate_object then null; end $$;

alter table public.posts add column if not exists featured_at timestamptz;
create index if not exists posts_featured_idx on public.posts (featured_at desc) where featured_at is not null;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  key text primary key check (key in ('announcement', 'lockdown', 'slow_mode', 'word_filter', 'nightly_prompt')),
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) <= 40),
  target_user_id uuid references public.profiles (id) on delete set null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "admins read settings" on public.app_settings;
create policy "admins read settings" on public.app_settings for select to authenticated using (public.is_admin());
drop policy if exists "admins read audit log" on public.audit_log;
create policy "admins read audit log" on public.audit_log for select to authenticated using (public.is_admin());

revoke all on public.app_settings, public.audit_log from anon, authenticated;
grant select on public.app_settings, public.audit_log to authenticated;
grant all on public.app_settings, public.audit_log to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Level curve: L1 at 0 XP, L2 at 40, L3 at 160, L4 at 360, L5 at 640 ...
create or replace function public.level_for(p_xp int) returns int
language sql immutable as $$
  select floor(sqrt(greatest(coalesce(p_xp, 0), 0) / 40.0))::int + 1
$$;

create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key
$$;

create or replace function public.audit(p_action text, p_target_user uuid, p_target_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, target_user_id, target_id, details)
  values (auth.uid(), p_action, p_target_user, p_target_id, coalesce(p_details, '{}'::jsonb))
$$;

-- Adds XP (never below 0) and sends a level-up notification when it crosses
-- a level boundary. Bots do not level.
create or replace function public.add_xp(p_user uuid, p_amount int) returns int
language plpgsql security definer set search_path = public as $$
declare
  old_xp int;
  new_xp int;
begin
  if p_user is null or coalesce(p_amount, 0) = 0 then
    return null;
  end if;
  select xp into old_xp from public.profiles where id = p_user and not is_bot for update;
  if not found then
    return null;
  end if;
  new_xp := greatest(old_xp + p_amount, 0);
  update public.profiles set xp = new_xp where id = p_user;
  if public.level_for(new_xp) > public.level_for(old_xp) then
    perform public.notify_user(p_user, null, 'level_up', null, null, null, null, public.level_for(new_xp)::text);
  end if;
  return new_xp;
end $$;

-- profile_lite gains level, accent hue and flair so they show next to names
-- everywhere (posts, comments, chat, leaderboards).
create or replace function public.profile_lite(p public.profiles) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'badge', p.badge, 'verified', p.verified,
    'is_bot', p.is_bot, 'role', p.role, 'status', p.status,
    'online', p.is_bot or coalesce(p.last_seen_at > now() - interval '5 minutes', false),
    'level', public.level_for(p.xp), 'accent_hue', p.accent_hue, 'flair', p.flair
  )
$$;

-- ---------------------------------------------------------------------------
-- XP from activity
-- ---------------------------------------------------------------------------

create or replace function public.xp_on_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'repost' then
    perform public.add_xp(new.author_id, 10);
  end if;
  return null;
end $$;
drop trigger if exists posts_xp on public.posts;
create trigger posts_xp after insert on public.posts for each row execute function public.xp_on_post();

create or replace function public.xp_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.is_ai then
    perform public.add_xp(new.author_id, 4);
  end if;
  return null;
end $$;
drop trigger if exists comments_xp on public.comments;
create trigger comments_xp after insert on public.comments for each row execute function public.xp_on_comment();

-- Reactions received: +2, taken back when the reaction is removed (no farming).
create or replace function public.xp_on_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  author uuid;
  rec record;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;
  select author_id into author from public.posts where id = rec.post_id;
  if author is not null and author <> rec.user_id then
    perform public.add_xp(author, case when tg_op = 'DELETE' then -2 else 2 end);
  end if;
  return null;
end $$;
drop trigger if exists reactions_xp on public.reactions;
create trigger reactions_xp after insert or delete on public.reactions for each row execute function public.xp_on_reaction();

create or replace function public.xp_on_award() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  author uuid;
begin
  select author_id into author from public.posts where id = new.post_id;
  if author is not null and author <> new.giver_id then
    perform public.add_xp(author, 15);
  end if;
  return null;
end $$;
drop trigger if exists awards_xp on public.awards;
create trigger awards_xp after insert on public.awards for each row execute function public.xp_on_award();

-- ---------------------------------------------------------------------------
-- Site rules: mutes, quiet mode, slow mode, word filter.
-- Server-side writes (bot, seeds, auth.uid() is null) are exempt.
-- Named "00_" so it runs before the hashtag/mention extraction trigger.
-- ---------------------------------------------------------------------------

create or replace function public.apply_word_filter(p_body text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  w text;
  out text := p_body;
begin
  if p_body is null or p_body = '' then
    return p_body;
  end if;
  for w in select jsonb_array_elements_text(coalesce(public.setting('word_filter'), '[]'::jsonb)) loop
    out := regexp_replace(out, '\m' || w || '\M', repeat('✱', char_length(w)), 'gi');
  end loop;
  return out;
end $$;

create or replace function public.enforce_site_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pr public.profiles;
  privileged boolean;
  slow int;
begin
  if auth.uid() is null then
    return new;
  end if;
  select * into pr from public.profiles where id = new.author_id;
  if pr.id is null or pr.is_bot then
    return new;
  end if;
  privileged := pr.role in ('owner', 'admin');
  if not privileged and pr.muted_until is not null and pr.muted_until > now() then
    raise exception 'MUTED|You are muted for a little while. Take a breather.' using errcode = 'P0001';
  end if;
  if not privileged and tg_table_name in ('posts', 'comments')
     and coalesce((public.setting('lockdown'))::text, 'false') = 'true' then
    raise exception 'LOCKDOWN|YORU is in quiet mode right now. Only admins can post. Chat is still open.' using errcode = 'P0001';
  end if;
  -- Nested IF: comments and messages have no "kind" column.
  if not privileged and tg_table_name = 'posts' then
    if (to_jsonb(new) ->> 'kind') <> 'repost' then
      slow := coalesce((public.setting('slow_mode'))::text::int, 0);
      if slow > 0 and exists (
        select 1 from public.posts
        where author_id = new.author_id and kind <> 'repost' and deleted_at is null
          and created_at > now() - make_interval(secs => slow)
      ) then
        raise exception 'SLOW_MODE|Slow mode is on: one post every % seconds.', slow using errcode = 'P0001';
      end if;
    end if;
  end if;
  new.body := public.apply_word_filter(new.body);
  return new;
end $$;

drop trigger if exists posts_00_site_rules on public.posts;
create trigger posts_00_site_rules before insert on public.posts for each row execute function public.enforce_site_rules();
drop trigger if exists comments_00_site_rules on public.comments;
create trigger comments_00_site_rules before insert on public.comments for each row execute function public.enforce_site_rules();
drop trigger if exists messages_00_site_rules on public.messages;
create trigger messages_00_site_rules before insert on public.messages for each row execute function public.enforce_site_rules();

-- ---------------------------------------------------------------------------
-- Audit triggers for existing admin actions (role, ban, verify, invites,
-- reports, admin deletions). Only actions taken by a signed-in user on
-- someone else are recorded.
-- ---------------------------------------------------------------------------

create or replace function public.audit_profiles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() = new.id then
    return null;
  end if;
  if new.role is distinct from old.role then
    perform public.audit('member.role', new.id, null, jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.banned is distinct from old.banned then
    perform public.audit(case when new.banned then 'member.ban' else 'member.unban' end, new.id, null, '{}'::jsonb);
  end if;
  if new.verified is distinct from old.verified then
    perform public.audit(case when new.verified then 'member.verify' else 'member.unverify' end, new.id, null, '{}'::jsonb);
  end if;
  if new.muted_until is distinct from old.muted_until then
    perform public.audit(case when new.muted_until is null or new.muted_until <= now() then 'member.unmute' else 'member.mute' end,
      new.id, null, jsonb_build_object('until', new.muted_until));
  end if;
  if new.flair is distinct from old.flair then
    perform public.audit('member.flair', new.id, null, jsonb_build_object('flair', new.flair));
  end if;
  return null;
end $$;
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after update on public.profiles for each row execute function public.audit_profiles();

create or replace function public.audit_invites() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.audit('invite.create', null, new.code, jsonb_build_object('max_uses', new.max_uses, 'note', new.note));
  elsif new.revoked and not old.revoked then
    perform public.audit('invite.revoke', null, new.code, '{}'::jsonb);
  end if;
  return null;
end $$;
drop trigger if exists invites_audit on public.invites;
create trigger invites_audit after insert or update on public.invites for each row execute function public.audit_invites();

create or replace function public.audit_reports() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.status = 'open' and new.status <> 'open' then
    perform public.audit('report.' || coalesce(new.action, new.status), null, new.id::text,
      jsonb_build_object('target_type', new.target_type, 'reason', left(new.reason, 120)));
  end if;
  return null;
end $$;
drop trigger if exists reports_audit on public.reports;
create trigger reports_audit after update on public.reports for each row execute function public.audit_reports();

create or replace function public.audit_posts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if new.featured_at is distinct from old.featured_at then
    perform public.audit(case when new.featured_at is null then 'post.unfeature' else 'post.feature' end,
      new.author_id, new.id::text, jsonb_build_object('body', left(new.body, 120)));
  end if;
  if new.deleted_at is not null and old.deleted_at is null and auth.uid() <> new.author_id then
    perform public.audit('post.delete', new.author_id, new.id::text, jsonb_build_object('body', left(new.body, 120)));
  end if;
  return null;
end $$;
drop trigger if exists posts_audit on public.posts;
create trigger posts_audit after update on public.posts for each row execute function public.audit_posts();

-- ---------------------------------------------------------------------------
-- Member RPCs
-- ---------------------------------------------------------------------------

-- Public site state for every member (the word list stays admin-only).
create or replace function public.get_site() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_member();
  return jsonb_build_object(
    'announcement', public.setting('announcement'),
    'lockdown', coalesce((public.setting('lockdown'))::text, 'false') = 'true',
    'slow_mode', coalesce((public.setting('slow_mode'))::text::int, 0),
    'nightly_prompt', public.setting('nightly_prompt') #>> '{}'
  );
end $$;

create or replace function public.get_my_progress(p_offset_minutes int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  me public.profiles;
  today date := (now() + make_interval(mins => least(greatest(coalesce(p_offset_minutes, 0), -840), 840)))::date;
  lvl int;
begin
  select * into me from public.profiles where id = v;
  lvl := public.level_for(me.xp);
  return jsonb_build_object(
    'xp', me.xp, 'level', lvl,
    'level_floor', 40 * (lvl - 1) * (lvl - 1),
    'next_level_at', 40 * lvl * lvl,
    'streak', case when me.last_checkin >= today - 1 then me.streak else 0 end,
    'best_streak', me.best_streak,
    'checked_in_today', me.last_checkin = today,
    'accent_hue', me.accent_hue, 'flair', me.flair,
    'currently_kind', me.currently_kind, 'currently_title', me.currently_title,
    'pinned_post_id', me.pinned_post_id,
    'muted_until', case when me.muted_until > now() then me.muted_until end
  );
end $$;

-- Nightly check-in. The client sends its UTC offset so "tonight" follows the
-- member's own clock. +20 XP, +5 per streak night (max +35 bonus).
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
begin
  select * into me from public.profiles where id = v for update;
  if me.last_checkin is not null and me.last_checkin >= today then
    return jsonb_build_object('already', true, 'streak', me.streak, 'xp', me.xp, 'level', public.level_for(me.xp), 'gained', 0);
  end if;
  new_streak := case when me.last_checkin = today - 1 then me.streak + 1 else 1 end;
  gained := 20 + least(new_streak - 1, 7) * 5;
  before_level := public.level_for(me.xp);
  update public.profiles
  set streak = new_streak, best_streak = greatest(best_streak, new_streak), last_checkin = today
  where id = v;
  new_xp := public.add_xp(v, gained);
  return jsonb_build_object(
    'already', false, 'streak', new_streak, 'gained', gained, 'xp', new_xp,
    'level', public.level_for(new_xp), 'leveled_up', public.level_for(new_xp) > before_level
  );
end $$;

create or replace function public.update_my_style(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
  k text;
begin
  perform public.enforce_rate_limit('style', 60, 3600);
  for k in select jsonb_object_keys(coalesce(p, '{}'::jsonb)) loop
    if k not in ('accent_hue', 'currently_kind', 'currently_title') then
      raise exception 'INVALID|Unknown style field: %', k;
    end if;
  end loop;
  if p ? 'accent_hue' and (jsonb_typeof(p -> 'accent_hue') <> 'number' or (p ->> 'accent_hue')::numeric not between 0 and 359) then
    raise exception 'INVALID|Color hue must be between 0 and 359.';
  end if;
  update public.profiles set
    accent_hue = case when p ? 'accent_hue' then round((p ->> 'accent_hue')::numeric)::int else accent_hue end,
    currently_kind = case when p ? 'currently_kind' then nullif(p ->> 'currently_kind', '') else currently_kind end,
    currently_title = case when p ? 'currently_title' then nullif(btrim(p ->> 'currently_title'), '') else currently_title end
  where id = v;
  return public.get_my_progress(0);
end $$;

create or replace function public.pin_post(p_post_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  if p_post_id is not null and not exists (
    select 1 from public.posts where id = p_post_id and author_id = v and deleted_at is null and kind <> 'repost'
  ) then
    raise exception 'FORBIDDEN|You can only pin your own posts.' using errcode = '42501';
  end if;
  update public.profiles set pinned_post_id = p_post_id where id = v;
end $$;

create or replace function public.get_profile_extras(p_username text) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
  p public.profiles;
  lvl int;
begin
  select * into p from public.profiles where lower(username) = lower(p_username);
  if p.id is null or (p.banned and not public.is_admin()) then
    raise exception 'NOT_FOUND|No such member.' using errcode = 'P0002';
  end if;
  lvl := public.level_for(p.xp);
  return jsonb_build_object(
    'xp', p.xp, 'level', lvl,
    'level_floor', 40 * (lvl - 1) * (lvl - 1), 'next_level_at', 40 * lvl * lvl,
    'streak', case when p.last_checkin >= current_date - 2 then p.streak else 0 end,
    'best_streak', p.best_streak,
    'accent_hue', p.accent_hue, 'flair', p.flair,
    'currently_kind', p.currently_kind, 'currently_title', p.currently_title,
    'muted', p.muted_until > now(),
    'pinned', (
      select public.post_json(x, v) from public.posts x
      where x.id = p.pinned_post_id and x.deleted_at is null and not public.is_hidden_author(x.author_id)
    )
  );
end $$;

create or replace function public.get_featured() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v uuid := public.require_member();
begin
  return coalesce((
    select jsonb_agg(public.post_json(x, v) order by x.featured_at desc)
    from (
      select * from public.posts
      where featured_at is not null and deleted_at is null and not public.is_hidden_author(author_id)
      order by featured_at desc limit 10
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.get_level_board() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  perform public.require_member();
  return jsonb_build_object(
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object('profile', public.profile_lite(p), 'score', p.xp) order by p.xp desc)
      from (select * from public.profiles where leaderboard_opt_in and not is_bot and not banned and xp > 0
            order by xp desc limit 10) p
    ), '[]'::jsonb),
    'streaks', coalesce((
      select jsonb_agg(jsonb_build_object('profile', public.profile_lite(p), 'score', p.streak) order by p.streak desc)
      from (select * from public.profiles where leaderboard_opt_in and not is_bot and not banned
              and streak > 0 and last_checkin >= current_date - 2
            order by streak desc limit 10) p
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

-- Same rules as banning: no self, never the owner, only the owner acts on admins.
create or replace function public.assert_can_moderate(p_user_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
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
    raise exception 'FORBIDDEN|You cannot moderate that person.' using errcode = '42501';
  end if;
end $$;

create or replace function public.admin_get_site() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return public.get_site() || jsonb_build_object(
    'word_filter', coalesce(public.setting('word_filter'), '[]'::jsonb),
    'updated', coalesce((
      select jsonb_object_agg(s.key, jsonb_build_object('at', s.updated_at,
        'by', (select display_name from public.profiles where id = s.updated_by)))
      from public.app_settings s
    ), '{}'::jsonb)
  );
end $$;

create or replace function public.admin_update_site(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
  k text;
  val jsonb;
  words jsonb;
  w text;
begin
  perform public.enforce_rate_limit('site_settings', 60, 3600);
  for k in select jsonb_object_keys(coalesce(p, '{}'::jsonb)) loop
    val := p -> k;
    if k = 'announcement' then
      if val is null or jsonb_typeof(val) = 'null' or coalesce(btrim(val ->> 'text'), '') = '' then
        val := 'null'::jsonb;
      else
        if char_length(val ->> 'text') > 280 then
          raise exception 'INVALID|Announcements are 280 characters max.';
        end if;
        val := jsonb_build_object(
          'id', gen_random_uuid(), 'text', btrim(val ->> 'text'),
          'tone', case when val ->> 'tone' in ('info', 'event', 'alert') then val ->> 'tone' else 'info' end,
          'created_at', now()
        );
      end if;
    elsif k = 'lockdown' then
      if jsonb_typeof(val) <> 'boolean' then raise exception 'INVALID|Quiet mode is on or off.'; end if;
    elsif k = 'slow_mode' then
      if jsonb_typeof(val) <> 'number' or (val #>> '{}')::numeric not between 0 and 3600 then
        raise exception 'INVALID|Slow mode is 0 to 3600 seconds.';
      end if;
      val := to_jsonb(floor((val #>> '{}')::numeric)::int);
    elsif k = 'word_filter' then
      if jsonb_typeof(val) <> 'array' or jsonb_array_length(val) > 100 then
        raise exception 'INVALID|The word filter takes up to 100 words.';
      end if;
      words := '[]'::jsonb;
      for w in select distinct lower(btrim(x)) from jsonb_array_elements_text(val) x loop
        if w !~ '^[[:alnum:]]{2,30}$' then
          raise exception 'INVALID|Filter words are 2-30 letters or numbers, no spaces or symbols.';
        end if;
        words := words || to_jsonb(w);
      end loop;
      val := words;
    elsif k = 'nightly_prompt' then
      if jsonb_typeof(val) = 'null' or coalesce(btrim(val #>> '{}'), '') = '' then
        val := 'null'::jsonb;
      elsif char_length(val #>> '{}') > 200 then
        raise exception 'INVALID|The nightly prompt is 200 characters max.';
      else
        val := to_jsonb(btrim(val #>> '{}'));
      end if;
    else
      raise exception 'INVALID|Unknown setting: %', k;
    end if;
    insert into public.app_settings (key, value, updated_by, updated_at)
    values (k, val, v, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
    perform public.audit('site.' || k, null, null,
      case when k = 'word_filter' then jsonb_build_object('words', jsonb_array_length(val)) else jsonb_build_object('value', val) end);
  end loop;
  return public.admin_get_site();
end $$;

create or replace function public.admin_broadcast(p_body text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
  n int;
begin
  if coalesce(btrim(p_body), '') = '' or char_length(p_body) > 280 then
    raise exception 'INVALID|Broadcasts are 1-280 characters.';
  end if;
  perform public.enforce_rate_limit('broadcast', 10, 86400);
  insert into public.notifications (user_id, actor_id, kind, body)
  select id, v, 'announcement', btrim(p_body) from public.profiles
  where not is_bot and not banned and id <> v;
  get diagnostics n = row_count;
  perform public.audit('site.broadcast', null, null, jsonb_build_object('body', left(btrim(p_body), 120), 'recipients', n));
  return n;
end $$;

create or replace function public.admin_feature_post(p_post_id uuid, p_featured boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.posts set featured_at = case when p_featured then coalesce(featured_at, now()) end
  where id = p_post_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND|That post is gone.' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.admin_mute(p_user_id uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
begin
  perform public.assert_can_moderate(p_user_id);
  if p_minutes is null or p_minutes < 0 or p_minutes > 43200 then
    raise exception 'INVALID|Mutes last 0 to 43200 minutes (30 days).';
  end if;
  update public.profiles
  set muted_until = case when p_minutes = 0 then null else now() + make_interval(mins => p_minutes) end
  where id = p_user_id;
  perform public.notify_user(p_user_id, v, 'system', null, null, null, null,
    case when p_minutes = 0 then 'Your mute was lifted. Welcome back.'
         else 'You were muted for ' || case when p_minutes >= 1440 then (p_minutes / 1440)::text || ' day(s).'
                                            when p_minutes >= 60 then (p_minutes / 60)::text || ' hour(s).'
                                            else p_minutes::text || ' minute(s).' end end);
end $$;

create or replace function public.admin_set_flair(p_user_id uuid, p_flair text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if char_length(coalesce(p_flair, '')) > 24 then
    raise exception 'INVALID|Flair is 24 characters max.';
  end if;
  update public.profiles set flair = btrim(coalesce(p_flair, '')) where id = p_user_id and not is_bot;
  if not found then
    raise exception 'NOT_FOUND|No such member.' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.admin_grant_xp(p_user_id uuid, p_amount int) returns int
language plpgsql security definer set search_path = public as $$
declare
  new_xp int;
begin
  perform public.require_admin();
  if p_amount is null or p_amount = 0 or abs(p_amount) > 5000 then
    raise exception 'INVALID|Grant between -5000 and 5000 XP.';
  end if;
  perform public.enforce_rate_limit('grant_xp', 100, 3600);
  new_xp := public.add_xp(p_user_id, p_amount);
  if new_xp is null then
    raise exception 'NOT_FOUND|No such member.' using errcode = 'P0002';
  end if;
  perform public.audit('member.xp', p_user_id, null, jsonb_build_object('amount', p_amount, 'xp', new_xp));
  return new_xp;
end $$;

-- Optional one-off: rebuild XP from past activity. Never lowers anyone's XP.
create or replace function public.admin_recalculate_xp() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform public.require_admin();
  perform public.enforce_rate_limit('recalc_xp', 3, 3600);
  with calc as (
    select p.id,
      10 * (select count(*) from public.posts x where x.author_id = p.id and x.kind <> 'repost')
      + 4 * (select count(*) from public.comments c where c.author_id = p.id and not c.is_ai)
      + 2 * (select count(*) from public.reactions r join public.posts x on x.id = r.post_id
             where x.author_id = p.id and r.user_id <> p.id)
      + 15 * (select count(*) from public.awards a join public.posts x on x.id = a.post_id
              where x.author_id = p.id and a.giver_id <> p.id) as total
    from public.profiles p where not p.is_bot
  )
  update public.profiles p set xp = calc.total
  from calc where calc.id = p.id and calc.total > p.xp;
  get diagnostics n = row_count;
  perform public.audit('site.recalculate_xp', null, null, jsonb_build_object('updated', n));
  return n;
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'totals', jsonb_build_object(
      'members', (select count(*) from public.profiles where not is_bot and not banned),
      'posts', (select count(*) from public.posts where deleted_at is null and kind <> 'repost'),
      'comments', (select count(*) from public.comments where deleted_at is null),
      'messages', (select count(*) from public.messages where deleted_at is null),
      'active_24h', (select count(*) from public.profiles where not is_bot and last_seen_at > now() - interval '24 hours'),
      'active_7d', (select count(*) from public.profiles where not is_bot and last_seen_at > now() - interval '7 days'),
      'open_reports', (select count(*) from public.reports where status = 'open'),
      'muted', (select count(*) from public.profiles where muted_until > now()),
      'banned', (select count(*) from public.profiles where banned)
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'posts', (select count(*) from public.posts where created_at >= d and created_at < d + interval '1 day' and kind <> 'repost'),
        'comments', (select count(*) from public.comments where created_at >= d and created_at < d + interval '1 day'),
        'messages', (select count(*) from public.messages where created_at >= d and created_at < d + interval '1 day'),
        'joins', (select count(*) from public.profiles where not is_bot and created_at >= d and created_at < d + interval '1 day')
      ) order by d)
      from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
    ),
    'top_posters', coalesce((
      select jsonb_agg(jsonb_build_object('profile', public.profile_lite(p), 'score', x.n) order by x.n desc)
      from (select author_id, count(*) as n from public.posts
            where created_at > now() - interval '7 days' and deleted_at is null and kind <> 'repost'
            group by author_id order by n desc limit 5) x
      join public.profiles p on p.id = x.author_id
    ), '[]'::jsonb),
    'top_tags', coalesce((
      select jsonb_agg(jsonb_build_object('tag', tag, 'count', n) order by n desc)
      from (select t.tag, count(*) as n from public.posts p, unnest(p.hashtags) t(tag)
            where p.created_at > now() - interval '7 days' and p.deleted_at is null
            group by t.tag order by n desc limit 8) y
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_audit(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'action', a.action, 'target_id', a.target_id, 'details', a.details, 'created_at', a.created_at,
      'actor', (select public.profile_lite(p) from public.profiles p where p.id = a.actor_id),
      'target', (select public.profile_lite(p) from public.profiles p where p.id = a.target_user_id)
    ) order by a.created_at desc)
    from (select * from public.audit_log order by created_at desc
          limit least(greatest(coalesce(p_limit, 50), 1), 200)) a
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_member_extras() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_object_agg(p.id, jsonb_build_object(
      'xp', p.xp, 'level', public.level_for(p.xp), 'streak', p.streak, 'flair', p.flair,
      'muted_until', case when p.muted_until > now() then p.muted_until end
    ))
    from public.profiles p where not p.is_bot
  ), '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Grants for the new functions (same model as 0001: members call RPCs,
-- helpers and trigger functions stay internal).
-- ---------------------------------------------------------------------------

revoke execute on function public.level_for(int) from public, anon;
revoke execute on function public.setting(text) from public, anon, authenticated;
revoke execute on function public.audit(text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.add_xp(uuid, int) from public, anon, authenticated;
revoke execute on function public.apply_word_filter(text) from public, anon, authenticated;
revoke execute on function public.assert_can_moderate(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_site_rules() from public, anon, authenticated;
revoke execute on function public.xp_on_post() from public, anon, authenticated;
revoke execute on function public.xp_on_comment() from public, anon, authenticated;
revoke execute on function public.xp_on_reaction() from public, anon, authenticated;
revoke execute on function public.xp_on_award() from public, anon, authenticated;
revoke execute on function public.audit_profiles() from public, anon, authenticated;
revoke execute on function public.audit_invites() from public, anon, authenticated;
revoke execute on function public.audit_reports() from public, anon, authenticated;
revoke execute on function public.audit_posts() from public, anon, authenticated;

revoke execute on function public.get_site() from public, anon;
revoke execute on function public.get_my_progress(int) from public, anon;
revoke execute on function public.daily_checkin(int) from public, anon;
revoke execute on function public.update_my_style(jsonb) from public, anon;
revoke execute on function public.pin_post(uuid) from public, anon;
revoke execute on function public.get_profile_extras(text) from public, anon;
revoke execute on function public.get_featured() from public, anon;
revoke execute on function public.get_level_board() from public, anon;
revoke execute on function public.admin_get_site() from public, anon;
revoke execute on function public.admin_update_site(jsonb) from public, anon;
revoke execute on function public.admin_broadcast(text) from public, anon;
revoke execute on function public.admin_feature_post(uuid, boolean) from public, anon;
revoke execute on function public.admin_mute(uuid, int) from public, anon;
revoke execute on function public.admin_set_flair(uuid, text) from public, anon;
revoke execute on function public.admin_grant_xp(uuid, int) from public, anon;
revoke execute on function public.admin_recalculate_xp() from public, anon;
revoke execute on function public.admin_stats() from public, anon;
revoke execute on function public.admin_audit(int) from public, anon;
revoke execute on function public.admin_member_extras() from public, anon;

grant execute on function public.level_for(int) to authenticated, service_role;
grant execute on function public.get_site() to authenticated, service_role;
grant execute on function public.get_my_progress(int) to authenticated, service_role;
grant execute on function public.daily_checkin(int) to authenticated, service_role;
grant execute on function public.update_my_style(jsonb) to authenticated, service_role;
grant execute on function public.pin_post(uuid) to authenticated, service_role;
grant execute on function public.get_profile_extras(text) to authenticated, service_role;
grant execute on function public.get_featured() to authenticated, service_role;
grant execute on function public.get_level_board() to authenticated, service_role;
grant execute on function public.admin_get_site() to authenticated, service_role;
grant execute on function public.admin_update_site(jsonb) to authenticated, service_role;
grant execute on function public.admin_broadcast(text) to authenticated, service_role;
grant execute on function public.admin_feature_post(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_mute(uuid, int) to authenticated, service_role;
grant execute on function public.admin_set_flair(uuid, text) to authenticated, service_role;
grant execute on function public.admin_grant_xp(uuid, int) to authenticated, service_role;
grant execute on function public.admin_recalculate_xp() to authenticated, service_role;
grant execute on function public.admin_stats() to authenticated, service_role;
grant execute on function public.admin_audit(int) to authenticated, service_role;
grant execute on function public.admin_member_extras() to authenticated, service_role;
grant execute on function public.setting(text) to service_role;
grant execute on function public.add_xp(uuid, int) to service_role;
