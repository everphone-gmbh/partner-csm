-- Regionen selbst verwalten — Schreibrechte für RM+ (Self-Service)
--
-- Bisher konnte NIEMAND Regionen anlegen oder umbenennen: 0002 vergibt allein
-- `regions_read` (SELECT für Angemeldete), aber keine Schreib-Policy. Regionen
-- mussten deshalb per SQL/Import gepflegt werden — dieselbe Lücke, die org_units
-- schon hatte. Fachlicher Auslöser: die RMs sollen Vertriebsgebiete selbst
-- umbenennen und neue anlegen können, ohne den Umweg über die Entwicklung.
--
-- Idiom wie bei org_units (0021): pflegen dürfen nur privilegierte Rollen (RM+),
-- geprüft über is_privileged() (= overall_admin oder sub_admin, siehe 0002).
--
-- Bewusst nur INSERT und UPDATE, KEIN DELETE: contacts.region_id ist NOT NULL
-- und zeigt auf regions — ein gelöschtes Gebiet würde Kontakte verwaisen lassen
-- (und auch profiles.region_id ins Leere zeigen). Regionen zusammenlegen oder
-- entfernen bleibt daher ein bewusster Admin-Vorgang per SQL, nicht per Klick.
--
-- `regions_read` bleibt unangetastet (SELECT für alle Angemeldeten, auch das
-- AM-Tier braucht die Liste). Der Platzhalter „Unbekannt" (is_placeholder = true,
-- 0024) wird von der Oberfläche vor dem Umbenennen geschützt; die Datenbank
-- unterscheidet hier nicht, weil das Kennzeichen eine fachliche und keine
-- Sicherheitsgrenze ist.

create policy regions_insert on regions for insert
  with check (is_privileged());

create policy regions_update on regions for update
  using (is_privileged())
  with check (is_privileged());
