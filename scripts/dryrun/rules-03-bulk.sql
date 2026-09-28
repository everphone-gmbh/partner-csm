-- Massenzuordnung „ersetzen" / „hinzufuegen" (Oberflaeche seit 28.09.) gegen die
-- echten Trigger aus 0035. Der Adapter fuehrt „ersetzen" in zwei Schritten aus:
-- erst contacts.region_id setzen (der Trigger legt die Mitgliedschaft an), dann
-- die uebrigen Gebiete entfernen. Hier laeuft genau diese Folge.

\set QUIET on
insert into regions (id, name) values
  ('a0000000-0000-0000-0000-000000000003','Gebiet Ost');
insert into contacts (id, full_name, region_id) values
  ('c0000000-0000-0000-0000-000000000010','Masse Eins','a0000000-0000-0000-0000-000000000001');
insert into contact_regions (contact_id, region_id) values
  ('c0000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000002');
\set QUIET off

set role authenticated;
select as_admin();

-- 1. Ersetzen: region_id auf Ost, dann Sued und West entfernen.
update contacts set region_id = 'a0000000-0000-0000-0000-000000000003'
  where id = 'c0000000-0000-0000-0000-000000000010';
delete from contact_regions
  where contact_id = 'c0000000-0000-0000-0000-000000000010'
    and region_id in ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002');
select assert(
  (select array_agg(region_id) from contact_regions
    where contact_id = 'c0000000-0000-0000-0000-000000000010')
    = array['a0000000-0000-0000-0000-000000000003'::uuid]
  and (select region_id from contacts where id = 'c0000000-0000-0000-0000-000000000010')
    = 'a0000000-0000-0000-0000-000000000003',
  '„ersetzen" hinterlaesst genau das neue Gebiet, fuehrend und als einzige Zuordnung');

-- 2. Hinzufuegen: nur eine Zuordnung dazu, region_id bleibt.
insert into contact_regions (contact_id, region_id) values
  ('c0000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001');
select assert(
  (select count(*) from contact_regions where contact_id = 'c0000000-0000-0000-0000-000000000010') = 2
  and (select region_id from contacts where id = 'c0000000-0000-0000-0000-000000000010')
    = 'a0000000-0000-0000-0000-000000000003',
  '„hinzufuegen" laesst das fuehrende Gebiet stehen');

-- 3. Ein Relationship Manager darf massenweise zuordnen (contacts_update ist RM+).
reset role;
update profiles set role = 'sub_admin' where id = 'b0000000-0000-0000-0000-000000000003';
set role authenticated;
select as_rm();
update contacts set region_id = 'a0000000-0000-0000-0000-000000000001'
  where id = 'c0000000-0000-0000-0000-000000000010';
select as_admin();
select assert(
  (select region_id from contacts where id = 'c0000000-0000-0000-0000-000000000010')
    = 'a0000000-0000-0000-0000-000000000001',
  'Relationship Manager kann das fuehrende Gebiet umsetzen');

-- 4. Ein Account Manager nicht — die Policy filtert still auf 0 Zeilen.
select as_am();
update contacts set region_id = 'a0000000-0000-0000-0000-000000000003'
  where id = 'c0000000-0000-0000-0000-000000000010';
select as_admin();
select assert(
  (select region_id from contacts where id = 'c0000000-0000-0000-0000-000000000010')
    = 'a0000000-0000-0000-0000-000000000001',
  'Account Manager kann keine Gebiete umsetzen');
