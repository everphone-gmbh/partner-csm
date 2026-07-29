-- Bilder und Sprachmemos in Supabase Storage statt als Data-URL in der DB
-- (Audit-Befund F-6).
--
-- Bisher landete jedes Foto base64-codiert in einer Postgres-Zeile: +33 %
-- Größe, jede Kontaktabfrage zieht die Bilder mit, und die Zeilen wachsen
-- unkontrolliert. Ab jetzt speichern `contacts.photo_url`,
-- `contact_photos.url` und `event_notes.attachments[].url` nur eine Referenz
-- der Form `storage:<bucket>/<pfad>`; ausgeliefert wird über signierte,
-- ablaufende Links.
--
-- Drei Buckets, weil drei verschiedene Zugriffsregeln gelten — abgeleitet aus
-- den bestehenden Tabellen-Policies, damit Storage nicht die Hintertür wird:
--
--   contact-avatars    Profilbild. Nicht in SENSITIVE_CONTACT_FIELDS, also
--                      sichtbar für jeden, der den Kontakt sehen darf
--                      (regionsgebunden). Ändern nur RM+.
--   contact-gallery    Private Fotos der betroffenen Person — höchste
--                      Sensibilitätsstufe, wie contact_photos seit 0008:
--                      ausschließlich RM+.
--   event-note-media   Anhänge an Event-Notizen. Wie event_notes seit 0008:
--                      RM+ oder die eigene Aufnahme.
--
-- Pfadkonvention: contact-avatars/<contactId>/… und contact-gallery/<contactId>/…
-- Der erste Ordner ist die Kontakt-ID, damit die Policy die Sichtbarkeit
-- desselben Kontakts prüfen kann. Ohne diese Konvention greift der Schutz nicht.

insert into storage.buckets (id, name, public)
values
  ('contact-avatars', 'contact-avatars', false),
  ('contact-gallery', 'contact-gallery', false),
  ('event-note-media', 'event-note-media', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Profilbilder: lesen wie der Kontakt, schreiben privilegiert.
-- ---------------------------------------------------------------------------
create policy avatars_read on storage.objects for select
  using (
    bucket_id = 'contact-avatars'
    and can_see_contact(((storage.foldername(name))[1])::uuid)
  );

create policy avatars_write on storage.objects for insert
  with check (bucket_id = 'contact-avatars' and is_privileged());

create policy avatars_update on storage.objects for update
  using (bucket_id = 'contact-avatars' and is_privileged())
  with check (bucket_id = 'contact-avatars' and is_privileged());

create policy avatars_delete on storage.objects for delete
  using (bucket_id = 'contact-avatars' and is_privileged());

-- ---------------------------------------------------------------------------
-- Galerie: durchgängig privilegiert (analog contact_photos in 0008).
-- ---------------------------------------------------------------------------
create policy gallery_read on storage.objects for select
  using (bucket_id = 'contact-gallery' and is_privileged());

create policy gallery_write on storage.objects for insert
  with check (bucket_id = 'contact-gallery' and is_privileged());

create policy gallery_delete on storage.objects for delete
  using (bucket_id = 'contact-gallery' and is_privileged());

-- ---------------------------------------------------------------------------
-- Event-Notiz-Anhänge: RM+ oder eigene Aufnahme. `owner` setzt Storage selbst
-- auf den Uploader — damit trägt die Regel ohne Pfadkonvention.
-- ---------------------------------------------------------------------------
create policy note_media_read on storage.objects for select
  using (
    bucket_id = 'event-note-media'
    and (is_privileged() or owner = auth.uid())
  );

create policy note_media_write on storage.objects for insert
  with check (bucket_id = 'event-note-media' and auth.uid() is not null);

create policy note_media_delete on storage.objects for delete
  using (
    bucket_id = 'event-note-media'
    and (is_privileged() or owner = auth.uid())
  );
