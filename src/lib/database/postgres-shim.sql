-- Minimal stand-ins for the Supabase pieces the migrations rely on, so the
-- exact same SQL runs on any plain Postgres: the embedded PGlite database in
-- demo mode, and Neon (or another hosted Postgres) as the primary database.
-- Safe to run repeatedly. Never applied to a Supabase database, which has the
-- real auth schema.

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
-- Hosted Postgres owners (e.g. Neon) usually may not grant BYPASSRLS. The app
-- never logs in as service_role, so a plain role is enough there.
do $$ begin
  begin
    create role service_role nologin bypassrls;
  exception when insufficient_privilege then
    create role service_role nologin;
  end;
exception when duplicate_object then null; end $$;

-- The server connects as the database owner and switches to `authenticated`
-- for each request (SET LOCAL ROLE), so RLS applies exactly as on Supabase.
-- Since Postgres 16 a role's creator holds it WITH ADMIN but without SET, so
-- grant SET explicitly. Postgres 15 and older have no SET option.
do $$
declare r text;
begin
  foreach r in array array['authenticated', 'anon'] loop
    begin
      if not pg_has_role(current_user, r, 'SET') then
        execute format('grant %I to %I with set true', r, current_user);
      end if;
    exception when invalid_parameter_value or syntax_error then
      if not pg_has_role(current_user, r, 'MEMBER') then
        execute format('grant %I to %I', r, current_user);
      end if;
    end;
  end loop;
exception when others then
  raise warning 'could not grant app roles to %: % (the server cannot switch roles)', current_user, sqlerrm;
end $$;

create schema if not exists auth;

-- Identity mirror. On Neon this holds only the id, email, sign-up metadata and
-- creation time of each Supabase Auth user. Passwords never leave Supabase.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
