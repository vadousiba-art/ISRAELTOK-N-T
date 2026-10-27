-- ============================================================================
-- Run on the SUPABASE project to ROLL BACK from Neon to Supabase as the
-- primary database (docs/rollback.md). Restores the sign-up trigger function
-- exactly as defined in supabase/migrations/0004_open_signup.sql.
-- ============================================================================

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
