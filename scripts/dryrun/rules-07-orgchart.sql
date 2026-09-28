-- Organigramm (Migration 0039). Der Neubau von contact_cards darf nichts von
-- dem verlieren, was 0035 hineingebaut hat — Zeilenfilter, Gebietsliste,
-- Schreibsperre.

set role authenticated;

-- 1. Relationship Manager ordnen ein.
select as_rm();
update contacts set hierarchy_level = 'management', additional_companies = array['Zweitfirma GmbH']
  where id = 'c0000000-0000-0000-0000-000000000001';
select as_admin();
select assert(
  (select hierarchy_level::text from contacts where id = 'c0000000-0000-0000-0000-000000000001') = 'management'
  and (select additional_companies from contacts where id = 'c0000000-0000-0000-0000-000000000001')
      = array['Zweitfirma GmbH'],
  'Relationship Manager setzt Ebene und weitere Firma');

-- 2. Account Manager sehen die Ebene (Geschäftsdatum, nicht redigiert) …
select as_am();
select assert(
  (select hierarchy_level::text from contact_cards where id = 'c0000000-0000-0000-0000-000000000001') = 'management',
  'Account Manager sieht die Ebene im Organigramm');
-- … aber ändern sie nicht (contacts_update ist RM+, die Policy filtert still).
update contacts set hierarchy_level = 'assistant' where id = 'c0000000-0000-0000-0000-000000000001';
select as_admin();
select assert(
  (select hierarchy_level::text from contacts where id = 'c0000000-0000-0000-0000-000000000001') = 'management',
  'Account Manager kann die Ebene nicht aendern');

-- 3. Was 0035 gebaut hat, steht noch: Zeilenfilter und Gebietsliste.
select as_am();
select assert(
  (select count(*) from contact_cards where id = 'c0000000-0000-0000-0000-000000000002') = 0,
  'der Zeilenfilter der View greift nach dem Neubau weiter');
select assert(
  (select array_length(region_ids, 1) from contact_cards where id = 'c0000000-0000-0000-0000-000000000001') >= 1,
  'region_ids ist nach dem Neubau noch da');

-- 4. Die Schreibsperre auf der View ist nach dem Neubau wieder gesetzt.
do $$
begin
  update contact_cards set full_name = 'Schmuggel' where id = 'c0000000-0000-0000-0000-000000000001';
  raise exception 'PRUEFUNG GESCHEITERT: contact_cards nach Neubau beschreibbar';
exception when insufficient_privilege then
  raise notice 'ok — contact_cards bleibt nach dem Neubau nur lesbar';
end $$;
