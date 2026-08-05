-- Telefonnummern als eigene Felder
--
-- Bisher gab es keine Telefonspalte. Die Nummern kamen beim Import trotzdem mit
-- und landeten im Freitextfeld (in der Oberfläche „Privatnotiz"), Muster:
--   Tel: +49…; Mobil: +49…; SF-Owner: <Name>; Quelle: Salesforce, Import …
-- Bei rund 330 der 671 Kontakte. Die Datenschutz-Unterlagen führen das als
-- Strukturmangel: Kontaktdaten in einem Feld der höchsten Schutzstufe, dadurch
-- für Account Manager unsichtbar, obwohl eine Dienstnummer Geschäftsdatum ist.
--
-- Diese Migration legt drei Felder an, holt die Bestandsnummern heraus und
-- staffelt die Sichtbarkeit:
--   phone_work, phone_mobile → Geschäftsdaten, sichtbar wie die E-Mail
--   phone_private            → Privatsphäre, nur privilegiert (wie birthday)

alter table contacts
  add column phone_work    text,
  add column phone_mobile  text,
  add column phone_private text;

-- Bestandsnummern aus dem Freitextfeld übernehmen. Das Freitextfeld selbst
-- bleibt vorerst unverändert — das Herausschneiden dort ist ein eigener,
-- prüfbarer Schritt, sobald die neuen Felder in der Oberfläche bestätigt sind.
update contacts
set phone_work = btrim(substring(free_text from 'Tel:\s*([^;]+)'))
where phone_work is null
  and free_text ~ 'Tel:\s*[^;]+';

update contacts
set phone_mobile = btrim(substring(free_text from 'Mobil:\s*([^;]+)'))
where phone_mobile is null
  and free_text ~ 'Mobil:\s*[^;]+';

-- ---------------------------------------------------------------------------
-- Lese-View neu aufbauen
--
-- ⚠ Zwei Dinge, die hier leicht verloren gehen:
--
-- 1. Die Zeileneinschränkung im WHERE ist der EINZIGE Schutz gegen
--    mandantenweites Lesen, weil die View ohne security_invoker läuft (0018).
--    Nicht entfernen.
-- 2. `create view` vergibt die Default-Privilegien neu. 0023 hatte anon und
--    authenticated die Schreibrechte ausdrücklich entzogen, weil über die
--    beschreibbare View an der RLS vorbei geschrieben werden konnte. Nach dem
--    Neuanlegen muss der Entzug deshalb erneut gesetzt werden.
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
    -- Dienstliche Erreichbarkeit: gleiche Stufe wie die E-Mail.
    c.phone_work,
    c.phone_mobile,
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
    case when is_privileged() then c.active_devices else null end as active_devices,
    case when is_privileged() then c.phone_private  else null end as phone_private
  from contacts c
  where is_privileged() or c.region_id = auth_region();

revoke insert, update, delete, truncate, references, trigger
  on contact_cards from anon, authenticated;
