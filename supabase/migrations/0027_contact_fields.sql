-- Weitere Stammdaten-Felder (freigegeben Lennart-Meeting 2026-08-06)
--
-- Ergänzt die üblichen Kontaktfelder, die in den Stammdaten noch fehlten. Muster
-- wie 0025 (Telefonfelder): Spalten anlegen, Lese-View contact_cards neu bauen,
-- danach die Schreibrechte erneut entziehen.
--
-- Stufung (muss mit SENSITIVE_CONTACT_FIELDS in src/domain/roles.ts
-- übereinstimmen — sonst filtert nur eine der beiden Ebenen):
--   phone_direct, business_address, assistant_name, assistant_contact,
--   social_links  → Geschäftsdaten, sichtbar wie die E-Mail (auch Account Manager)
--   email_private → Privatsphäre, nur privilegiert (wie birthday/phone_private)
--
-- Entscheidung zur Anschrift (Jannik 2026-08-06): es ist die DIENSTanschrift,
-- also ein Geschäftsdatum — bewusst NICHT sensibel.

alter table contacts
  add column phone_direct      text,
  add column email_private     text,
  add column business_address  text,
  add column assistant_name    text,
  add column assistant_contact text,
  add column social_links      jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Lese-View neu bauen. ⚠ Wie in 0025 zwei Dinge, die hier leicht verloren gehen:
-- 1. Der WHERE-Filter ist der EINZIGE Schutz gegen mandantenweites Lesen
--    (die View läuft ohne security_invoker, 0018). Nicht entfernen.
-- 2. `create view` vergibt die Default-Privilegien neu → danach erneut revoke
--    der Schreibrechte (0023), sonst ist die View für anon/authenticated
--    beschreibbar und umgeht die RLS.
-- ---------------------------------------------------------------------------
drop view contact_cards;

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
    c.phone_work,
    c.phone_mobile,
    -- Neu (0027), geschäftlich — gleiche Stufe wie die E-Mail:
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
    -- Ab hier personenbezogen, nur für RM+ (siehe roles.ts):
    case when is_privileged() then c.birthday       else null end as birthday,
    case when is_privileged() then c.location       else null end as location,
    case when is_privileged() then c.family_status  else null end as family_status,
    case when is_privileged() then c.children       else null end as children,
    case when is_privileged() then c.pets           else null end as pets,
    case when is_privileged() then c.free_text      else null end as free_text,
    case when is_privileged() then c.active_devices else null end as active_devices,
    case when is_privileged() then c.phone_private  else null end as phone_private,
    -- Neu (0027), privat — nur privilegiert (wie phone_private):
    case when is_privileged() then c.email_private  else null end as email_private
  from contacts c
  where is_privileged() or c.region_id = auth_region();

revoke insert, update, delete, truncate, references, trigger
  on contact_cards from anon, authenticated;
