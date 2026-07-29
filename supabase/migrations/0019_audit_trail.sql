-- Änderungsprotokoll füllen (Audit-Befund: Tabelle existiert seit 0001, wurde
-- aber nie beschrieben — keine Nachweisbarkeit im Sinne der DSGVO-
-- Rechenschaftspflicht, Art. 5 Abs. 2).
--
-- Zwei Entscheidungen:
--
-- 1. TRIGGER statt Client-Code. Ein Protokoll, das die Anwendung selbst
--    schreibt, kann übersehen (neuer Code-Pfad) oder umgangen werden (direkte
--    API-Aufrufe mit dem anon-Key). Im Trigger hängt es an der Tabelle.
--
-- 2. Es werden NUR die geänderten SPALTENNAMEN protokolliert, keine Werte.
--    Alt-/Neu-Werte mitzuschreiben würde Geburtsdaten, Familienstand und
--    Privatnotizen ein zweites Mal speichern — in einer Tabelle, die dann
--    ebenfalls geschützt und gelöscht werden müsste. Für „wer hat wann was
--    geändert" genügen Feldnamen.
--
-- Lesezugriffe werden bewusst nicht protokolliert: bei jedem Seitenaufruf
-- entstünden tausende Zeilen, und wer was sehen DARF, regelt bereits RLS.

create or replace function log_data_change() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  changed text[];
  detail jsonb := '{}'::jsonb;
  target uuid;
begin
  if tg_op = 'DELETE' then
    target := old.id;
  else
    target := new.id;
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key)
      -- updated_at setzt ein eigener Trigger bei JEDEM Update; allein ist das
      -- keine inhaltliche Änderung und würde das Protokoll zumüllen.
      and n.key <> 'updated_at';
    if changed is null then
      return new;
    end if;
    detail := jsonb_build_object('fields', to_jsonb(changed));
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), lower(tg_op), tg_argv[0], target, detail);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

-- Kontakte: der Kern der personenbezogenen Daten, inklusive Löschung
-- (Nachweis der Ausübung des Rechts auf Vergessenwerden).
create trigger contacts_audit
  after insert or update or delete on contacts
  for each row execute function log_data_change('contact');

-- Fotos: höchste Sensibilitätsstufe (Bildnisse der betroffenen Person).
create trigger contact_photos_audit
  after insert or delete on contact_photos
  for each row execute function log_data_change('contact_photo');

-- Anknüpfungspunkte: Hobbys, Familie, Sport — inhaltlich sensibel.
create trigger side_facts_audit
  after insert or delete on side_facts
  for each row execute function log_data_change('side_fact');

-- Abfragen laufen immer „neueste zuerst".
create index on audit_log (at desc);
