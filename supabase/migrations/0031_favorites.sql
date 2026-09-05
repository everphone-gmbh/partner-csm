-- Favoriten pro Nutzer (Feedback #6)
--
-- Wer täglich mit ~670 Kontakten arbeitet, braucht einen kurzen Weg zu den
-- eigenen zehn, fünfzehn wichtigsten. Bisher gab es dafür nur die Filter
-- (Region, Firma, Team) — die beschreiben den Bestand, nicht die persönliche
-- Arbeitsliste. Ein Stern am Kontakt ist persönlich: was für den einen RM
-- wichtig ist, ist für die Kollegin Rauschen.
--
-- Deshalb ist die Tabelle bewusst PRO NUTZER modelliert, und die RLS gibt
-- jedem nur die eigenen Zeilen — ohne is_privileged(): auch Admins sehen allein
-- ihre eigenen Sterne, denn ein Favorit ist Arbeitsorganisation, keine
-- Stammdatenpflege. Die Sichtbarkeit des Kontakts wird hier nicht noch einmal
-- geprüft: Kontakte liest die App weiterhin nur über contact_cards; ein Stern
-- auf einen unsichtbaren Kontakt zeigt in der Liste schlicht ins Leere.
--
-- Keine UPDATE-Policy: ein Stern wird gesetzt oder entfernt (INSERT/DELETE),
-- an der Zeile selbst gibt es nichts zu ändern. Keine expliziten Grants —
-- Standardrechte plus RLS, wie bei event_guests (0028). Der zusammengesetzte
-- Primärschlüssel macht doppeltes Markieren zum 23505, den der Adapter als
-- Erfolg wertet (der Stern IST gesetzt).
--
-- Löschen eines Kontakts (Recht auf Vergessen) kaskadiert, Löschen eines
-- Profils ebenso. Für die geplante Dubletten-Zusammenführung (Track 2.2):
-- favorites des verschwindenden Kontakts auf den verbleibenden umhängen, sonst
-- gehen Sterne mit der Dublette verloren — dabei den Primärschlüssel beachten,
-- ein Nutzer kann beide Dubletten markiert haben.

create table favorites (
  profile_id uuid not null references profiles (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, contact_id)
);

create index favorites_contact_idx on favorites (contact_id);

alter table favorites enable row level security;

create policy favorites_select on favorites for select
  using (profile_id = auth.uid());
create policy favorites_insert on favorites for insert
  with check (profile_id = auth.uid());
create policy favorites_delete on favorites for delete
  using (profile_id = auth.uid());
