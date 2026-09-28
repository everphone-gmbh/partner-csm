-- Dubletten zusammenführen (Migration 0038).

\set QUIET on
reset role;
-- Zwei Dubletten W (Gewinner) und L (Verlierer), dazu ein Dritter X.
insert into contacts (id, full_name, region_id) values
  ('c0000000-0000-0000-0000-0000000000a1', 'Dublette W', 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-0000000000a2', 'Dublette L', 'a0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-0000000000a3', 'Dritter X',  'a0000000-0000-0000-0000-000000000001');
insert into activities (id, contact_id, type, occurred_at, author_id, body) values
  ('a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000a2', 'note', now(),
   'b0000000-0000-0000-0000-000000000002', 'Notiz am Verlierer');
insert into reminders (contact_id, due_date, text, created_by_name) values
  ('c0000000-0000-0000-0000-0000000000a2', '2026-12-01', 'Erinnerung am Verlierer', 'Leitung');
insert into contact_photos (contact_id, url) values
  ('c0000000-0000-0000-0000-0000000000a2', 'storage:contact-gallery/c0000000-0000-0000-0000-0000000000a2/bild.jpg');
insert into side_facts (contact_id, label) values
  ('c0000000-0000-0000-0000-0000000000a1', 'Segeln'),
  ('c0000000-0000-0000-0000-0000000000a2', 'segeln '),
  ('c0000000-0000-0000-0000-0000000000a2', 'Golf');
insert into customers (id, name) values
  ('93000000-0000-0000-0000-000000000001', 'Kunde Gemeinsam'),
  ('93000000-0000-0000-0000-000000000002', 'Kunde Nur L');
insert into contact_customers (contact_id, customer_id, with_us) values
  ('c0000000-0000-0000-0000-0000000000a1', '93000000-0000-0000-0000-000000000001', true),
  ('c0000000-0000-0000-0000-0000000000a2', '93000000-0000-0000-0000-000000000001', false),
  ('c0000000-0000-0000-0000-0000000000a2', '93000000-0000-0000-0000-000000000002', true);
insert into event_attendees (event_id, contact_id, status) values
  ('91000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000a1', 'accepted'),
  ('91000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000a2', 'declined');
insert into favorites (profile_id, contact_id) values
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-0000000000a2');
insert into gift_recipients (occasion_id, contact_id, last_name) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000a2', 'Dublette');
insert into contact_links (from_contact_id, to_contact_id, kind) values
  ('c0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a1', 'knows'),
  ('c0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a3', 'reports_to'),
  ('c0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a3', 'reports_to');
\set QUIET off

set role authenticated;

-- 1. Nur die Leitung führt zusammen.
select as_rm();
do $$
begin
  perform merge_contacts('c0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a2');
  raise exception 'PRUEFUNG GESCHEITERT: RM konnte zusammenfuehren';
exception when insufficient_privilege then
  raise notice 'ok — nur die Leitung fuehrt zusammen';
end $$;

-- 2. Die Hintertür bleibt zu: niemand trägt sich selbst einen Merge ein.
select as_am();
do $$
begin
  insert into contact_merges (winner_id, loser_id)
    values ('c0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-0000000000a2');
  raise exception 'PRUEFUNG GESCHEITERT: Merge-Eintrag von Hand moeglich';
exception when insufficient_privilege then
  raise notice 'ok — Merge-Eintraege kann nur die Funktion schreiben';
end $$;

-- 3. Die Leitung führt zusammen.
select as_admin();
select merge_contacts(
  'c0000000-0000-0000-0000-0000000000a1',
  'c0000000-0000-0000-0000-0000000000a2',
  '{"storage:contact-gallery/c0000000-0000-0000-0000-0000000000a2/bild.jpg":
    "storage:contact-gallery/c0000000-0000-0000-0000-0000000000a1/bild.jpg"}'::jsonb
);

reset role;
select assert(not exists (select 1 from contacts where id = 'c0000000-0000-0000-0000-0000000000a2'),
  'der Verlierer ist geloescht');
select assert(
  (select contact_id from activities where id = 'a1000000-0000-0000-0000-000000000001')
    = 'c0000000-0000-0000-0000-0000000000a1',
  'die Aktivitaet ist beim Gewinner — trotz Riegel aus 0034');
select assert(exists (select 1 from reminders where contact_id = 'c0000000-0000-0000-0000-0000000000a1'),
  'der Reminder ist beim Gewinner');
select assert(
  (select url from contact_photos where contact_id = 'c0000000-0000-0000-0000-0000000000a1')
    = 'storage:contact-gallery/c0000000-0000-0000-0000-0000000000a1/bild.jpg',
  'das Galeriefoto ist beim Gewinner und zeigt auf die Kopie in seinem Ordner');
select assert(
  (select count(*) from side_facts where contact_id = 'c0000000-0000-0000-0000-0000000000a1') = 2,
  'Anknuepfungspunkte zusammengelegt, „Segeln" nur einmal');
select assert(
  (select count(*) from contact_customers where contact_id = 'c0000000-0000-0000-0000-0000000000a1') = 2
  and (select with_us from contact_customers
       where contact_id = 'c0000000-0000-0000-0000-0000000000a1'
         and customer_id = '93000000-0000-0000-0000-000000000001'),
  'Kunden vereint, beim gemeinsamen gilt der Wert des Gewinners');
select assert(
  (select count(*) from contact_regions where contact_id = 'c0000000-0000-0000-0000-0000000000a1') = 2,
  'die Gebiete beider Dubletten gelten fuer den Gewinner');
select assert(
  (select status::text from event_attendees
    where contact_id = 'c0000000-0000-0000-0000-0000000000a1'
      and event_id = '91000000-0000-0000-0000-000000000001') = 'accepted',
  'bei doppelter Event-Teilnahme gilt die des Gewinners');
select assert(exists (select 1 from favorites where contact_id = 'c0000000-0000-0000-0000-0000000000a1'),
  'Favoriten ziehen mit um');
select assert(exists (select 1 from gift_recipients where contact_id = 'c0000000-0000-0000-0000-0000000000a1'),
  'Geschenke ziehen mit um');
select assert(
  not exists (select 1 from contact_links where from_contact_id = to_contact_id)
  and (select count(*) from contact_links where from_contact_id = 'c0000000-0000-0000-0000-0000000000a1'
         and to_contact_id = 'c0000000-0000-0000-0000-0000000000a3' and kind = 'reports_to') = 1,
  'Verknuepfungen umgehaengt, keine Selbstverweise, keine Doppel');
select assert(
  exists (select 1 from contact_merges where winner_id = 'c0000000-0000-0000-0000-0000000000a1'
            and loser_id = 'c0000000-0000-0000-0000-0000000000a2'),
  'der Vorgang ist belegt');

-- 4. Die Ausnahme gilt nur für die eingetragene Richtung: vom Gewinner weg
--    zu einem Dritten bleibt verboten.
set role authenticated;
select as_admin();
do $$
begin
  update activities set contact_id = 'c0000000-0000-0000-0000-0000000000a3'
    where id = 'a1000000-0000-0000-0000-000000000001';
  raise exception 'PRUEFUNG GESCHEITERT: Aktivitaet liess sich weiterschieben';
exception when insufficient_privilege then
  raise notice 'ok — ausserhalb eines Zusammenfuehrens bleibt das Verschieben verboten';
end $$;
