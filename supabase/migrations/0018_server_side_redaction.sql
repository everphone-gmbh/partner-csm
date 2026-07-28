-- Serverseitige Feld-Redaktion für den Account-Manager-Tier (Audit F-1/F-3)
--
-- Bisher filterte NUR der Client (domain/roles.ts). Über die API bekam ein
-- Account Manager Geburtstag, Familienstand, Kinder, Haustiere, Privatnotiz,
-- Anknüpfungspunkte und Aktivitäts-Rohtexte vollständig geliefert — mit dem
-- anon-Key aus dem Bundle nachprüfbar. Das ist der DSGVO-Blocker.
--
-- Ansatz: Basistabellen werden für Lesezugriffe privilegiert (RM+), alle
-- Lesezugriffe der App laufen über zwei Views, die sensible Spalten für
-- unprivilegierte Rollen auf NULL setzen. Die Views tragen die Zeilen-
-- einschränkung selbst, weil sie ohne security_invoker laufen (sonst käme der
-- Aufrufer nicht an die Basistabelle).
--
-- Gespiegelt wird genau SENSITIVE_CONTACT_FIELDS aus src/domain/roles.ts:
--   birthday, location, family_status, children, pets, free_text,
--   active_devices  → Spalten (hier)
--   side_facts      → eigene Tabelle, jetzt privilegiert
--   gallery/photos  → schon privilegiert seit 0008
-- Dazu activities.body (canViewActivityBody): AM sieht nur die KI-Zusammenfassung.

-- ---------------------------------------------------------------------------
-- 1. Sichtbarkeitsprüfung als SECURITY DEFINER
--
-- Mehrere Policies prüfen „darf ich diesen Kontakt sehen?" per Unterabfrage
-- auf contacts. Sobald contacts nur noch privilegiert lesbar ist, liefern
-- diese Unterabfragen für AMs false — Reminder, Event-Teilnahmen und
-- Verknüpfungen wären für sie tot. Die Prüfung wandert deshalb in eine
-- Funktion, die die Zeilenprüfung ohne RLS ausführt.
-- ---------------------------------------------------------------------------
create or replace function can_see_contact(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from contacts c
    where c.id = cid
      and (is_privileged() or c.region_id = auth_region())
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. Abhängige Policies auf die Funktion umstellen (Verhalten unverändert)
-- ---------------------------------------------------------------------------
drop policy contact_customers_read on contact_customers;
create policy contact_customers_read on contact_customers for select
  using (can_see_contact(contact_id));

drop policy contact_links_read on contact_links;
create policy contact_links_read on contact_links for select
  using (can_see_contact(from_contact_id) or can_see_contact(to_contact_id));

drop policy event_attendees_rw on event_attendees;
create policy event_attendees_rw on event_attendees for all
  using (can_see_contact(contact_id))
  with check (can_see_contact(contact_id));

drop policy reminders_rw on reminders;
create policy reminders_rw on reminders for all
  using (can_see_contact(contact_id))
  with check (can_see_contact(contact_id));

drop policy attachments_rw on attachments;
create policy attachments_rw on attachments for all
  using (exists (
    select 1 from activities a
    where a.id = attachments.activity_id and can_see_contact(a.contact_id)
  ))
  with check (exists (
    select 1 from activities a
    where a.id = attachments.activity_id and can_see_contact(a.contact_id)
  ));

-- ---------------------------------------------------------------------------
-- 3. Basistabellen: Lesen nur noch privilegiert
--    (Schreiben war bereits privilegiert — 0008.)
-- ---------------------------------------------------------------------------
drop policy contacts_read on contacts;
create policy contacts_read on contacts for select using (is_privileged());

drop policy activities_read on activities;
create policy activities_read on activities for select using (is_privileged());

-- Anknüpfungspunkte sind Hobbys/Familie/Sport — inhaltlich sensibel.
drop policy side_facts_read on side_facts;
create policy side_facts_read on side_facts for select using (is_privileged());

-- ---------------------------------------------------------------------------
-- 4. Lese-Views mit Feld-Redaktion
--
-- ⚠ Beide Views laufen OHNE security_invoker, umgehen also die RLS der
--    Basistabelle. Die Zeileneinschränkung im WHERE ist damit der einzige
--    Schutz gegen mandantenweites Lesen — nicht entfernen.
-- ---------------------------------------------------------------------------
drop view if exists contact_cards;
create view contact_cards as
  select
    c.id,
    c.full_name,
    c.position,
    c.photo_url,
    c.region_id,
    c.relationship_manager_id,
    c.company,
    c.team,
    c.email,
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
    -- Ab hier: personenbezogen, nur für RM+ (siehe roles.ts).
    case when is_privileged() then c.birthday       else null end as birthday,
    case when is_privileged() then c.location       else null end as location,
    case when is_privileged() then c.family_status  else null end as family_status,
    case when is_privileged() then c.children       else null end as children,
    case when is_privileged() then c.pets           else null end as pets,
    case when is_privileged() then c.free_text      else null end as free_text,
    case when is_privileged() then c.active_devices else null end as active_devices
  from contacts c
  where is_privileged() or c.region_id = auth_region();

create view activity_cards as
  select
    a.id,
    a.contact_id,
    a.type,
    a.occurred_at,
    a.author_id,
    a.ai_summary,
    -- Rohtext nur für RM+; der AM-Tier sieht die KI-Zusammenfassung.
    case when is_privileged() then a.body else null end as body
  from activities a
  where can_see_contact(a.contact_id);

grant select on contact_cards to authenticated;
grant select on activity_cards to authenticated;
