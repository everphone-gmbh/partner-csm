-- Rollenverwaltung (Migration 0033) gegen echte Rollen.
--
-- Das war der „Resttest zu 1.0": die Seite „Team" war nur im Demo-Modus
-- geprueft, und kein automatischer Test fuehrte die Serverregeln aus. Hier laufen
-- sie mit echter Sitzung — dieselbe Policy profiles_update und derselbe Trigger
-- profiles_guard_change wie in der Produktion.
--
-- Baut auf rules-01 auf: dort sind Leitung (…001) und AM West (…002) angelegt.

\set QUIET on
insert into auth.users (id) values ('b0000000-0000-0000-0000-000000000003');
insert into profiles (id, full_name, role, region_id) values
  ('b0000000-0000-0000-0000-000000000003','RM Sued','sub_admin','a0000000-0000-0000-0000-000000000001');
create or replace function as_rm() returns void language sql as $$
  select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000003',false)::void
$$;
\set QUIET off

set role authenticated;

-- 1. Ein Account Manager kann sich nicht selbst hochstufen. Die Policy filtert
--    das UPDATE auf 0 Zeilen — ohne Fehler. Deshalb danach als Leitung nachlesen.
select as_am();
update profiles set role = 'overall_admin' where id = 'b0000000-0000-0000-0000-000000000002';
select as_admin();
select assert(
  (select role from profiles where id='b0000000-0000-0000-0000-000000000002') = 'account_manager',
  'Account Manager kann sich nicht selbst zum Administrator machen');

-- 2. Ein Relationship Manager kann ebenfalls keine Rollen vergeben.
select as_rm();
update profiles set role = 'sub_admin' where id = 'b0000000-0000-0000-0000-000000000002';
select as_admin();
select assert(
  (select role from profiles where id='b0000000-0000-0000-0000-000000000002') = 'account_manager',
  'Relationship Manager kann keine Rollen vergeben');

-- 3. Die Leitung kann die Rolle eines anderen Kontos aendern — und zurueck.
update profiles set role = 'sub_admin' where id = 'b0000000-0000-0000-0000-000000000002';
select assert(
  (select role from profiles where id='b0000000-0000-0000-0000-000000000002') = 'sub_admin',
  'Leitung kann die Rolle eines anderen Kontos aendern');
update profiles set role = 'account_manager' where id = 'b0000000-0000-0000-0000-000000000002';

-- 4. Die Leitung kann die EIGENE Rolle nicht aendern (sonst klickt man sich aus
--    der Verwaltung und kommt nur per SQL zurueck).
do $$
begin
  update profiles set role = 'sub_admin' where id = 'b0000000-0000-0000-0000-000000000001';
  raise exception 'PRUEFUNG GESCHEITERT: eigene Rolle war aenderbar';
exception when insufficient_privilege then
  raise notice 'ok — die eigene Rolle ist gesperrt';
end $$;

-- 5. Der letzte Administrator kann nicht herabgestuft werden — auch nicht von
--    einem zweiten Administrator, der danach der einzige waere. Dafuer kurz einen
--    zweiten Admin anlegen, der den ersten herabstuft, dann den zweiten allein
--    lassen und pruefen, dass ER nicht mehr herabstufbar ist.
reset role;
insert into auth.users (id) values ('b0000000-0000-0000-0000-000000000009');
insert into profiles (id, full_name, role) values
  ('b0000000-0000-0000-0000-000000000009','Zweite Leitung','overall_admin');
set role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000009',false);
update profiles set role = 'sub_admin' where id = 'b0000000-0000-0000-0000-000000000001';
select assert(
  (select count(*) from profiles where role = 'overall_admin') = 1,
  'mit zwei Administratoren darf einer herabgestuft werden');
select as_rm(); -- jetzt pruefen, ob der verbliebene Admin geschuetzt ist
reset role;
do $$
begin
  -- Als Superuser umgeht man RLS, aber NICHT den Trigger: genau darum geht es.
  update profiles set role = 'sub_admin' where id = 'b0000000-0000-0000-0000-000000000009';
  raise exception 'PRUEFUNG GESCHEITERT: letzter Administrator war herabstufbar';
exception when insufficient_privilege then
  raise notice 'ok — der letzte Administrator ist geschuetzt';
end $$;
-- Ausgangslage wiederherstellen fuer die folgenden Pruefdateien. Loeschen geht
-- nicht: das Aenderungsprotokoll verweist auf das Konto, das die Aenderung
-- vorgenommen hat (audit_log.actor_id). Also zurueckstufen — und die Sitzung
-- jeweils auf das ANDERE Konto stellen, sonst greift die Sperre „eigene Rolle",
-- die auch fuer den Superuser gilt (Trigger, nicht Policy).
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000009',false);
update profiles set role = 'overall_admin' where id = 'b0000000-0000-0000-0000-000000000001';
select as_admin();
update profiles set role = 'sub_admin' where id = 'b0000000-0000-0000-0000-000000000009';

-- 6. Die Konto-ID ist unveraenderlich (gemeinsamer Schluessel mit auth.users).
do $$
begin
  update profiles set id = gen_random_uuid() where id = 'b0000000-0000-0000-0000-000000000002';
  raise exception 'PRUEFUNG GESCHEITERT: Konto-ID war aenderbar';
exception when insufficient_privilege then
  raise notice 'ok — die Konto-ID bleibt unveraenderlich';
end $$;

-- 7. Rollenwechsel landen im Aenderungsprotokoll — mit Feldnamen, ohne Werte.
select assert(
  exists (select 1 from audit_log
          where entity = 'profile' and action = 'update'
            and detail -> 'fields' ? 'role'
            and detail::text not like '%sub_admin%'),
  'Rollenwechsel sind protokolliert, ohne den Wert zu speichern');
