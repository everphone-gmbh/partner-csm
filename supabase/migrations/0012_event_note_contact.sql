-- Partner CSM Tool — Event-Notizen einem Teilnehmer zuordnen
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001-0011 on the Sovereign-Cloud
--   instance.

-- Notes about a specific person cascade on erasure: the note text and its
-- attachments (photos, voice memos) are personal data about that contact.
alter table event_notes
  add column contact_id uuid references contacts (id) on delete cascade;

create index on event_notes (contact_id);
