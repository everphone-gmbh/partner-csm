-- Neue Konten (Migration 0040) gegen echte Rollen.
--
-- Ein Konto, das sich per Google selbst registriert, hat eine Sitzung, aber kein
-- Profil. Es darf nichts sehen und nichts anlegen, bis die Leitung es
-- freischaltet. Und nur everphone.de-Adressen kommen ueberhaupt hinein.
--
-- Baut auf rules-01/02 auf: Leitung (…001), AM West (…002), RM Sued (…003).

\set QUIET on
-- Je eine Zeile in allem, was bisher „angemeldet" genuegte — sonst bewiese
-- „0 Zeilen" nichts.
insert into events (id, name, event_date) values
  ('e8000000-0000-0000-0000-000000000001', 'Pruefevent', current_date);
insert into event_guests (event_id, name) values
  ('e8000000-0000-0000-0000-000000000001', 'Gast Pruefung');
insert into customers (name) values ('Kunde Pruefung');
insert into everphone_accounts (salesforce_id, name, name_normalized, account_type) values
  ('SF-PRUEF-1', 'Pruefkonto', 'pruefkonto', 'Customer');
insert into intro_requests (id, text, created_by, created_by_name) values
  ('18000000-0000-0000-0000-000000000001', 'Pruefwunsch', 'b0000000-0000-0000-0000-000000000001', 'Leitung');

insert into auth.users (id, email, raw_user_meta_data) values
  ('b0000000-0000-0000-0000-000000000080', 'neu.kollegin@everphone.de', '{"full_name": "Neu Kollegin"}'),
  ('b0000000-0000-0000-0000-000000000081', 'ohne.name@everphone.de', '{}');
create or replace function as_pending() returns void language sql as $$
  select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000080',false)::void
$$;
\set QUIET off

-- 1. Fremde Adressen legen kein Konto an — auch nicht ueber die Admin-API.
do $$
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'jemand@gmail.com');
  raise exception 'PRUEFUNG GESCHEITERT: fremde Adresse konnte ein Konto anlegen';
exception when insufficient_privilege then
  raise notice 'ok — nur everphone.de legt Konten an';
end $$;
do $$
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'jemand@everphone.de.example.com');
  raise exception 'PRUEFUNG GESCHEITERT: aehnliche Domain wurde akzeptiert';
exception when insufficient_privilege then
  raise notice 'ok — auch keine Domain, die nur so aussieht';
end $$;

set role authenticated;

-- 2. Ohne Profil ist nichts sichtbar, was vorher „angemeldet" genuegte.
select as_pending();
select assert((select count(*) from events) = 0, 'Wartendes Konto sieht keine Events');
select assert((select count(*) from event_guests) = 0, 'Wartendes Konto sieht keine Event-Gaeste');
select assert((select count(*) from customers) = 0, 'Wartendes Konto sieht keine Kundenliste');
select assert((select count(*) from everphone_accounts) = 0, 'Wartendes Konto sieht keine Everphone-Accounts');
select assert((select count(*) from intro_requests) = 0, 'Wartendes Konto sieht keine Vorstellungswuensche');
select assert((select count(*) from partners) = 0, 'Wartendes Konto sieht keine Partner');
select assert((select count(*) from regions) = 0, 'Wartendes Konto sieht keine Regionen');
select assert((select count(*) from profiles) = 0, 'Wartendes Konto sieht keine Konten');

-- 3. … und fuer die, die eine Rolle haben, bleibt alles lesbar.
select as_am();
select assert((select count(*) from events) > 0 and (select count(*) from regions) > 0
              and (select count(*) from customers) > 0 and (select count(*) from event_guests) > 0,
  'Account Manager sehen Events, Gaeste, Kunden und Regionen weiter');

-- 4. Ohne Profil nichts anlegen oder aendern.
select as_pending();
do $$
begin
  insert into events (name, event_date) values ('Fremdevent', current_date);
  raise exception 'PRUEFUNG GESCHEITERT: wartendes Konto konnte ein Event anlegen';
exception when insufficient_privilege then
  raise notice 'ok — kein Event ohne Rolle';
end $$;
do $$
begin
  insert into intro_requests (text, created_by_name, created_by) values ('x', 'x', auth.uid());
  raise exception 'PRUEFUNG GESCHEITERT: wartendes Konto konnte einen Vorstellungswunsch anlegen';
exception when insufficient_privilege then
  raise notice 'ok — kein Vorstellungswunsch ohne Rolle';
end $$;
do $$
begin
  insert into event_notes (event_id, author_name, author_id)
    values ('e8000000-0000-0000-0000-000000000001', 'x', auth.uid());
  raise exception 'PRUEFUNG GESCHEITERT: wartendes Konto konnte eine Event-Notiz anlegen';
exception when insufficient_privilege then
  raise notice 'ok — keine Event-Notiz ohne Rolle';
end $$;
do $$
begin
  insert into audit_log (actor_id, action, entity) values (auth.uid(), 'x', 'x');
  raise exception 'PRUEFUNG GESCHEITERT: wartendes Konto konnte ins Protokoll schreiben';
exception when insufficient_privilege then
  raise notice 'ok — kein Protokolleintrag ohne Rolle';
end $$;
do $$
begin
  insert into storage.objects (bucket_id, name, owner)
    values ('event-note-media', 'x/y.m4a', auth.uid());
  raise exception 'PRUEFUNG GESCHEITERT: wartendes Konto konnte eine Datei ablegen';
exception when insufficient_privilege then
  raise notice 'ok — kein Upload ohne Rolle';
end $$;
update intro_requests set text = 'geaendert' where id = '18000000-0000-0000-0000-000000000001';
update events set name = 'geaendert' where id = 'e8000000-0000-0000-0000-000000000001';
select as_admin();
select assert(
  (select text from intro_requests where id = '18000000-0000-0000-0000-000000000001') = 'Pruefwunsch'
  and (select name from events where id = 'e8000000-0000-0000-0000-000000000001') = 'Pruefevent',
  'Wartendes Konto kann nichts aendern');

-- 5. Wartende Konten sieht nur die Leitung.
select assert(
  (select full_name from pending_accounts() where id = 'b0000000-0000-0000-0000-000000000080') = 'Neu Kollegin',
  'Leitung sieht das wartende Konto mit dem Namen von Google');
select assert(
  (select full_name from pending_accounts() where id = 'b0000000-0000-0000-0000-000000000081') = 'Ohne Name',
  'Ohne Namen von Google kommt er aus der Adresse');
select assert(
  not exists (select 1 from pending_accounts() where id = 'b0000000-0000-0000-0000-000000000002'),
  'Konten mit Profil gelten nicht als wartend');
do $$
begin
  perform as_rm();
  perform * from pending_accounts();
  raise exception 'PRUEFUNG GESCHEITERT: RM sieht wartende Konten';
exception when insufficient_privilege then
  raise notice 'ok — RM sieht keine wartenden Konten';
end $$;
do $$
begin
  perform as_pending();
  perform * from pending_accounts();
  raise exception 'PRUEFUNG GESCHEITERT: wartendes Konto sieht wartende Konten';
exception when insufficient_privilege then
  raise notice 'ok — wartende Konten sehen einander nicht';
end $$;

-- 6. Freischalten darf nur die Leitung, und nur mit sinnvollen Angaben.
do $$
begin
  perform as_rm();
  perform approve_account('b0000000-0000-0000-0000-000000000080', 'sub_admin');
  raise exception 'PRUEFUNG GESCHEITERT: RM konnte ein Konto freischalten';
exception when insufficient_privilege then
  raise notice 'ok — RM schaltet nicht frei';
end $$;
do $$
begin
  perform as_pending();
  perform approve_account('b0000000-0000-0000-0000-000000000080', 'overall_admin');
  raise exception 'PRUEFUNG GESCHEITERT: Konto konnte sich selbst freischalten';
exception when insufficient_privilege then
  raise notice 'ok — niemand schaltet sich selbst frei';
end $$;
select as_admin();
do $$
begin
  perform approve_account('b0000000-0000-0000-0000-000000000080', 'account_manager', null);
  raise exception 'PRUEFUNG GESCHEITERT: Account Manager ohne Region freigeschaltet';
exception when check_violation then
  raise notice 'ok — Account Manager brauchen eine Region';
end $$;
do $$
begin
  perform approve_account(gen_random_uuid(), 'sub_admin');
  raise exception 'PRUEFUNG GESCHEITERT: unbekanntes Konto freigeschaltet';
exception when no_data_found then
  raise notice 'ok — unbekannte Konten lassen sich nicht freischalten';
end $$;

select approve_account('b0000000-0000-0000-0000-000000000080', 'account_manager',
                       'a0000000-0000-0000-0000-000000000001');
select assert(
  (select role from profiles where id = 'b0000000-0000-0000-0000-000000000080') = 'account_manager'
  and (select region_id from profiles where id = 'b0000000-0000-0000-0000-000000000080') = 'a0000000-0000-0000-0000-000000000001'
  and (select full_name from profiles where id = 'b0000000-0000-0000-0000-000000000080') = 'Neu Kollegin',
  'Freigeschaltet mit Rolle, Region und Namen');
select assert(
  exists (select 1 from profile_partners
          where profile_id = 'b0000000-0000-0000-0000-000000000080'
            and partner_id = '11111111-1111-4111-8111-111111111111'),
  'Freigeschaltetes Konto gehoert wie alle zum Partner Telekom');
select assert(
  not exists (select 1 from pending_accounts() where id = 'b0000000-0000-0000-0000-000000000080'),
  'Freigeschaltet heisst nicht mehr wartend');
do $$
begin
  perform approve_account('b0000000-0000-0000-0000-000000000080', 'sub_admin');
  raise exception 'PRUEFUNG GESCHEITERT: doppelt freigeschaltet';
exception when unique_violation then
  raise notice 'ok — ein Konto wird nur einmal freigeschaltet';
end $$;
select assert(
  exists (select 1 from audit_log
          where entity = 'profile' and action = 'insert'
            and entity_id = 'b0000000-0000-0000-0000-000000000080'
            and actor_id = 'b0000000-0000-0000-0000-000000000001'),
  'Freischaltung steht im Protokoll, mit der Leitung als Handelnder');

-- 7. Nach der Freischaltung sieht das Konto, was seine Rolle erlaubt.
select as_pending();
select assert((select count(*) from regions) > 0 and (select count(*) from events) > 0,
  'Nach der Freischaltung sind Regionen und Events sichtbar');

reset role;
