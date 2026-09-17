-- Kontaktfoto: jede Rolle darf es pflegen (Entscheidung Jannik, 2026-09-17)
--
-- Bisher hing das Foto an `is_privileged()` (RM+). Account Manager sahen das
-- Bild, konnten es aber weder setzen noch löschen — genau die Rückmeldung, die
-- den Anlass gab. Ab jetzt gilt für das Kontaktfoto dieselbe Grenze wie fürs
-- Sehen des Kontakts: wer ihn sieht, darf sein Foto pflegen. Das ist bereits
-- als `can_see_contact()` formuliert und steuert schon heute `avatars_read`.
--
-- Warum NICHT einfach `contacts_update` aufweiten:
-- RLS ist zeilen-, nicht spaltenbasiert. Eine auf `can_see_contact()`
-- gelockerte UPDATE-Policy würde Account Managern nicht nur das Foto, sondern
-- JEDE Spalte ihrer Regionskontakte öffnen — Name, Notizen, sensible Felder.
-- Das wäre weit mehr als gewollt und würde das Freigabemodell aushebeln.
-- Deshalb eine eng geschnittene Funktion, die ausschliesslich `photo_url`
-- anfasst; `contacts_update` bleibt unverändert bei RM+.
--
-- Die Funktion ist SECURITY DEFINER, prüft die Sichtbarkeit aber selbst. Der
-- Audit-Trigger (0019) feuert wie bei jedem UPDATE und schreibt `auth.uid()` —
-- das bleibt auch in einer DEFINER-Funktion der angemeldete Mensch, nicht der
-- Eigentümer der Funktion. Fotoänderungen sind damit weiterhin nachvollziehbar.
--
-- Zusätzlich erzwingt die Funktion die Pfadkonvention aus 0020 (Fallstrick 3 im
-- Runbook): die Referenz muss in den Ordner DIESES Kontakts zeigen. Das
-- verhindert, dass jemand eine fremde oder eine externe URL einträgt, die der
-- Browser dann arglos nachlädt.
--
-- Die Fotogalerie bleibt bewusst bei RM+: `gallery` steht in
-- SENSITIVE_CONTACT_FIELDS und wird für Account Manager ohnehin wegredigiert.
-- Sie zu öffnen wäre eine Redaktionsänderung, keine Rechteänderung.

create or replace function set_contact_photo(p_contact_id uuid, p_photo_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_see_contact(p_contact_id) then
    raise exception 'Kein Zugriff auf diesen Kontakt' using errcode = '42501';
  end if;

  if p_photo_url is not null
     and p_photo_url not like ('storage:contact-avatars/' || p_contact_id::text || '/%') then
    raise exception 'Ungültige Bildreferenz für diesen Kontakt' using errcode = '22023';
  end if;

  update contacts set photo_url = p_photo_url where id = p_contact_id;
end;
$$;

revoke all on function set_contact_photo(uuid, text) from public;
revoke all on function set_contact_photo(uuid, text) from anon;
grant execute on function set_contact_photo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ablage: Schreiben, Ersetzen und Löschen einer Avatardatei an dieselbe Grenze
-- hängen wie das Lesen. `avatars_read` prüft schon `can_see_contact()` gegen
-- den ersten Pfadordner; die drei Schreibregeln ziehen jetzt nach.
-- ---------------------------------------------------------------------------
drop policy avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert
  with check (
    bucket_id = 'contact-avatars'
    and can_see_contact(((storage.foldername(name))[1])::uuid)
  );

drop policy avatars_update on storage.objects;
create policy avatars_update on storage.objects for update
  using (
    bucket_id = 'contact-avatars'
    and can_see_contact(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'contact-avatars'
    and can_see_contact(((storage.foldername(name))[1])::uuid)
  );

drop policy avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete
  using (
    bucket_id = 'contact-avatars'
    and can_see_contact(((storage.foldername(name))[1])::uuid)
  );
