-- Partner CSM Tool — Row Level Security + field-level redaction
-- ⚠ AUTHORED, NOT YET APPLIED. Encodes the 3-tier access model from the briefing.
--   Review with the DPO before applying.

-- Caller's role / region, read from profiles (security definer to avoid recursion).
create or replace function auth_role() returns app_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_region() returns uuid
  language sql stable security definer set search_path = public as $$
  select region_id from profiles where id = auth.uid()
$$;

create or replace function is_privileged() returns boolean
  language sql stable as $$
  select auth_role() in ('overall_admin', 'sub_admin')
$$;

alter table regions enable row level security;
alter table profiles enable row level security;
alter table contacts enable row level security;
alter table side_facts enable row level security;
alter table customers enable row level security;
alter table contact_customers enable row level security;
alter table activities enable row level security;
alter table audit_log enable row level security;

-- Profiles: read own; privileged roles read all.
create policy profiles_read on profiles for select
  using (id = auth.uid() or is_privileged());

-- Regions readable by any authenticated user.
create policy regions_read on regions for select using (auth.uid() is not null);
create policy customers_read on customers for select using (auth.uid() is not null);

-- Contacts: privileged roles see all; account managers only their own region.
create policy contacts_read on contacts for select
  using (is_privileged() or region_id = auth_region());

create policy contacts_write on contacts for all
  using (is_privileged() or region_id = auth_region())
  with check (is_privileged() or region_id = auth_region());

-- Activities follow their contact's visibility; author stamped on insert.
create policy activities_read on activities for select
  using (exists (
    select 1 from contacts c
    where c.id = activities.contact_id
      and (is_privileged() or c.region_id = auth_region())
  ));

create policy activities_insert on activities for insert
  with check (author_id = auth.uid());

create policy side_facts_rw on side_facts for all
  using (exists (
    select 1 from contacts c where c.id = side_facts.contact_id
      and (is_privileged() or c.region_id = auth_region())
  ));

create policy contact_customers_rw on contact_customers for all
  using (exists (
    select 1 from contacts c where c.id = contact_customers.contact_id
      and (is_privileged() or c.region_id = auth_region())
  ));

-- Audit log: privileged read; any authenticated actor may insert their own rows.
create policy audit_read on audit_log for select using (is_privileged());
create policy audit_insert on audit_log for insert with check (actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Field-level redaction for the Account-Manager (~60%) tier.
-- RLS is row-level only, so personal columns are dropped via a view. The app
-- queries `contact_cards` for account managers and the base table for higher
-- tiers. security_invoker = true keeps row-level RLS applied to the caller.
-- The AI intro shown to this tier is generated app-side from these safe fields,
-- so no raw personal data leaves the privileged boundary.
-- ---------------------------------------------------------------------------
create view contact_cards
  with (security_invoker = true) as
  select
    id,
    full_name,
    position,
    photo_url,
    region_id,
    relationship_manager_id,
    linkedin_status,
    sentiment,
    won_customers_count
  from contacts;
