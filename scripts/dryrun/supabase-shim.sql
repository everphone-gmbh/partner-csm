-- Minimalgeruest, das Supabase mitbringt und die Migrationen voraussetzen.
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin superuser; end if; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
-- Sitzung wird pro Test gesetzt; ohne Sitzung NULL, genau wie in Supabase.
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid, created_at timestamptz default now(),
  updated_at timestamptz default now(), last_accessed_at timestamptz, metadata jsonb
);
create table storage.buckets (id text primary key, name text, public boolean default false);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;
