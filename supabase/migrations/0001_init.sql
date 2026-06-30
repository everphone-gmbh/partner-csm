-- Partner CSM Tool — initial schema
-- ⚠ AUTHORED, NOT YET APPLIED. Run only against the Sovereign-Cloud Supabase
--   instance once provisioning + DPO sign-off are in place. Never on Telekom cloud.

create extension if not exists "pgcrypto";

-- Permission tiers: overall_admin (100%), sub_admin / RM (~95-98%),
-- account_manager (~60%, personal data redacted — see 0002_rls.sql).
create type app_role as enum ('overall_admin', 'sub_admin', 'account_manager');
create type traffic_light as enum ('green', 'amber', 'red', 'neutral');
create type linkedin_status as enum ('has_account', 'no_account', 'unknown');
create type activity_type as enum ('call', 'email', 'meeting', 'note', 'social');

create table regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- App users mirror auth.users; role + region drive all access control.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role app_role not null default 'account_manager',
  region_id uuid references regions (id),
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  position text,
  photo_url text,
  region_id uuid not null references regions (id),
  relationship_manager_id uuid references profiles (id),
  email text,
  birthday date,
  location text,
  family_status text,
  children text,
  pets text,
  -- LinkedIn presence as an explicit, verifiable state (not just a URL):
  linkedin_status linkedin_status not null default 'unknown',
  linkedin_url text,
  linkedin_verified_by uuid references profiles (id),
  linkedin_verified_at timestamptz,
  sentiment traffic_light not null default 'neutral',
  active_devices text,
  won_customers_count integer not null default 0,
  free_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table side_facts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  label text not null,
  category text not null default 'other'
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  salesforce_url text
);

create table contact_customers (
  contact_id uuid not null references contacts (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  with_us boolean not null default true,
  primary key (contact_id, customer_id)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  type activity_type not null,
  occurred_at timestamptz not null default now(),
  -- Attribution: every entry is stamped with its author automatically.
  author_id uuid not null references profiles (id) default auth.uid(),
  body text not null default '',
  ai_summary text,
  created_at timestamptz not null default now()
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities (id) on delete cascade,
  name text not null,
  kind text not null default 'document',
  url text,
  size_label text
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles (id),
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb,
  at timestamptz not null default now()
);

create index on contacts (region_id);
create index on contacts (relationship_manager_id);
create index on activities (contact_id, occurred_at desc);
create index on side_facts (contact_id);

-- Maintain updated_at on contacts.
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_set_updated_at
  before update on contacts
  for each row execute function set_updated_at();
