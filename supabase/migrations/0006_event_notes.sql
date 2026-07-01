-- Partner CSM Tool — event quick-notes with attachments
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001-0005 on the Sovereign-Cloud instance.
-- Attachment binaries belong in Supabase Storage; `attachments` holds the
-- object references (url + kind + name). The mock keeps data URLs inline.

create table event_notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  text text not null default '',
  author_name text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index on event_notes (event_id, created_at desc);

alter table event_notes enable row level security;

-- Internal tool: any authenticated user may read/append event notes.
create policy event_notes_read on event_notes for select using (auth.uid() is not null);
create policy event_notes_insert on event_notes for insert with check (auth.uid() is not null);
