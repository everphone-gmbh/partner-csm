-- Organigramm je Region (Feedback-Runde 2026-09-03, Punkte 5 und 8b)
--
-- Eine Seite je Region, die die Kontakte als Organigramm zeigt. Dafür braucht
-- jeder Kontakt eine EBENE — die Linien kommen aus der vorhandenen Verknüpfung
-- „berichtet an", aber wer keinen Vorgesetzten im Tool hat, wird über seine
-- Ebene eingeordnet. Die fünf Ebenen hat Jannik am 03.09. festgelegt.
--
-- Dazu die „weitere Firma": in Sonderfällen arbeitet jemand für zwei Firmen
-- (gestrichelte Verbindung im Organigramm). Opt-in in der Oberfläche, im
-- Datenmodell eine Liste — bewusst keine eigene Tabelle, es sind Namen, keine
-- Verweise.
--
-- Beides sind Geschäftsdaten wie Funktion und Team, NICHT sensibel: sie stehen
-- in contact_cards außerhalb des is_privileged()-Blocks, und
-- SENSITIVE_CONTACT_FIELDS bleibt unverändert.
--
-- Ursprünglich war ein Mockup vor dem Bau vereinbart; auf Janniks Anweisung vom
-- 28.09. direkt gebaut, Feedback kommt im Betrieb.

create type hierarchy_level as enum (
  'top_management',
  'executive',
  'management',
  'specialist',
  'assistant'
);

alter table contacts add column hierarchy_level hierarchy_level;
alter table contacts add column additional_companies text[] not null default '{}';

comment on column contacts.hierarchy_level is
  'Ebene im Organigramm: Top-Management, Executive, Management, Fachebene, Assistenz. NULL = noch nicht eingeordnet.';

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
    -- Organigramm (0039): Geschäftsdaten, bewusst NICHT im redigierten Block.
    c.hierarchy_level,
    c.additional_companies,
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

-- PFLICHT nach jedem View-Neubau (0023): Supabase erteilt neuen Objekten in
-- public per Voreinstellung ALLE Rechte an anon und authenticated. Die View
-- laeuft ohne security_invoker und gehoert einem Superuser mit BYPASSRLS —
-- Schreibrechte darauf umgehen die RLS vollstaendig.
revoke insert, update, delete, truncate, references, trigger
  on contact_cards from anon, authenticated;
grant select on contact_cards to authenticated;
