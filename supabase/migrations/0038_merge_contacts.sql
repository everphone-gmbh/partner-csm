-- Dubletten zusammenführen (offen seit Track 2.2)
--
-- Das Monitoring findet Dubletten und zeigt sie an, zusammenführen ließen sie
-- sich nicht. Seit mehrere Personen parallel pflegen, entstehen sie laufend.
--
-- Zusammenführen heißt: ALLES, was am Verlierer hängt, zieht zum Gewinner um,
-- danach wird der Verlierer gelöscht. Das sind zwölf Verweise über elf Tabellen
-- (per information_schema gezählt, Stand 0036). Das geschieht hier in EINER
-- Funktion und damit in einer Transaktion: halb zusammengeführt gibt es nicht.
--
-- Die Felder des Gewinners setzt die App vorher über das normale Speichern —
-- scheitert danach das Zusammenführen, existieren beide Kontakte weiter und der
-- Vorgang lässt sich wiederholen. Nichts geht verloren.
--
-- ===========================================================================
-- Warum eine Merge-Tabelle
-- ===========================================================================
-- 0034 verbietet per Trigger, einen Aktivitätseintrag zu einem anderen Kontakt
-- zu verschieben — sonst ließe sich die Regionsprüfung beim Anlegen umgehen.
-- Genau das muss das Zusammenführen aber tun. Ein Schalter, den der Aufrufer
-- setzt (eigene Einstellungsvariable), wäre eine Hintertür: jede Sitzung darf
-- solche Variablen setzen. Stattdessen trägt merge_contacts() den Vorgang in
-- contact_merges ein, und der Trigger lässt genau diese eine Verschiebung zu —
-- vom eingetragenen Verlierer zum eingetragenen Gewinner. Schreiben kann in die
-- Tabelle nur die Funktion (keine INSERT-Policy). Nebenbei bleibt festgehalten,
-- wer wann was zusammengeführt hat.

create table contact_merges (
  id uuid primary key default gen_random_uuid(),
  -- Bewusst ohne Fremdschlüssel: der Verlierer existiert danach nicht mehr, und
  -- der Gewinner kann später selbst gelöscht werden — der Vorgang bleibt belegt.
  winner_id uuid not null,
  loser_id uuid not null,
  merged_by uuid,
  merged_at timestamptz not null default now()
);

alter table contact_merges enable row level security;
create policy contact_merges_read on contact_merges for select
  using (auth_role() = 'overall_admin');

-- Riegel aus 0034 um die eine zugelassene Verschiebung erweitert. Alles andere
-- bleibt Wort für Wort, wie es war.
create or replace function guard_activity_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Die ID eines Eintrags kann nicht geaendert werden'
      using errcode = '42501';
  end if;

  if new.contact_id is distinct from old.contact_id and not exists (
    select 1 from contact_merges m
    where m.loser_id = old.contact_id and m.winner_id = new.contact_id
  ) then
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

  if new.body is distinct from old.body or new.ai_summary is distinct from old.ai_summary then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  return new;
end
$$;

-- p_ref_map: {"alte-dateireferenz": "neue-dateireferenz"} für Galeriefotos. Die
-- App kopiert die Dateien vorher in den Ordner des Gewinners — die Ablageregel
-- prüft den ersten Pfadordner gegen can_see_contact() (Fallstrick 3), unter
-- dem Ordner des gelöschten Verlierers wären sie für Account Manager
-- unerreichbar und beim späteren Löschen des Gewinners verwaist.
create or replace function merge_contacts(
  p_winner uuid,
  p_loser uuid,
  p_ref_map jsonb default '{}'::jsonb
) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth_role() is distinct from 'overall_admin' then
    raise exception 'Nur die Leitung darf Kontakte zusammenführen'
      using errcode = '42501';
  end if;
  if p_winner = p_loser then
    raise exception 'Ein Kontakt lässt sich nicht mit sich selbst zusammenführen'
      using errcode = '22023';
  end if;
  if not exists (select 1 from contacts where id = p_winner)
     or not exists (select 1 from contacts where id = p_loser) then
    raise exception 'Kontakt nicht gefunden'
      using errcode = 'P0002';
  end if;

  insert into contact_merges (winner_id, loser_id, merged_by)
    values (p_winner, p_loser, auth.uid());

  -- Aktivitäten, Reminder, Event-Notizen, Geschenke: einfach umhängen.
  update activities set contact_id = p_winner where contact_id = p_loser;
  update reminders set contact_id = p_winner where contact_id = p_loser;
  update event_notes set contact_id = p_winner where contact_id = p_loser;
  update gift_recipients set contact_id = p_winner where contact_id = p_loser;
  update event_guests set promoted_contact_id = p_winner where promoted_contact_id = p_loser;

  -- Galeriefotos: umhängen und die Dateireferenz auf die Kopie umschreiben.
  update contact_photos
    set contact_id = p_winner,
        url = coalesce(p_ref_map ->> url, url)
    where contact_id = p_loser;

  -- Anknüpfungspunkte: umhängen, gleichlautende danach nur einmal behalten.
  update side_facts set contact_id = p_winner where contact_id = p_loser;
  delete from side_facts s
    using side_facts keep
    where s.contact_id = p_winner and keep.contact_id = p_winner
      and lower(btrim(s.label)) = lower(btrim(keep.label))
      and s.id > keep.id;

  -- Kundenbezüge, Gebiete, Event-Teilnahmen, Favoriten: zusammengesetzte
  -- Schlüssel. Was der Gewinner schon hat, bleibt beim Gewinner; der Rest des
  -- Verlierers geht beim Löschen per Kaskade.
  insert into contact_customers (contact_id, customer_id, with_us)
    select p_winner, customer_id, with_us from contact_customers where contact_id = p_loser
    on conflict do nothing;
  insert into contact_regions (contact_id, region_id)
    select p_winner, region_id from contact_regions where contact_id = p_loser
    on conflict do nothing;
  insert into event_attendees (event_id, contact_id, status, purpose, slot_at, slot_minutes, meeting_point)
    select event_id, p_winner, status, purpose, slot_at, slot_minutes, meeting_point
    from event_attendees where contact_id = p_loser
    on conflict do nothing;
  insert into favorites (profile_id, contact_id, created_at)
    select profile_id, p_winner, created_at from favorites where contact_id = p_loser
    on conflict do nothing;

  -- Verknüpfungen: eine Verbindung zwischen den beiden Dubletten zeigte danach
  -- auf sich selbst — das verbietet die Tabelle (from <> to). Also zuerst weg.
  delete from contact_links
    where (from_contact_id = p_loser and to_contact_id = p_winner)
       or (from_contact_id = p_winner and to_contact_id = p_loser);
  update contact_links set from_contact_id = p_winner where from_contact_id = p_loser;
  update contact_links set to_contact_id = p_winner where to_contact_id = p_loser;
  -- Doppelte Verbindungen (gleiche Richtung, gleiche Art) nur einmal behalten.
  delete from contact_links l
    using contact_links keep
    where l.from_contact_id = keep.from_contact_id
      and l.to_contact_id = keep.to_contact_id
      and l.kind = keep.kind
      and l.id > keep.id
      and p_winner in (l.from_contact_id, l.to_contact_id);

  delete from contacts where id = p_loser;
end
$$;
