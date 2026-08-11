-- Event-Gäste als eigene Personen (Plan Track 2.1)
--
-- Hintergrund: Events kannten bisher nur bestehende Kontakte als Teilnehmer
-- (event_attendees.contact_id NOT NULL). Auf einer Messe steht man aber ständig
-- Leuten gegenüber, die (noch) kein Kontakt sind. Die soll man mit Namen
-- festhalten, Notizen an sie hängen — und später zu einem echten Kontakt machen.
--
-- Diese Migration zieht NUR das Datenmodell ein (Oberfläche folgt getrennt):
--   * event_guests            — unbekannte Gäste eines Events, nur mit Namen
--   * event_notes.guest_id    — eine Notiz kann statt an einen Kontakt an einen
--                               Gast hängen (contact_id ODER guest_id)
--   * promoted_contact_id     — nach dem „Zu Kontakt machen" der Verweis auf den
--                               angelegten Kontakt (Historie, verhindert Dubletten)
--
-- Additiv: bestehende Zeilen und INSERTs ohne guest_id bleiben gültig
-- (guest_id ist NULL-bar, alle neuen Spalten sind optional).

create table event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  name text not null,
  company text,
  note text,
  -- Nach der Beförderung: Verweis auf den erzeugten Kontakt. ON DELETE SET NULL,
  -- weil das Löschen des Kontakts (Recht auf Vergessen) den Gast-Eintrag als
  -- Messe-Historie stehen lässt, nur eben ohne Kontakt-Verweis.
  promoted_contact_id uuid references contacts (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on event_guests (event_id);

-- Notizen zu einem Gast verschwinden mit dem Gast (wie die Kontakt-Variante in
-- 0012: eine Notiz über eine Person ist personenbezogen und kaskadiert).
alter table event_notes
  add column guest_id uuid references event_guests (id) on delete cascade;

create index on event_notes (guest_id);

alter table event_guests enable row level security;

-- RLS wie bei events (0003): ein Gast hat keine Region, an der sich die
-- Sichtbarkeit festmachen ließe (anders als event_attendees, die der Region des
-- Kontakts folgen). Und anders als event_notes, die nur eingefügt/gelöscht
-- werden, brauchen Gäste volles CRUD (Anlegen, Umbenennen, Löschen, Befördern).
-- Deshalb das events-Idiom: jede angemeldete Person darf lesen und schreiben.
create policy event_guests_read on event_guests for select
  using (auth.uid() is not null);
create policy event_guests_write on event_guests for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- event_notes: fehlende UPDATE-Policy nachziehen.
--
-- 0008 gab event_notes nur SELECT-, INSERT- und DELETE-Policies. Das „Zu Kontakt
-- machen" pflegt aber die Notiz um (guest_id → contact_id) — ein UPDATE. Ohne
-- passende Policy liefe das unter RLS ins Leere (0 Zeilen, kein Fehler) und die
-- Notiz bliebe am Gast hängen. Der Fake-Client kennt keine RLS, die Contract-
-- Tests würden das also NICHT bemerken (CLAUDE.md, Fallstrick 4).
--
-- Additiv und mit demselben Zuschnitt wie SELECT/DELETE (0008): privilegiert
-- oder Autor der Notiz. Schwächt keine bestehende Regel ab.
create policy event_notes_update on event_notes for update
  using (is_privileged() or author_id = auth.uid())
  with check (is_privileged() or author_id = auth.uid());
