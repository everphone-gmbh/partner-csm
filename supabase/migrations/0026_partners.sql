-- Mehr-Mandanten-Modell: Partner als eigene Entität (nur Datenmodell)
--
-- Hintergrund (Lennart 2026-08-06): Nach dem Login soll eine Partner-Auswahl
-- kommen — Telekom heute, weitere Partner später, jeweils mit eigenem Branding
-- und getrenntem Datenbestand.
--
-- Diese Migration zieht NUR das Schema ein. Bewusst NICHT enthalten und späteren
-- Migrationen vorbehalten (Plan Track 2.3):
--   * current_partner() und partner-bezogene RLS in contact_cards/activity_cards
--   * Auswahl-Screen, Branding, partner-bewusstes createContact
--
-- Weil die App partner_id noch NICHT selbst schreibt, MUSS die Spalte einen
-- DEFAULT tragen — sonst schlüge jedes INSERT ohne partner_id fehl (u. a. das
-- Anlegen neuer Kontakte). Der DEFAULT zeigt auf den Seed-Partner Telekom und
-- kann entfallen, sobald createContact die Spalte selbst setzt.
--
-- Startbestand steht komplett bei Telekom: contacts ist nach dem Clean Slate
-- leer, org_units (25) und events (0) bekommen den DEFAULT. Kein Backfill nötig.

-- Feste UUID für den Seed-Partner, damit sie als Spalten-DEFAULT literal
-- referenzierbar ist (ein Subselect ist als DEFAULT nicht erlaubt).
create table partners (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  accent_color text,
  logo_url     text,
  created_at   timestamptz not null default now()
);

insert into partners (id, name, slug, accent_color) values
  ('11111111-1111-4111-8111-111111111111', 'Deutsche Telekom', 'telekom', '#E20074')
on conflict (slug) do nothing;

alter table partners enable row level security;

-- Partnerliste ist nicht personenbezogen: für alle Angemeldeten lesbar (die
-- Auswahl braucht sie), pflegen nur privilegierte Rollen. Idiom wie org_units.
create policy partners_read on partners for select
  using (auth.uid() is not null);
create policy partners_write on partners for all
  using (is_privileged())
  with check (is_privileged());

-- ---------------------------------------------------------------------------
-- partner_id auf den mandantenbehafteten Tabellen. NOT NULL mit DEFAULT Telekom,
-- damit bestehende Zeilen und künftige INSERTs ohne partner_id gültig bleiben,
-- solange die App die Spalte noch nicht selbst setzt.
-- ---------------------------------------------------------------------------
alter table contacts
  add column partner_id uuid not null
    default '11111111-1111-4111-8111-111111111111'
    references partners(id);
create index on contacts (partner_id);

alter table org_units
  add column partner_id uuid not null
    default '11111111-1111-4111-8111-111111111111'
    references partners(id);
create index on org_units (partner_id);

alter table events
  add column partner_id uuid not null
    default '11111111-1111-4111-8111-111111111111'
    references partners(id);
create index on events (partner_id);

-- ---------------------------------------------------------------------------
-- Mitgliedschaft: welcher Nutzer darf welchen Partner sehen. Heute alle → Telekom.
-- ---------------------------------------------------------------------------
create table profile_partners (
  profile_id uuid not null references profiles(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  primary key (profile_id, partner_id)
);

insert into profile_partners (profile_id, partner_id)
  select id, '11111111-1111-4111-8111-111111111111' from profiles
on conflict do nothing;

alter table profile_partners enable row level security;

-- Jeder sieht seine eigene Mitgliedschaft; privilegierte Rollen sehen alle.
create policy profile_partners_read on profile_partners for select
  using (profile_id = auth.uid() or is_privileged());
create policy profile_partners_write on profile_partners for all
  using (is_privileged())
  with check (is_privileged());
