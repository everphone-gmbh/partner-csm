-- Regionen löschen — Self-Service-Aufräumen für RM+ (Rest von 0029)
--
-- 0029 hat Anlegen/Umbenennen freigegeben, aber bewusst kein DELETE; Begründung
-- war, dass ein gelöschtes Gebiet Kontakte verwaisen ließe. Das ist strenger
-- als die Realität: contacts.region_id und profiles.region_id sind Foreign
-- Keys OHNE ON DELETE-Klausel (0001) — Postgres verweigert das Löschen eines
-- benutzten Gebiets also ohnehin hart (23503). Gefahrlos löschbar sind damit
-- genau die leeren Gebiete, und die entstehen seit 0029 zwangsläufig
-- (Tippfehler und Dubletten beim Selbst-Anlegen). Ohne Lösch-Weg sammelt sich
-- Müll in genau der Liste, aus der die RMs täglich auswählen.
--
-- Der Platzhalter „Unbekannt" (is_placeholder, 0024) ist hier — anders als
-- beim Umbenennen — AUCH in der Datenbank geschützt: er ist Ziel von „Zu
-- Kontakt machen" (Event-Gäste) und Default beim Import; ihn zu löschen wäre
-- destruktiv, nicht nur unschön. Die Policy filtert ihn heraus: ein DELETE
-- trifft dann 0 Zeilen ohne Fehler, der Adapter prüft nach und macht daraus
-- eine lesbare Meldung.
--
-- Regionen zusammenlegen bleibt bewusst zweistufig statt eines eigenen
-- Features: Kontakte per vorhandener Massenzuordnung umziehen, dann die leere
-- Hülle löschen.

create policy regions_delete on regions for delete
  using (is_privileged() and not is_placeholder);
