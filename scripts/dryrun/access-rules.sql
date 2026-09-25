-- Zugriffsregeln gegen echte Rollen prüfen.
--
-- Die Vitest-Suite kann das nicht: `fakeSupabase` kennt keine Sitzung, keine
-- Rollen und keine RLS (siehe CLAUDE.local.md, „Offene Schwachstellen"). Hier
-- läuft es gegen ein echtes Postgres mit `set role authenticated` und gesetztem
-- `auth.uid()` — also über dieselben Policies wie die Produktion.
--
-- Bricht eine Prüfung, bricht das Skript (ON_ERROR_STOP + assert).

\set QUIET on

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant select, insert, update, delete on contacts, contact_regions, activities to authenticated;
-- Die Views bleiben nur lesbar (Invariante aus 0023).
revoke insert, update, delete on contact_cards, activity_cards from authenticated;

insert into regions (id, name) values
  ('a0000000-0000-0000-0000-000000000001','Gebiet Sued'),
  ('a0000000-0000-0000-0000-000000000002','Gebiet West');
insert into auth.users (id) values
  ('b0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002');
insert into profiles (id, full_name, role, region_id) values
  ('b0000000-0000-0000-0000-000000000001','Leitung','overall_admin',null),
  ('b0000000-0000-0000-0000-000000000002','AM West','account_manager','a0000000-0000-0000-0000-000000000002');
insert into contacts (id, full_name, region_id) values
  ('c0000000-0000-0000-0000-000000000001','Assistenz zwei Gebiete','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002','Nur Sued','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003','Nur West','a0000000-0000-0000-0000-000000000002');

create or replace function assert(ok boolean, what text) returns void
  language plpgsql as $$
begin
  if not ok then raise exception 'PRUEFUNG GESCHEITERT: %', what; end if;
  raise notice 'ok — %', what;
end $$;

-- Als Account Manager West anmelden.
create or replace function as_am() returns void language sql as $$
  select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',false)::void
$$;
create or replace function as_admin() returns void language sql as $$
  select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',false)::void
$$;

\set QUIET off

set role authenticated;

-- 0. Ein NEU angelegter Kontakt bekommt seine Zuordnung automatisch. Ohne das
--    waere er fuer jeden Account Manager unsichtbar — genau dieser Fehler steckte
--    im ersten Entwurf von 0035 und ist hier nur aufgefallen, weil die Kontakte
--    oben NACH der Migration angelegt wurden.
select assert(
  (select count(*) from contacts c
   where not exists (select 1 from contact_regions cr where cr.contact_id = c.id)) = 0,
  'jeder Kontakt hat eine Gebietszuordnung, auch ein nach der Migration angelegter');

-- 1. Ausgangslage: der AM sieht nur sein eigenes Gebiet.
select as_am();
select assert(
  (select count(*) from contact_cards) = 1 and
  (select full_name from contact_cards) = 'Nur West',
  'AM sieht vor der Zweitzuordnung nur den Kontakt seines Gebiets');

-- 2. Die Leitung gibt der Assistenz ein zweites Gebiet.
select as_admin();
insert into contact_regions (contact_id, region_id)
  values ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002');

-- 3. Damit ist sie fuer den AM sichtbar — der Kern der Aenderung.
select as_am();
select assert(
  exists (select 1 from contact_cards where full_name = 'Assistenz zwei Gebiete'),
  'AM sieht den Kontakt nach der Zweitzuordnung');

-- 4. Das fuehrende Gebiet bleibt, die Liste traegt beide.
select as_admin();
select assert(
  (select region_id from contacts where id='c0000000-0000-0000-0000-000000000001')
    = 'a0000000-0000-0000-0000-000000000001'
  and (select array_length(region_ids,1) from contact_cards
       where id='c0000000-0000-0000-0000-000000000001') = 2,
  'fuehrendes Gebiet unveraendert, region_ids enthaelt beide');

-- 5. Das letzte Gebiet laesst sich nicht entfernen (region_id ist NOT NULL).
do $$
begin
  delete from contact_regions where contact_id='c0000000-0000-0000-0000-000000000002';
  raise exception 'PRUEFUNG GESCHEITERT: letztes Gebiet war entfernbar';
exception when not_null_violation then
  raise notice 'ok — letztes Gebiet laesst sich nicht entfernen';
end $$;

-- 6. Wird das fuehrende Gebiet entfernt, rueckt das andere nach.
delete from contact_regions
  where contact_id='c0000000-0000-0000-0000-000000000001'
    and region_id='a0000000-0000-0000-0000-000000000001';
select assert(
  (select region_id from contacts where id='c0000000-0000-0000-0000-000000000001')
    = 'a0000000-0000-0000-0000-000000000002',
  'nach Entfernen des fuehrenden Gebiets rueckt das verbliebene nach');

-- 7. Ein Account Manager darf Gebiete nicht vergeben.
select as_am();
do $$
begin
  insert into contact_regions values
    ('c0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001');
  raise exception 'PRUEFUNG GESCHEITERT: AM konnte ein Gebiet vergeben';
exception when insufficient_privilege then
  raise notice 'ok — AM darf keine Gebiete vergeben';
end $$;

-- 8. Die Views bleiben unbeschreibbar (0023 — sonst laeuft ein INSERT an der
--    RLS vorbei, mit dem oeffentlich ausgelieferten anon-Schluessel).
do $$
begin
  insert into contact_cards (id, full_name, region_id)
    values (gen_random_uuid(),'Schmuggel','a0000000-0000-0000-0000-000000000002');
  raise exception 'PRUEFUNG GESCHEITERT: contact_cards war beschreibbar';
exception when insufficient_privilege then
  raise notice 'ok — contact_cards bleibt nur lesbar';
end $$;

-- 9. Beim nun sichtbaren Kontakt darf der AM eine Notiz anlegen
--    (activities_insert prueft ueber can_see_contact).
insert into activities (contact_id, type, occurred_at, author_id, body)
  values ('c0000000-0000-0000-0000-000000000001','note',now(),
          'b0000000-0000-0000-0000-000000000002','Notiz aus dem zweiten Gebiet');
select assert(true, 'AM kann beim zweitzugeordneten Kontakt eine Notiz anlegen');

-- 10. Der Loeschweg nach DSGVO bleibt offen: die Kaskade raeumt die Gebiete mit
--     ab, ohne an der Regel „mindestens ein Gebiet" haengenzubleiben.
select as_admin();
reset role;
delete from contacts where id='c0000000-0000-0000-0000-000000000003';
select assert(
  not exists (select 1 from contacts where id='c0000000-0000-0000-0000-000000000003')
  and not exists (
    select 1 from contact_regions cr
    where not exists (select 1 from contacts c where c.id = cr.contact_id)),
  'Kontakt loeschbar, keine verwaisten Zuordnungen');

\echo 'Alle Zugriffspruefungen bestanden.'
