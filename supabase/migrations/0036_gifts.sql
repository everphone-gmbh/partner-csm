-- Sektion „Geschenke" (Wunsch Lennart 2026-09-22, Bau freigegeben Jannik 2026-09-28)
--
-- Bisher lebten Weihnachts- und Geburtstagsgeschenke in einem Google Sheet: ein
-- Tabellenblatt, drei Listen mit drei Spaltenaufbauten, kein Status, Absender
-- als Freitext in 45 Schreibweisen. Niemand wusste, was schon raus ist.
--
-- ===========================================================================
-- Der Befund, der den Zuschnitt bestimmt
-- ===========================================================================
-- Die Empfänger sind NICHT die Kontakte des Tools: von 266 Kontakten sind bis auf
-- zwei alle Telekom, in den Listen für 2026/27 kommt Telekom kein einziges Mal
-- vor. Deshalb eine EIGENE Empfängerliste mit optionaler Verknüpfung zu einem
-- Kontakt — Muster wie event_guests (0028). Name und Firma stehen immer in der
-- Zeile selbst, auch bei Verknüpfung; die Zeile ist damit für sich lesbar.
--
-- ===========================================================================
-- Rechte (Entscheidung Jannik 2026-09-22)
-- ===========================================================================
-- Lesen und schreiben ab Relationship Manager, OHNE Regionsbedingung —
-- Geschenke werden firmen-, nicht gebietsbezogen geplant. Weil die ganze Zeile
-- für RM+ schreibbar sein soll, stellt sich die Frage „eine Spalte freigeben
-- heißt die Zeile freigeben" hier nicht.
--
-- ===========================================================================
-- Löschen eines Kontakts
-- ===========================================================================
-- contact_id ist ON DELETE CASCADE, nicht SET NULL: das Löschen eines Kontakts
-- ist in diesem Tool die Ausübung des Rechts auf Vergessenwerden (nur Leitung,
-- 0023). Wer vergessen werden will, dessen Geschenkhistorie geht mit. SET NULL
-- ließe Name und Anschrift stehen — also genau das, was gelöscht werden soll.
-- Dubletten laufen über das Zusammenführen, das die Verknüpfung vorher umhängt.

create type gift_occasion_kind as enum ('weihnachten', 'geburtstag', 'sonstiges');
create type gift_status as enum ('geplant', 'bestellt', 'versandt', 'zugestellt');
create type gift_shipping as enum ('direkt', 'via_ep');

create table gift_occasions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  kind gift_occasion_kind not null default 'sonstiges',
  ship_by date,
  created_at timestamptz not null default now()
);

-- Genau EIN laufender Geburtstags-Anlass. Er wird bei Bedarf angelegt; zwei
-- gleichzeitige erste Klicks sollen keinen zweiten erzeugen.
create unique index gift_occasions_one_birthday on gift_occasions (kind)
  where kind = 'geburtstag';

create table gift_products (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references gift_occasions (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text,
  emoji text,
  created_at timestamptz not null default now()
);
create index on gift_products (occasion_id);

-- Absender sind überwiegend keine Tool-Nutzer (45 Schreibweisen gegen 7 Logins),
-- deshalb eine eigene schlanke Liste statt profiles. Eindeutig ohne Rücksicht auf
-- Groß-/Kleinschreibung, sonst entstehen die Schreibweisen des Sheets neu.
create table gift_senders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  is_c_level boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index gift_senders_name_key on gift_senders (lower(btrim(name)));

create table gift_recipients (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references gift_occasions (id) on delete cascade,
  product_id uuid references gift_products (id) on delete set null,
  contact_id uuid references contacts (id) on delete cascade,
  first_name text,
  last_name text,
  company text,
  street text,
  postal_code text,
  city text,
  country text,
  shipping gift_shipping not null default 'direkt',
  status gift_status not null default 'geplant',
  status_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Jede Zeile muss eine Person oder eine Firma benennen.
  constraint gift_recipients_names_someone check (
    coalesce(btrim(first_name), '') <> ''
    or coalesce(btrim(last_name), '') <> ''
    or coalesce(btrim(company), '') <> ''
  )
);
create index on gift_recipients (occasion_id);
create index on gift_recipients (contact_id);
create index on gift_recipients (product_id);

create table gift_recipient_senders (
  recipient_id uuid not null references gift_recipients (id) on delete cascade,
  sender_id uuid not null references gift_senders (id) on delete cascade,
  primary key (recipient_id, sender_id)
);
create index on gift_recipient_senders (sender_id);

-- Ein Produkt gehört zu einem Anlass; ein Empfänger darf nur ein Produkt SEINES
-- Anlasses bekommen. Ohne diese Prüfung ließe sich per API ein Produkt aus einem
-- anderen Jahr eintragen, und Zählung wie Trichter stimmten nicht mehr.
create or replace function gift_recipient_product_matches() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.product_id is not null and not exists (
    select 1 from gift_products p
    where p.id = new.product_id and p.occasion_id = new.occasion_id
  ) then
    raise exception 'Das Produkt gehört zu einem anderen Anlass'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger gift_recipients_product_matches
  before insert or update of product_id, occasion_id on gift_recipients
  for each row execute function gift_recipient_product_matches();

-- Wann der aktuelle Status gesetzt wurde, führt die Datenbank selbst — wie
-- edited_at in 0034. Beim Anlegen bleibt, was mitkommt: ein Import aus dem
-- Vorjahr soll nicht behaupten, alles sei heute zugestellt worden.
create or replace function gift_recipient_status_at() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.status_at := now();
  end if;
  return new;
end
$$;

create trigger gift_recipients_status_at
  before update on gift_recipients
  for each row execute function gift_recipient_status_at();

create trigger gift_recipients_updated_at
  before update on gift_recipients
  for each row execute function set_updated_at();

-- Protokoll wie überall: wer wann welche Felder geändert hat, ohne Werte (0019).
create trigger gift_recipients_audit
  after insert or update or delete on gift_recipients
  for each row execute function log_data_change('gift_recipient');

alter table gift_occasions enable row level security;
alter table gift_products enable row level security;
alter table gift_senders enable row level security;
alter table gift_recipients enable row level security;
alter table gift_recipient_senders enable row level security;

create policy gift_occasions_rw on gift_occasions for all
  using (is_privileged()) with check (is_privileged());
create policy gift_products_rw on gift_products for all
  using (is_privileged()) with check (is_privileged());
create policy gift_senders_rw on gift_senders for all
  using (is_privileged()) with check (is_privileged());
create policy gift_recipients_rw on gift_recipients for all
  using (is_privileged()) with check (is_privileged());
create policy gift_recipient_senders_rw on gift_recipient_senders for all
  using (is_privileged()) with check (is_privileged());
