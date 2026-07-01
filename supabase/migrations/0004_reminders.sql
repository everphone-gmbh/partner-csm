-- Partner CSM Tool — self-set reminders (Req 4)
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001-0003 on the Sovereign-Cloud instance.

create table reminders (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  due_date date not null,
  text text not null,
  done boolean not null default false,
  created_by_name text not null,
  created_at timestamptz not null default now()
);

create index on reminders (contact_id);
create index on reminders (due_date);

alter table reminders enable row level security;

-- Reminders follow the visibility of the underlying contact.
create policy reminders_rw on reminders for all
  using (exists (
    select 1 from contacts c
    where c.id = reminders.contact_id
      and (is_privileged() or c.region_id = auth_region())
  ));
