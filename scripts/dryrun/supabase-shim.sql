-- Minimalgeruest, das Supabase mitbringt und die Migrationen voraussetzen.
--
-- Rollen sind clusterweit — deshalb idempotent anlegen, die Wegwerf-Datenbank
-- wird bei jedem Lauf neu gebaut, der Cluster nicht immer.
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin superuser; end if; end $$;

-- Wie Supabase: anon und authenticated bekommen auf JEDES neue Objekt in public
-- automatisch alle Rechte. Genau davon lebt Fallstrick 2 / Migration 0023 — die
-- Migrationen entziehen die Schreibrechte auf den Views gezielt. Frueher standen
-- die Rechte hier von Hand vergeben NACH den Migrationen; damit haette ein
-- vergessenes revoke nie auffallen koennen.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text);
-- Sitzung wird pro Test gesetzt; ohne Sitzung NULL, genau wie in Supabase.
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid, created_at timestamptz default now(),
  updated_at timestamptz default now(), last_accessed_at timestamptz, metadata jsonb
);
create table storage.buckets (id text primary key, name text, public boolean default false);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;
