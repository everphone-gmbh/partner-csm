-- Auswertungen serverseitig gesperrt (Migration 0037).

\set QUIET on
reset role;
insert into org_units (id, company, department, team, note) values
  ('90000000-0000-0000-0000-000000000001', 'Telekom', 'Vertrieb Sued', 'Team A', 'interne Notiz');
insert into events (id, name, event_date) values
  ('91000000-0000-0000-0000-000000000001', 'Testmesse', '2026-10-01');
insert into event_attendees (event_id, contact_id, status) values
  ('91000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'invited');
insert into event_guests (id, event_id, name) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Gast Eins');
\set QUIET off

set role authenticated;

-- 1. Änderungsprotokoll nur für die Leitung.
select as_rm();
select assert((select count(*) from audit_log) = 0, 'Relationship Manager liest das Aenderungsprotokoll nicht mehr');
select as_admin();
select assert((select count(*) from audit_log) > 0, 'die Leitung liest das Aenderungsprotokoll');

-- 2. Telekom-Struktur: Tabelle nur Leitung, Namen für RM über die Funktion.
select as_rm();
select assert((select count(*) from org_units) = 0, 'Relationship Manager liest die Struktur-Tabelle nicht');
select assert(
  exists (select 1 from org_unit_names() where team = 'Team A'),
  'Relationship Manager bekommt die Namen fuer die Vorschlaege');
select as_am();
select assert((select count(*) from org_unit_names()) = 0, 'Account Manager bekommt auch keine Namen');
select as_admin();
select assert(
  (select note from org_units where id = '90000000-0000-0000-0000-000000000001') = 'interne Notiz',
  'die Leitung liest die Struktur samt Notiz');

-- 3. Struktur pflegen: nur die Leitung. Als RM filtert die Policy still.
select as_rm();
update org_units set team = 'Geaendert' where id = '90000000-0000-0000-0000-000000000001';
do $$
begin
  insert into org_units (company, department) values ('Telekom', 'Neu durch RM');
  raise exception 'PRUEFUNG GESCHEITERT: RM konnte eine Einheit anlegen';
exception when insufficient_privilege then
  raise notice 'ok — Relationship Manager kann keine Einheit anlegen';
end $$;
select as_admin();
select assert(
  (select team from org_units where id = '90000000-0000-0000-0000-000000000001') = 'Team A',
  'Relationship Manager kann die Struktur nicht aendern');
update org_units set team = 'Team B' where id = '90000000-0000-0000-0000-000000000001';
select assert(
  (select team from org_units where id = '90000000-0000-0000-0000-000000000001') = 'Team B',
  'die Leitung pflegt die Struktur');

-- 4. Event-Teilnehmer: AM liest in seiner Region, schreibt nicht mehr.
--    (Kontakt …001 liegt seit rules-01 auch im Gebiet des AM.)
select as_am();
select assert((select count(*) from event_attendees) = 1, 'Account Manager sieht die Teilnehmer seiner Region');
update event_attendees set status = 'accepted'
  where event_id = '91000000-0000-0000-0000-000000000001';
select as_admin();
select assert(
  (select status::text from event_attendees where event_id = '91000000-0000-0000-0000-000000000001') = 'invited',
  'Account Manager kann Teilnehmer nicht mehr aendern');
select as_rm();
update event_attendees set status = 'accepted'
  where event_id = '91000000-0000-0000-0000-000000000001';
select assert(
  (select status::text from event_attendees where event_id = '91000000-0000-0000-0000-000000000001') = 'accepted',
  'Relationship Manager pflegt Teilnehmer');

-- 5. Event-Gäste: AM liest, schreibt nicht; RM schreibt.
select as_am();
select assert((select count(*) from event_guests) = 1, 'Account Manager sieht die Gaeste');
do $$
begin
  insert into event_guests (event_id, name) values ('91000000-0000-0000-0000-000000000001', 'Schmuggel');
  raise exception 'PRUEFUNG GESCHEITERT: AM konnte einen Gast anlegen';
exception when insufficient_privilege then
  raise notice 'ok — Account Manager kann keine Gaeste mehr anlegen';
end $$;
select as_rm();
insert into event_guests (event_id, name) values ('91000000-0000-0000-0000-000000000001', 'Gast Zwei');
select assert((select count(*) from event_guests) = 2, 'Relationship Manager legt Gaeste an');
