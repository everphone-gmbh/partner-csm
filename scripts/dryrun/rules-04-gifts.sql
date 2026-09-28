-- Geschenke (Migration 0036) gegen echte Rollen und die echten Riegel.

set role authenticated;

-- 1. Relationship Manager legen Anlass, Produkt, Absender und Empfänger an.
select as_rm();
insert into gift_occasions (id, name, kind, ship_by) values
  ('d0000000-0000-0000-0000-000000000001', 'Weihnachten Test', 'weihnachten', '2026-12-12'),
  ('d0000000-0000-0000-0000-000000000002', 'Weihnachten Vorjahr', 'weihnachten', null);
insert into gift_products (id, occasion_id, name) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Schokolade'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'Geschenkbox');
insert into gift_senders (id, name, is_c_level) values
  ('f0000000-0000-0000-0000-000000000001', 'Absender Eins', true);
insert into gift_recipients (id, occasion_id, product_id, first_name, last_name, company) values
  ('f1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001', 'Erika', 'Muster', 'Muster GmbH');
insert into gift_recipient_senders values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001');
select assert((select count(*) from gift_recipients) = 1, 'Relationship Manager kann Geschenke planen');

-- 2. Ein Account Manager sieht davon nichts und schreibt nichts.
select as_am();
select assert(
  (select count(*) from gift_recipients) = 0
  and (select count(*) from gift_occasions) = 0
  and (select count(*) from gift_senders) = 0,
  'Account Manager sieht keine Geschenke (Sektion ab RM)');
do $$
begin
  insert into gift_occasions (name) values ('Schmuggel');
  raise exception 'PRUEFUNG GESCHEITERT: AM konnte einen Anlass anlegen';
exception when insufficient_privilege then
  raise notice 'ok — Account Manager kann keine Geschenke anlegen';
end $$;

-- 3. Ein Produkt aus einem anderen Anlass wird abgewiesen.
select as_rm();
do $$
begin
  update gift_recipients set product_id = 'e0000000-0000-0000-0000-000000000002'
    where id = 'f1000000-0000-0000-0000-000000000001';
  raise exception 'PRUEFUNG GESCHEITERT: Produkt eines fremden Anlasses wurde angenommen';
exception when check_violation then
  raise notice 'ok — nur Produkte des eigenen Anlasses';
end $$;

-- 4. Den Zeitpunkt des Status setzt die Datenbank — beim Anlegen bleibt er leer.
select assert(
  (select status_at from gift_recipients where id = 'f1000000-0000-0000-0000-000000000001') is null,
  'ein neu angelegtes Geschenk behauptet keinen Statuszeitpunkt');
update gift_recipients set status = 'versandt' where id = 'f1000000-0000-0000-0000-000000000001';
select assert(
  (select status_at from gift_recipients where id = 'f1000000-0000-0000-0000-000000000001') is not null,
  'ein Statuswechsel setzt den Zeitpunkt');

-- 5. Genau ein Geburtstags-Anlass.
insert into gift_occasions (name, kind) values ('Geburtstage', 'geburtstag');
do $$
begin
  insert into gift_occasions (name, kind) values ('Geburtstage 2', 'geburtstag');
  raise exception 'PRUEFUNG GESCHEITERT: zweiter Geburtstags-Anlass angelegt';
exception when unique_violation then
  raise notice 'ok — es gibt genau einen Geburtstags-Anlass';
end $$;

-- 6. Absender eindeutig, auch bei anderer Schreibweise.
do $$
begin
  insert into gift_senders (name) values ('  absender EINS ');
  raise exception 'PRUEFUNG GESCHEITERT: Absender doppelt angelegt';
exception when unique_violation then
  raise notice 'ok — Absender bleiben eindeutig, egal wie geschrieben';
end $$;

-- 7. Eine Zeile ohne Person und ohne Firma geht nicht.
do $$
begin
  insert into gift_recipients (occasion_id, street) values
    ('d0000000-0000-0000-0000-000000000001', 'Nur eine Straße 1');
  raise exception 'PRUEFUNG GESCHEITERT: Empfänger ohne Namen angenommen';
exception when check_violation then
  raise notice 'ok — jede Zeile nennt eine Person oder Firma';
end $$;

-- 8. Protokoll ohne Werte. Lesen darf das Protokoll seit 0037 nur die Leitung.
select as_admin();
select assert(
  exists (select 1 from audit_log where entity = 'gift_recipient' and action = 'update'
          and detail -> 'fields' ? 'status' and detail::text not like '%versandt%'),
  'Geschenke sind protokolliert, ohne Werte');

-- 9. DSGVO-Löschweg: ein verknüpfter Kontakt lässt sich löschen, seine
--    Geschenkhistorie geht mit — und blockiert das Löschen NICHT.
select as_admin();
reset role;
insert into contacts (id, full_name, region_id) values
  ('c0000000-0000-0000-0000-000000000020', 'Geschenk Kontakt', 'a0000000-0000-0000-0000-000000000001');
insert into gift_recipients (id, occasion_id, contact_id, first_name, last_name) values
  ('f1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000020', 'Geschenk', 'Kontakt');
delete from contacts where id = 'c0000000-0000-0000-0000-000000000020';
select assert(
  not exists (select 1 from gift_recipients where id = 'f1000000-0000-0000-0000-000000000002'),
  'Kontakt loeschbar, seine Geschenkhistorie geht mit (Recht auf Vergessenwerden)');

-- 10. Wird ein Produkt gelöscht, bleibt der Empfänger — ohne Produkt.
delete from gift_products where id = 'e0000000-0000-0000-0000-000000000001';
select assert(
  (select product_id from gift_recipients where id = 'f1000000-0000-0000-0000-000000000001') is null,
  'Produkt loeschen laesst den Empfaenger stehen');
