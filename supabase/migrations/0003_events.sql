-- Partner CSM Tool — Events module (Req 7)
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001/0002 on the Sovereign-Cloud instance.

create type attendance_status as enum ('invited', 'accepted', 'declined', 'attended', 'no_show');

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  location text,
  description text,
  created_at timestamptz not null default now()
);

create table event_attendees (
  event_id uuid not null references events (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  status attendance_status not null default 'invited',
  purpose text,
  primary key (event_id, contact_id)
);

create index on event_attendees (event_id);
create index on event_attendees (contact_id);

alter table events enable row level security;
alter table event_attendees enable row level security;

-- Events are readable/manageable by any authenticated user (internal tool).
create policy events_read on events for select using (auth.uid() is not null);
create policy events_write on events for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Attendee rows follow the visibility of the underlying contact.
create policy event_attendees_rw on event_attendees for all
  using (exists (
    select 1 from contacts c
    where c.id = event_attendees.contact_id
      and (is_privileged() or c.region_id = auth_region())
  ));
