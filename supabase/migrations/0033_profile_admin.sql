-- Rollen und Regionen im Tool verwalten (Wunsch Jannik, 2026-09-17)
--
-- Bisher hatte `profiles` NUR eine SELECT-Policy. Rollen liessen sich
-- ausschliesslich per SQL aendern, jede Personalie war ein Zuruf an Claude.
-- Ab jetzt darf der Overall Admin Rolle und Region vorhandener Konten selbst
-- setzen.
--
-- Bewusst NUR vorhandene Konten. Ein neues Login anzulegen braucht die
-- Supabase-Admin-API und damit den Service-Role-Key; der darf nie im Browser
-- liegen. Das wird mit Google SSO geloest (Entscheidung 2026-09-17), bis dahin
-- legt Claude Konten von Hand an.
--
-- Zwei Selbstsperren, die eine reine Policy nicht abbilden kann — RLS prueft
-- Zeilen, nicht Uebergaenge. Deshalb ein Trigger:
--   1. Niemand nimmt sich selbst die Administratorrolle. Sonst klickt man sich
--      versehentlich aus der Verwaltung und kommt nur noch per SQL zurueck.
--   2. Der LETZTE Administrator kann nicht herabgestuft werden. Sonst gibt es
--      im Tool niemanden mehr, der Rollen vergeben darf.
-- Dazu bleibt `id` unveraenderlich: sie ist der gemeinsame Schluessel mit
-- auth.users, ein Tausch wuerde Anmeldung und Zuordnung entkoppeln.
--
-- Rollenwechsel sind sicherheitsrelevant und werden protokolliert. Der
-- vorhandene, generische Trigger aus 0019 kann das direkt: er schreibt nur
-- WELCHE Felder sich geaendert haben, nie die Werte.

create policy profiles_update on profiles for update
  using (auth_role() = 'overall_admin')
  with check (auth_role() = 'overall_admin');

create or replace function guard_profile_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Die Konto-ID kann nicht geaendert werden'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    if old.id = auth.uid() then
      raise exception 'Die eigene Rolle kann nicht geaendert werden'
        using errcode = '42501';
    end if;

    if old.role = 'overall_admin'
       and (select count(*) from profiles where role = 'overall_admin') <= 1 then
      raise exception 'Der letzte Administrator kann nicht herabgestuft werden'
        using errcode = '42501';
    end if;
  end if;

  return new;
end
$$;

create trigger profiles_guard_change
  before update on profiles
  for each row execute function guard_profile_change();

-- Protokoll: wer wann welche Felder eines Kontos geaendert hat (ohne Werte).
create trigger profiles_audit
  after insert or update or delete on profiles
  for each row execute function log_data_change('profile');
