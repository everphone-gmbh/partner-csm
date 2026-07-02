-- Partner CSM Tool — security hardening (2026-07-02 audit findings)
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001-0007 on the Sovereign-Cloud
--   instance. Review with the DPO before applying.
--
-- Fixes, in order:
--   F-2  attachments had RLS disabled entirely (anon key = full read/write)
--   F-8  account managers could UPDATE/DELETE contacts via the API although
--        the app restricts editing to RM+ (approval model was client-only)
--   F-9  any tier could insert activities onto ANY contact tenant-wide
--   F-4  no right-to-erasure path: activities/event_notes were immutable by
--        policy; event notes carried spoofable free-text attribution

-- ---------------------------------------------------------------------------
-- F-2: attachments — enable RLS, scope to the parent activity's contact.
-- ---------------------------------------------------------------------------
alter table attachments enable row level security;

create policy attachments_rw on attachments for all
  using (exists (
    select 1
    from activities a
    join contacts c on c.id = a.contact_id
    where a.id = attachments.activity_id
      and (is_privileged() or c.region_id = auth_region())
  ))
  with check (exists (
    select 1
    from activities a
    join contacts c on c.id = a.contact_id
    where a.id = attachments.activity_id
      and (is_privileged() or c.region_id = auth_region())
  ));

-- ---------------------------------------------------------------------------
-- F-8: contacts — reads stay region-scoped, writes become privileged-only,
-- matching the app's canApprove (RM+) rule. DELETE included = erasure path.
-- ---------------------------------------------------------------------------
drop policy contacts_write on contacts;

create policy contacts_insert on contacts for insert
  with check (is_privileged());

create policy contacts_update on contacts for update
  using (is_privileged())
  with check (is_privileged());

create policy contacts_delete on contacts for delete
  using (is_privileged());

-- side_facts / contact_customers / contact_photos were FOR ALL region-scoped;
-- align their writes with the privileged-only contact rule (reads unchanged).
drop policy side_facts_rw on side_facts;
create policy side_facts_read on side_facts for select
  using (exists (
    select 1 from contacts c where c.id = side_facts.contact_id
      and (is_privileged() or c.region_id = auth_region())
  ));
create policy side_facts_write on side_facts for all
  using (is_privileged())
  with check (is_privileged());

drop policy contact_customers_rw on contact_customers;
create policy contact_customers_read on contact_customers for select
  using (exists (
    select 1 from contacts c where c.id = contact_customers.contact_id
      and (is_privileged() or c.region_id = auth_region())
  ));
create policy contact_customers_write on contact_customers for all
  using (is_privileged())
  with check (is_privileged());

drop policy contact_photos_rw on contact_photos;
-- Photos are sensitive-tier data (see domain/roles.ts): privileged-only, full stop.
create policy contact_photos_rw on contact_photos for all
  using (is_privileged())
  with check (is_privileged());

-- ---------------------------------------------------------------------------
-- F-9: activities — inserts must target a contact the author may see.
-- ---------------------------------------------------------------------------
drop policy activities_insert on activities;
create policy activities_insert on activities for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from contacts c
      where c.id = activities.contact_id
        and (is_privileged() or c.region_id = auth_region())
    )
  );

-- F-4: erasure path for individual activities (privileged or the author).
create policy activities_delete on activities for delete
  using (is_privileged() or author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- F-4 / F-9: event_notes — real attribution + erasure. Notes carry photos and
-- voice memos of data subjects; free-text author_name alone is spoofable and
-- ties erasure to nothing.
-- ---------------------------------------------------------------------------
alter table event_notes
  add column author_id uuid references profiles (id) default auth.uid();

drop policy event_notes_read on event_notes;
drop policy event_notes_insert on event_notes;

-- Relationship-sensitive content: privileged tier or the author themselves.
create policy event_notes_read on event_notes for select
  using (is_privileged() or author_id = auth.uid());

create policy event_notes_insert on event_notes for insert
  with check (author_id = auth.uid());

create policy event_notes_delete on event_notes for delete
  using (is_privileged() or author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Remaining, deliberately NOT in this migration (need product/DPO decisions):
--  * Column-level redaction routing (contact_cards / contact_private) — F-1;
--    requires the auth flow so the adapter can branch on the server role.
--  * Storage buckets + signed URLs for photos/voice memos — F-6.
--  * reminders.created_by / audit-log writes — auth phase.
-- ---------------------------------------------------------------------------
