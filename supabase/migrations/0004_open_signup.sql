-- ============================================================================
-- YORU goes public: open sign-ups (admin switch), friendlier usernames for
-- future social logins, a support inbox, and self-serve account deletion.
--
-- Additive and backward-compatible:
--   * widens the app_settings key list; adds the 'open_signup' setting (on)
--   * replaces handle_new_user / check_invite with versions that still honor
--     invites and still make the very first account the owner
--   * new support_messages table (RLS: admins only) and server-only functions
-- ============================================================================

alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('announcement', 'lockdown', 'slow_mode', 'word_filter', 'nightly_prompt', 'open_signup'));

-- Anyone can join unless an admin switches back to invite-only.
insert into public.app_settings (key, value) values ('open_signup', 'true'::jsonb)
on conflict (key) do nothing;

create or replace function public.signup_open() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_settings where key = 'open_signup')::text, 'false') = 'true'
$$;

-- ---------------------------------------------------------------------------
-- Sign-up
-- ---------------------------------------------------------------------------

create or replace function public.check_invite(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  inv public.invites;
  inviter text;
  first_user boolean := not exists (select 1 from public.profiles where not is_bot);
  open boolean := public.signup_open();
  reason text;
begin
  if first_user then
    return jsonb_build_object('valid', true, 'first_user', true, 'open', open);
  end if;
  if coalesce(p_code, '') <> '' and p_code <> '_' then
    select * into inv from public.invites where code = p_code;
    reason := case
      when inv.code is null then 'not_found'
      when inv.revoked then 'revoked'
      when inv.uses >= inv.max_uses then 'used_up'
      when inv.expires_at is not null and inv.expires_at < now() then 'expired'
    end;
    if reason is null then
      select display_name into inviter from public.profiles where id = inv.created_by;
      return jsonb_build_object('valid', true, 'first_user', false, 'open', open, 'inviter', inviter);
    end if;
  end if;
  if open then
    -- A bad or missing code does not matter while sign-ups are open.
    return jsonb_build_object('valid', true, 'first_user', false, 'open', true);
  end if;
  return jsonb_build_object('valid', false, 'open', false, 'reason', coalesce(reason, 'not_found'));
end $$;

-- Runs for every new auth user (password or social login). Invites still
-- count when given; without one, sign-up needs open_signup. Usernames chosen
-- by the person must be free; generated ones (social logins) get a suffix.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  invite_code text := meta ->> 'invite_code';
  inv public.invites;
  chosen text := nullif(meta ->> 'username', '');
  uname text;
  base text;
  n int := 0;
  new_role text := 'member';
begin
  if not exists (select 1 from public.profiles where not is_bot) then
    new_role := 'owner';
  else
    if coalesce(invite_code, '') <> '' then
      select * into inv from public.invites where code = invite_code for update;
      if inv.code is not null and (inv.revoked or inv.uses >= inv.max_uses
         or (inv.expires_at is not null and inv.expires_at < now())) then
        inv := null;
      end if;
    end if;
    if inv.code is null and not public.signup_open() then
      raise exception 'INVALID_INVITE|YORU is invite-only right now. Ask a member for an invite link.' using errcode = 'P0001';
    end if;
    if inv.code is not null then
      update public.invites set uses = uses + 1 where code = inv.code;
    end if;
  end if;

  if chosen is not null then
    uname := left(regexp_replace(chosen, '[^A-Za-z0-9_]', '', 'g'), 20);
    if char_length(uname) < 3 then
      uname := uname || substr(md5(new.id::text), 1, 5);
    end if;
    if exists (select 1 from public.profiles where lower(username) = lower(uname)) then
      raise exception 'USERNAME_TAKEN|That username is taken. Try another one.' using errcode = 'P0001';
    end if;
  else
    base := left(regexp_replace(coalesce(nullif(meta ->> 'preferred_username', ''), split_part(coalesce(new.email, ''), '@', 1)), '[^A-Za-z0-9_]', '', 'g'), 15);
    if char_length(base) < 3 then
      base := 'yoru' || base;
    end if;
    uname := base;
    while exists (select 1 from public.profiles where lower(username) = lower(uname)) loop
      n := n + 1;
      uname := base || substr(md5(new.id::text || n::text), 1, 4);
    end loop;
  end if;

  insert into public.profiles (id, username, display_name, avatar_url, role)
  values (
    new.id, uname,
    left(coalesce(nullif(trim(meta ->> 'display_name'), ''), nullif(trim(meta ->> 'full_name'), ''), nullif(trim(meta ->> 'name'), ''), uname), 40),
    nullif(coalesce(meta ->> 'avatar_url', meta ->> 'picture'), ''),
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

-- ---------------------------------------------------------------------------
-- Site settings: same as 0003 plus 'open_signup'.
-- ---------------------------------------------------------------------------

create or replace function public.get_site() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_member();
  return jsonb_build_object(
    'announcement', public.setting('announcement'),
    'lockdown', coalesce((public.setting('lockdown'))::text, 'false') = 'true',
    'slow_mode', coalesce((public.setting('slow_mode'))::text::int, 0),
    'nightly_prompt', public.setting('nightly_prompt') #>> '{}',
    'open_signup', public.signup_open()
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
    elsif k in ('lockdown', 'open_signup') then
      if jsonb_typeof(val) <> 'boolean' then raise exception 'INVALID|That setting is on or off.'; end if;
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

-- ---------------------------------------------------------------------------
-- Support inbox (contact form, deletion and privacy requests)
-- ---------------------------------------------------------------------------

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  email text check (email is null or (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  topic text not null check (topic in ('general', 'account', 'deletion', 'privacy', 'safety', 'bug')),
  message text not null check (char_length(message) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null
);
create index if not exists support_messages_created_idx on public.support_messages (created_at desc);

alter table public.support_messages enable row level security;
drop policy if exists "admins read support" on public.support_messages;
create policy "admins read support" on public.support_messages for select to authenticated using (public.is_admin());
revoke all on public.support_messages from anon, authenticated;
grant select on public.support_messages to authenticated;
grant all on public.support_messages to service_role;

-- Server-only: the API route validates, rate-limits and passes the user id.
create or replace function public.submit_support(p_user uuid, p_email text, p_topic text, p_message text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  insert into public.support_messages (user_id, email, topic, message)
  values (p_user, nullif(lower(btrim(coalesce(p_email, ''))), ''), p_topic, btrim(p_message))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.admin_support_inbox(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'email', s.email, 'topic', s.topic, 'message', s.message, 'status', s.status,
      'created_at', s.created_at, 'closed_at', s.closed_at,
      'user', (select public.profile_lite(p) from public.profiles p where p.id = s.user_id)
    ) order by (s.status = 'open') desc, s.created_at desc)
    from (select * from public.support_messages order by created_at desc
          limit least(greatest(coalesce(p_limit, 100), 1), 300)) s
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_close_support(p_id uuid, p_closed boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.require_admin();
begin
  update public.support_messages
  set status = case when p_closed then 'closed' else 'open' end,
      closed_at = case when p_closed then now() end,
      closed_by = case when p_closed then v end
  where id = p_id;
  if not found then
    raise exception 'NOT_FOUND|No such message.' using errcode = 'P0002';
  end if;
  perform public.audit(case when p_closed then 'support.close' else 'support.reopen' end, null, p_id::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Account deletion. Server-only: the API route checks the session and the
-- typed confirmation, calls this, then removes the login and uploaded files.
-- Deleting the profile cascades to the person's posts, comments, messages,
-- stories, reactions, votes, bookmarks, awards, notifications and AI history.
-- ---------------------------------------------------------------------------

create or replace function public.delete_account(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  select role into r from public.profiles where id = p_user and not is_bot;
  if r is null then
    raise exception 'NOT_FOUND|No such account.' using errcode = 'P0002';
  end if;
  if r = 'owner' then
    raise exception 'FORBIDDEN|The owner account cannot be deleted from the app. Contact support to transfer ownership first.' using errcode = '42501';
  end if;
  delete from public.rate_limits where user_id = p_user;
  delete from public.profiles where id = p_user;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.signup_open() from public, anon, authenticated;
revoke execute on function public.check_invite(text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.submit_support(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
revoke execute on function public.get_site() from public, anon;
revoke execute on function public.admin_update_site(jsonb) from public, anon;
revoke execute on function public.admin_support_inbox(int) from public, anon;
revoke execute on function public.admin_close_support(uuid, boolean) from public, anon;

grant execute on function public.signup_open() to service_role;
grant execute on function public.check_invite(text) to service_role;
grant execute on function public.submit_support(uuid, text, text, text) to service_role;
grant execute on function public.delete_account(uuid) to service_role;
grant execute on function public.get_site() to authenticated, service_role;
grant execute on function public.admin_update_site(jsonb) to authenticated, service_role;
grant execute on function public.admin_support_inbox(int) to authenticated, service_role;
grant execute on function public.admin_close_support(uuid, boolean) to authenticated, service_role;
