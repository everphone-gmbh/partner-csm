-- Partner CSM Tool — per-contact photo gallery
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001-0004 on the Sovereign-Cloud instance.
-- In production the images belong in Supabase Storage; this table holds the
-- object references (url) + caption. The mock keeps data URLs inline.

create table contact_photos (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index on contact_photos (contact_id);

alter table contact_photos enable row level security;

create policy contact_photos_rw on contact_photos for all
  using (exists (
    select 1 from contacts c
    where c.id = contact_photos.contact_id
      and (is_privileged() or c.region_id = auth_region())
  ));
