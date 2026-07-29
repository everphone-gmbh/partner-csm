-- Soll-Organisationsstruktur der Partner — Grundlage der Abdeckungsanalyse.
--
-- Warum eine eigene Tabelle und nicht einfach `distinct contacts.team`:
-- Genau die Einheiten, zu denen wir NIEMANDEN kennen, tauchen in den eigenen
-- Kontakten per Definition nicht auf. Ohne Soll-Liste kann die Analyse also
-- nie die eigentliche Frage beantworten („wo haben wir keinen Fuß in der Tür?")
-- und zeigt nur, wie gut die schon bekannten Kontakte gepflegt sind.
--
-- Gefüllt aus dem Vertriebsstruktur-Sheet (Stand 2026-07-16). Ändert sich die
-- Struktur bei Telekom, wird hier nachgezogen — die Tabelle ist für
-- privilegierte Rollen schreibbar.
--
-- `team IS NULL` bedeutet die Abteilungsebene selbst (Leitung, Assistenz,
-- Stabsstellen) — im Sheet Zeilen ohne Team-Angabe.

create table org_units (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  department text not null,
  team text,
  note text,
  created_at timestamptz not null default now()
);

-- Eine Einheit je Firma/Abteilung/Team. NULLS NOT DISTINCT, damit die
-- Abteilungsebene (team IS NULL) nicht doppelt angelegt werden kann.
create unique index org_units_unique
  on org_units (company, department, coalesce(team, '')) ;

create index on org_units (company);

alter table org_units enable row level security;

-- Struktur ist keine personenbezogene Information: für alle Angemeldeten
-- lesbar (auch AM-Tier, die brauchen den Überblick), pflegen nur RM+.
create policy org_units_read on org_units for select
  using (auth.uid() is not null);

create policy org_units_write on org_units for all
  using (is_privileged())
  with check (is_privileged());

-- ---------------------------------------------------------------------------
-- Startbestand: Telekom Large Enterprise laut Vertriebsstruktur-Sheet.
-- ---------------------------------------------------------------------------
insert into org_units (company, department, team) values
  ('Deutsche Telekom', 'Large Enterprise', null),

  ('Deutsche Telekom', 'Zentraler Fachvertrieb Mobile', null),
  ('Deutsche Telekom', 'Zentraler Fachvertrieb Mobile', 'Fachvertrieb BGE'),
  ('Deutsche Telekom', 'Zentraler Fachvertrieb Mobile', 'Fachvertrieb 5G Campusnetze'),
  ('Deutsche Telekom', 'Zentraler Fachvertrieb Mobile', 'Deal Management Mobile'),
  ('Deutsche Telekom', 'Zentraler Fachvertrieb Mobile', 'Mobile Business International'),
  ('Deutsche Telekom', 'Zentraler Fachvertrieb Mobile', 'Mobile Solution Portfolio'),
  ('Deutsche Telekom', 'Zentraler Fachvertrieb Mobile', 'Fachvertrieb Mobile Solution'),

  ('Deutsche Telekom', 'Automotive Industry & Healthcare Insurance', null),
  ('Deutsche Telekom', 'Automotive Industry & Healthcare Insurance', 'Fachvertrieb Mobilfunk'),

  ('Deutsche Telekom', 'TOP Accounts', null),
  ('Deutsche Telekom', 'TOP Accounts', 'Fachvertrieb Mobilfunk Top Accounts 1'),
  ('Deutsche Telekom', 'TOP Accounts', 'Fachvertrieb Mobilfunk Top Accounts 2'),

  ('Deutsche Telekom', 'LE Nord', null),
  ('Deutsche Telekom', 'LE Nord', 'Fachvertrieb Mobilfunk'),
  ('Deutsche Telekom', 'LE Ost', null),
  ('Deutsche Telekom', 'LE Ost', 'Fachvertrieb Mobilfunk'),
  ('Deutsche Telekom', 'LE Mitte', null),
  ('Deutsche Telekom', 'LE Mitte', 'Fachvertrieb Mobilfunk'),
  ('Deutsche Telekom', 'LE West', null),
  ('Deutsche Telekom', 'LE West', 'Fachvertrieb Mobilfunk'),
  ('Deutsche Telekom', 'LE Süd', null),
  ('Deutsche Telekom', 'LE Süd', 'Fachvertrieb Mobilfunk'),
  ('Deutsche Telekom', 'LE SüdWest', null),
  ('Deutsche Telekom', 'LE SüdWest', 'Fachvertrieb Mobilfunk')
on conflict do nothing;
