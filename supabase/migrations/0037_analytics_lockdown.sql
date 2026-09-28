-- Auswertungen serverseitig sperren (offen seit der Rollen-Hierarchie im August)
--
-- Entscheidung Lennart 2026-08-06: Relationship Manager pflegen und bearbeiten,
-- sehen aber keine team-übergreifenden Auswertungen. Bericht, Abdeckung und
-- Monitoring waren deshalb für RMs nur in der OBERFLÄCHE ausgeblendet —
-- serverseitig blieben die Daten dahinter lesbar. Diese Migration zieht die
-- Grenze in der Datenbank nach.
--
-- ===========================================================================
-- 1. Änderungsprotokoll: nur noch die Leitung
-- ===========================================================================
-- Das Protokoll zeigt, wer wann was geändert hat — Arbeitsverhalten von
-- Kolleginnen und Kollegen, also genau die Team-Auswertung, die RMs nicht sehen
-- sollen. Einziger Leser in der App ist die Monitoring-Seite (nur Leitung).
drop policy audit_read on audit_log;
create policy audit_read on audit_log for select
  using (auth_role() = 'overall_admin');

-- ===========================================================================
-- 2. Telekom-Struktur (org_units): Tabelle nur Leitung, Namen für alle RM+
-- ===========================================================================
-- Die Soll-Struktur ist die Grundlage der Abdeckung. Lesbar war sie für JEDE
-- angemeldete Person, schreibbar für RM+. Gebraucht wird sie außerhalb der
-- Leitung an genau einer Stelle: den Vorschlägen beim Tippen von Team und Firma.
-- Dafür reichen die Namen — deshalb eine schmale Funktion statt der ganzen
-- Tabelle (Grundsatz aus docs/architektur.md: eine Spalte freigeben heißt
-- nicht, die Zeile freizugeben). Die Notizspalte bleibt bei der Leitung.
drop policy org_units_read on org_units;
create policy org_units_read on org_units for select
  using (auth_role() = 'overall_admin');

-- Pflegen tut die Struktur die Leitung (neue Pflegeoberfläche auf der
-- Abdeckungsseite). RMs sehen die Abdeckung nicht — sie brauchen sie auch nicht
-- zu ändern.
drop policy org_units_write on org_units;
create policy org_units_write on org_units for all
  using (auth_role() = 'overall_admin')
  with check (auth_role() = 'overall_admin');

create or replace function org_unit_names()
  returns table (company text, department text, team text)
  language sql stable security definer set search_path = public as $$
  select distinct u.company, u.department, u.team
  from org_units u
  where is_privileged()
$$;

comment on function org_unit_names() is
  'Firmen-, Abteilungs- und Teamnamen der Telekom-Struktur für die Vorschläge beim Tippen (RM+). Die Tabelle selbst liest nur die Leitung.';

-- ===========================================================================
-- 3. Event-Teilnehmer und -Gäste: schreiben nur RM+
-- ===========================================================================
-- Die Oberfläche verhindert seit 13.08., dass Account Manager Teilnehmer oder
-- Gäste bearbeiten. Serverseitig durften sie es weiter — event_attendees in der
-- eigenen Region (can_see_contact), event_guests sogar überall. Lesen bleibt,
-- wie es war.
drop policy event_attendees_rw on event_attendees;
create policy event_attendees_read on event_attendees for select
  using (can_see_contact(contact_id));
create policy event_attendees_write on event_attendees for all
  using (is_privileged())
  with check (is_privileged());

drop policy event_guests_write on event_guests;
create policy event_guests_write on event_guests for all
  using (is_privileged())
  with check (is_privileged());
