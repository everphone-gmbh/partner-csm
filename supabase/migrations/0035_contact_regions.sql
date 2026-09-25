-- Ein Kontakt kann zu mehreren Gebieten gehoeren (gemeldet 2026-09-24)
--
-- Eine Teamassistenz betreut zwei Regionen. Im Tool hatte ein Kontakt genau
-- eine: `contacts.region_id`. Entscheidung Jannik 2026-09-25: beliebig viele,
-- alle gleichwertig — der Kontakt zaehlt in JEDEM seiner Gebiete, auch in der
-- Abdeckung. Die Summe ueber die Gebiete liegt damit bewusst ueber der
-- Gesamtzahl der Kontakte.
--
-- ===========================================================================
-- Warum das trotz 20 betroffener Policies eine kleine Migration ist
-- ===========================================================================
-- Die Sichtbarkeitsregel steht seit 0018/0023 an genau EINER Stelle:
-- can_see_contact(). Reminder, Event-Teilnehmer, Verknuepfungen, Kundenbezuege,
-- Anhaenge und activity_cards rufen sie auf. Wird sie umgestellt, ziehen alle
-- mit. Ausnahmen sind nur zwei Stellen, die die Region noch selbst ausformulieren:
-- die Policy activities_insert und die View contact_cards.
--
-- ===========================================================================
-- contacts.region_id bleibt — als FUEHRENDES Gebiet
-- ===========================================================================
-- Nicht als zweite Wahrheit: die Menge der Gebiete steht in contact_regions,
-- region_id benennt eines davon und wird per Trigger daraus abgeleitet. Es gibt
-- also keinen Zustand, in dem region_id ein Gebiet nennt, das nicht in der
-- Menge ist. Gebraucht wird es, weil die Spalte NOT NULL ist und an einigen
-- Stellen genau ein Gebiet verlangt wird; fuer den Nutzer ist sie unsichtbar,
-- die Oberflaeche zeigt und filtert ueber alle Gebiete.
--
-- Ein Kontakt ohne Gebiet ist nicht vorgesehen (region_id ist NOT NULL) — der
-- Trigger weist das Entfernen des letzten Gebiets deshalb mit einer lesbaren
-- Meldung ab, statt die Spalte in eine NOT-NULL-Verletzung laufen zu lassen.

create table contact_regions (
  contact_id uuid not null references contacts (id) on delete cascade,
  region_id uuid not null references regions (id),
  created_at timestamptz not null default now(),
  primary key (contact_id, region_id)
);

comment on table contact_regions is
  'Gebiete eines Kontakts, alle gleichwertig. contacts.region_id ist das daraus abgeleitete fuehrende Gebiet.';

-- Der Zugriffsweg fragt „welche Kontakte liegen in meinem Gebiet" — dafuer
-- reicht der Primaerschluessel (contact_id zuerst) nicht.
create index on contact_regions (region_id);

-- Bestand uebernehmen: jeder Kontakt behaelt sein bisheriges Gebiet.
insert into contact_regions (contact_id, region_id)
  select id, region_id from contacts where region_id is not null;

alter table contact_regions enable row level security;

-- Lesen wie die Kontakte selbst, schreiben wie contacts_update (RM aufwaerts).
-- Bewusst NICHT can_see_contact() im Lesezweig: die Funktion liest ihrerseits
-- diese Tabelle, das waere eine Rekursion.
create policy contact_regions_read on contact_regions for select
  using (is_privileged() or region_id = auth_region());

create policy contact_regions_write on contact_regions for all
  using (is_privileged())
  with check (is_privileged());

-- ===========================================================================
-- Die eine Stelle, an der die Sichtbarkeit haengt
-- ===========================================================================
create or replace function can_see_contact(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_privileged() or exists (
    select 1 from contact_regions cr
    where cr.contact_id = cid
      and cr.region_id = auth_region()
  )
$$;

-- Zweite Stelle: diese Policy formulierte die Region selbst aus und haette den
-- Kontakt nur in seinem fuehrenden Gebiet gesehen.
drop policy activities_insert on activities;
create policy activities_insert on activities for insert
  with check (author_id = auth.uid() and can_see_contact(activities.contact_id));

-- ===========================================================================
-- Wer haelt wen synchron
-- ===========================================================================
-- Eine Richtung, damit es keine Schaukel gibt:
--
--   contacts.region_id  --->  contact_regions   (Mitgliedschaft sicherstellen)
--
-- region_id ist das fuehrende Gebiet und immer AUCH Mitglied der Menge. Ein
-- Gebiet hinzuzufuegen aendert region_id NICHT — sonst wuerde ein Nachziehen in
-- die Gegenrichtung eine gerade gesetzte Zuordnung wieder ueberschreiben.
-- Nur ein Fall laeuft rueckwaerts: wird ausgerechnet das fuehrende Gebiet
-- entfernt, rueckt ein verbliebenes nach.
--
-- Die INSERT-Regel ist nicht bloss Kosmetik. Ohne sie bekaeme ein NEU angelegter
-- Kontakt keine Zeile in contact_regions und waere damit fuer jeden Account
-- Manager unsichtbar — der Trockenlauf (scripts/dry_run_migrations.sh) hat genau
-- das gefunden.

create or replace function contact_region_membership() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.region_id is not null then
    insert into contact_regions (contact_id, region_id)
      values (new.id, new.region_id)
      on conflict do nothing;
  end if;
  return null;
end
$$;

create trigger contacts_region_membership
  after insert on contacts
  for each row execute function contact_region_membership();

-- Auch fuer jeden anderen Schreibweg auf region_id (Massenzuordnung, Import,
-- SQL von Hand). Bestehende Gebiete bleiben dabei stehen: ein Gebiet zu
-- entfernen ist eine eigene, ausdrueckliche Handlung und passiert nicht
-- nebenbei in einer Aktion ueber 25 Kontakte.
create trigger contacts_region_membership_update
  after update of region_id on contacts
  for each row when (new.region_id is distinct from old.region_id)
  execute function contact_region_membership();

create or replace function promote_leading_region() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  next_region uuid;
begin
  -- Loescht jemand den Kontakt selbst, raeumt die Kaskade auch seine Gebiete ab.
  -- Ohne diesen Ausstieg wuerde die Regel „mindestens ein Gebiet" unten jede
  -- Kontaktloeschung verhindern — und damit den Loeschweg nach DSGVO.
  if not exists (select 1 from contacts where id = old.contact_id) then
    return old;
  end if;

  -- Ein nicht fuehrendes Gebiet zu entfernen beruehrt contacts nicht.
  if not exists (
    select 1 from contacts
    where id = old.contact_id and region_id = old.region_id
  ) then
    return old;
  end if;

  -- BEFORE DELETE: die Zeile steht noch, deshalb explizit ausschliessen.
  select cr.region_id into next_region
    from contact_regions cr
    where cr.contact_id = old.contact_id
      and cr.region_id <> old.region_id
    order by cr.created_at, cr.region_id
    limit 1;

  if next_region is null then
    raise exception 'Ein Kontakt braucht mindestens ein Gebiet'
      using errcode = '23502';
  end if;

  update contacts set region_id = next_region where id = old.contact_id;
  return old;
end
$$;

create trigger contact_regions_promote
  before delete on contact_regions
  for each row execute function promote_leading_region();

-- Zuordnungen sind personenbezogen und werden protokolliert.
--
-- NICHT mit log_data_change: die generische Funktion aus 0019 liest new.id
-- bzw. old.id, und diese Tabelle hat keine id-Spalte — ihr Schluessel ist das
-- Paar (contact_id, region_id). Dasselbe war 0023 schon der Grund, warum
-- event_attendees aussen vor blieb. Protokolliert wird gegen den KONTAKT, denn
-- danach sucht man spaeter, nicht nach einer Zuordnungszeile. Werte stehen wie
-- ueberall nicht im Protokoll.
create or replace function log_contact_region_change() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  c_id uuid;
begin
  if tg_op = 'DELETE' then
    c_id := old.contact_id;
  else
    c_id := new.contact_id;
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, detail)
    values (auth.uid(), lower(tg_op), 'contact_region', c_id, '{}'::jsonb);

  return null;
end
$$;

create trigger contact_regions_audit
  after insert or delete on contact_regions
  for each row execute function log_contact_region_change();

-- ===========================================================================
-- Leseview: Zeilenfilter ueber alle Gebiete, dazu die Gebietsliste
-- ===========================================================================
drop view contact_cards;
create view contact_cards as
  select
    c.id,
    c.full_name,
    c."position",
    c.photo_url,
    c.region_id,
    -- Alle Gebiete des Kontakts, fuehrendes zuerst. Die Oberflaeche filtert und
    -- zaehlt hierueber, nicht ueber region_id.
    (
      select coalesce(array_agg(cr.region_id order by cr.created_at, cr.region_id), '{}'::uuid[])
      from contact_regions cr
      where cr.contact_id = c.id
    ) as region_ids,
    c.relationship_manager_id,
    c.company,
    c.team,
    c.email,
    c.phone_work,
    c.phone_mobile,
    c.phone_direct,
    c.business_address,
    c.assistant_name,
    c.assistant_contact,
    c.social_links,
    c.linkedin_status,
    c.linkedin_url,
    c.linkedin_verified_by,
    c.linkedin_verified_at,
    c.sentiment,
    c.sentiment_history,
    c.cadence_days,
    c.buying_role,
    c.won_customers_count,
    c.created_at,
    c.updated_at,
    case when is_privileged() then c.birthday else null end as birthday,
    case when is_privileged() then c.location else null end as location,
    case when is_privileged() then c.family_status else null end as family_status,
    case when is_privileged() then c.children else null end as children,
    case when is_privileged() then c.pets else null end as pets,
    case when is_privileged() then c.free_text else null end as free_text,
    case when is_privileged() then c.active_devices else null end as active_devices,
    case when is_privileged() then c.phone_private else null end as phone_private,
    case when is_privileged() then c.email_private else null end as email_private
  from contacts c
  where can_see_contact(c.id);

-- PFLICHT nach jedem View-Neubau (0023): Supabase erteilt neuen Objekten in
-- public per Voreinstellung ALLE Rechte an anon und authenticated. Die View
-- laeuft ohne security_invoker und gehoert einem Superuser mit BYPASSRLS —
-- Schreibrechte darauf umgehen die RLS vollstaendig.
revoke insert, update, delete, truncate, references, trigger
  on contact_cards from anon, authenticated;
grant select on contact_cards to authenticated;
