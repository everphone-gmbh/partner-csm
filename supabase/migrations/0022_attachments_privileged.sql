-- Anhänge: Lesen und Schreiben nur privilegiert (Nachtrag zu 0018)
--
-- 0018 hat activities auf is_privileged() gestellt, attachments aber weiter nur
-- an can_see_contact() gehängt. Ein Account Manager konnte damit über die API
-- die Anhang-Metadaten (Name, Art, URL, Größe) zu Aktivitäten seiner Region
-- lesen UND schreiben, obwohl ihm die zugehörige Aktivität verwehrt ist.
-- Anhänge sind laut 0012 personenbezogene Daten des Kontakts (Fotos,
-- Sprachmemos), gehören also in dieselbe Stufe wie activities und side_facts.
--
-- Betroffen waren 0 Zeilen (geprüft am 2026-08-03: attachments, activities,
-- contact_photos und event_notes sind alle leer) — die Lücke war strukturell,
-- nicht ausgenutzt. Die App liest diese Tabelle bislang nirgends; die Anhänge
-- an Event-Notizen sind die jsonb-Spalte event_notes.attachments und von dieser
-- Policy nicht betroffen. Account Manager verlieren dadurch keine Funktion.
--
-- can_see_contact() bleibt zusätzlich stehen, obwohl es für privilegierte
-- Rollen ohnehin true liefert: die Bedingung hält beim Schreiben Verweise auf
-- fremde oder nicht existierende Aktivitäten heraus und trägt die Regionslogik
-- weiter, falls sub_admins später regionsgebunden werden.

drop policy attachments_rw on attachments;

create policy attachments_rw on attachments for all
  using (
    is_privileged() and exists (
      select 1 from activities a
      where a.id = attachments.activity_id and can_see_contact(a.contact_id)
    )
  )
  with check (
    is_privileged() and exists (
      select 1 from activities a
      where a.id = attachments.activity_id and can_see_contact(a.contact_id)
    )
  );
