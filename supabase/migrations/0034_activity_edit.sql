-- Aktivitaetseintraege nachtraeglich korrigierbar (gemeldet 2026-09-24)
--
-- Eine Kollegin hat per Sprachmemo diktiert, die Spracherkennung machte aus
-- einem Produktnamen ein aehnlich klingendes Wort, und beim Speichern ist es
-- ihr durchgegangen. Danach gab es keinen Weg mehr zurueck: `activities` hatte
-- nur INSERT (0008) und DELETE (0008), kein UPDATE. Einmal gespeichert hiess
-- fuer immer so — ausgerechnet bei der Funktion, die am meisten benutzt wird.
--
-- Wer darf: derselbe Kreis wie beim Loeschen — der Verfasser und RM aufwaerts.
-- Das ist bewusst keine neue Regel, sondern die vorhandene aus activities_delete.
--
-- Der Riegel im Trigger ist der eigentliche Kern dieser Migration.
-- activities_insert prueft, dass der Eintrag zu einem Kontakt gehoert, den der
-- Autor sehen darf. Ein UPDATE laeuft an dieser Pruefung vorbei: ohne Riegel
-- koennte der Verfasser die contact_id nachtraeglich auf einen fremden Kontakt
-- umbiegen und seinen Text in eine Region schieben, die ihn nichts angeht.
-- Aenderbar ist deshalb ausschliesslich der Inhalt (body, ai_summary).
--
-- `edited_at` setzt die Datenbank selbst. Wuerde der Client es mitschicken,
-- koennte er es weglassen und eine Korrektur als Original ausgeben.
--
-- Protokolliert wird bereits: der Trigger activities_audit aus 0023 deckt
-- UPDATE ab und schreibt nur Feldnamen, nie Werte.

alter table activities add column edited_at timestamptz;

comment on column activities.edited_at is
  'Zeitpunkt der letzten Korrektur; NULL = unveraendert seit dem Anlegen. Von der Datenbank gesetzt (guard_activity_change), nie vom Client.';

create policy activities_update on activities for update
  using (is_privileged() or author_id = auth.uid())
  with check (is_privileged() or author_id = auth.uid());

create or replace function guard_activity_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Die ID eines Eintrags kann nicht geaendert werden'
      using errcode = '42501';
  end if;

  -- Der Eintrag bleibt an seinem Kontakt, bei seinem Verfasser und auf seinem
  -- Zeitpunkt. Sonst waere die Regionspruefung aus activities_insert per
  -- UPDATE umgehbar.
  if new.contact_id is distinct from old.contact_id then
    raise exception 'Ein Eintrag kann nicht zu einem anderen Kontakt verschoben werden'
      using errcode = '42501';
  end if;

  if new.author_id is distinct from old.author_id then
    raise exception 'Der Verfasser eines Eintrags kann nicht geaendert werden'
      using errcode = '42501';
  end if;

  if new.occurred_at is distinct from old.occurred_at then
    raise exception 'Der Zeitpunkt eines Eintrags kann nicht geaendert werden'
      using errcode = '42501';
  end if;

  if new.type is distinct from old.type then
    raise exception 'Die Art eines Eintrags kann nicht geaendert werden'
      using errcode = '42501';
  end if;

  -- Nur wenn sich am Inhalt wirklich etwas geaendert hat. Ein UPDATE, das
  -- denselben Text zurueckschreibt, soll den Eintrag nicht als korrigiert
  -- markieren.
  if new.body is distinct from old.body or new.ai_summary is distinct from old.ai_summary then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  return new;
end
$$;

create trigger activities_guard_change
  before update on activities
  for each row execute function guard_activity_change();

-- Die Leseview neu bauen, damit die Oberflaeche „bearbeitet" anzeigen kann.
-- Unveraendert bleibt alles andere, insbesondere die Redaktion des Rohtexts
-- (nur RM+) und der Zeilenfilter can_see_contact.
drop view activity_cards;
create view activity_cards as
  select
    a.id,
    a.contact_id,
    a.type,
    a.occurred_at,
    a.author_id,
    a.ai_summary,
    a.edited_at,
    -- Rohtext nur für RM+; der AM-Tier sieht die KI-Zusammenfassung.
    case when is_privileged() then a.body else null end as body
  from activities a
  where can_see_contact(a.contact_id);

-- PFLICHT nach jedem View-Neubau (0023): Supabase erteilt neuen Objekten in
-- public per Voreinstellung ALLE Rechte an anon und authenticated. Die View
-- laeuft ohne security_invoker und gehoert einem Superuser mit BYPASSRLS —
-- Schreibrechte darauf umgehen die RLS vollstaendig.
revoke insert, update, delete, truncate, references, trigger
  on activity_cards from anon, authenticated;
grant select on activity_cards to authenticated;
