-- Partner CSM Tool — Beziehungsnetz (contact links) + Kontakt-Kadenzen
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001-0008 on the Sovereign-Cloud
--   instance.

-- Individual touch-frequency target in days; NULL = global 60/90 default.
alter table contacts add column cadence_days integer;

-- Contact-to-contact relationships ("wer kennt wen"). Business-relationship
-- metadata about professional structure — same sensitivity tier as side facts.
create table contact_links (
  id uuid primary key default gen_random_uuid(),
  from_contact_id uuid not null references contacts (id) on delete cascade,
  to_contact_id uuid not null references contacts (id) on delete cascade,
  kind text not null check (kind in ('reports_to', 'knows', 'influences')),
  note text,
  created_at timestamptz not null default now(),
  check (from_contact_id <> to_contact_id)
);

create index on contact_links (from_contact_id);
create index on contact_links (to_contact_id);

alter table contact_links enable row level security;

-- Readable when either endpoint is visible to the caller; writes privileged-only
-- (matches the 0008 contact-write model).
create policy contact_links_read on contact_links for select
  using (exists (
    select 1 from contacts c
    where (c.id = contact_links.from_contact_id or c.id = contact_links.to_contact_id)
      and (is_privileged() or c.region_id = auth_region())
  ));

create policy contact_links_write on contact_links for all
  using (is_privileged())
  with check (is_privileged());
