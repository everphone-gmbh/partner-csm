-- Everphone-Bestandskunden-Referenz (Meeting-Feedback 2026-07-16)
--
-- Spiegelt die Everphone-Accounts aus Salesforce, damit das Tool warnen kann,
-- wenn ein Kunde im Verantwortungsbereich eines Telekom-Kontakts bereits
-- Everphone-Bestandskunde ist (→ andere Ansprache, AM-Abstimmung nötig).
--
-- Reine Firmendaten, KEINE personenbezogenen Daten: keine Kontakte, keine
-- Ansprechpartner, keine Umsätze. Deshalb für alle angemeldeten Nutzer
-- lesbar (auch AM-Tier) — die Warnung ist gerade für AMs relevant.
-- Schreibrechte hat nur der Sync (service_role, umgeht RLS).

create table everphone_accounts (
  id uuid primary key default gen_random_uuid(),
  salesforce_id text not null unique,
  name text not null,
  -- Normalisiert (klein, ohne Rechtsform/Interpunktion) für den Namensabgleich.
  name_normalized text not null,
  -- Salesforce Account.Type, unverändert übernommen: Customer /
  -- Inactive Customer / Offboarding / Prospect / Partner / Other.
  account_type text not null,
  active_rentals integer,
  synced_at timestamptz not null default now()
);

create index on everphone_accounts (name_normalized);
create index on everphone_accounts (account_type);

alter table everphone_accounts enable row level security;

create policy everphone_accounts_read on everphone_accounts for select
  using (auth.uid() is not null);
