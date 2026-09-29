-- Neue Konten per Google: ohne Rolle nichts, Freischaltung durch die Leitung
--
-- Anlass (2026-09-29): Die Google-Anmeldung ist in Supabase bereits
-- eingeschaltet, Registrierungen sind erlaubt. Sobald Google den Ruecksprung
-- annimmt, bekommt jedes Konto, das Google durchlaesst, sofort eine Sitzung —
-- ohne Profil, also ohne Rolle.
--
-- Bisher hiess „angemeldet" an mehreren Stellen „darf": neun Policies pruefen
-- nur auth.uid() is not null (Events samt Schreiben, Gaeste, Kundenliste,
-- Everphone-Accounts, Vorstellungswuensche, Partner, Regionen), fuenf
-- Einfuege-Regeln nur „fuer sich selbst" (Vorstellungswuensche, Event-Notizen,
-- Favoriten, Protokoll, Ablage fuer Event-Notizen). Solange es nur von Hand
-- angelegte Konten mit Profil gab, war das dasselbe. Mit Selbstregistrierung
-- nicht mehr.
--
-- Entscheidung (Empfehlung an Jannik, 2026-09-29): neue Konten WARTEN auf
-- Freischaltung. Ohne Profil liefert auth_role() NULL — ab hier heisst das:
-- nichts lesen, nichts schreiben. Die Leitung sieht wartende Konten im Bereich
-- „Team" und schaltet sie mit Rolle und Region frei. Umstellen auf „sofort
-- Account Manager" ginge spaeter mit einem Trigger, der das Profil anlegt;
-- umgekehrt waere es riskanter.
--
-- Zweiter Riegel: nur everphone.de-Adressen koennen ueberhaupt ein Konto
-- anlegen. Ob der Google-Client auf „Intern" steht, liegt bei devops — die
-- Sicherheit haengt so nicht allein daran.

-- 1. Lesen und Schreiben nur mit Rolle.
alter policy customers_read on customers using (auth_role() is not null);
alter policy event_guests_read on event_guests using (auth_role() is not null);
alter policy events_read on events using (auth_role() is not null);
alter policy events_write on events
  using (auth_role() is not null) with check (auth_role() is not null);
alter policy everphone_accounts_read on everphone_accounts using (auth_role() is not null);
alter policy intro_requests_read on intro_requests using (auth_role() is not null);
alter policy intro_requests_update on intro_requests
  using (auth_role() is not null) with check (auth_role() is not null);
alter policy partners_read on partners using (auth_role() is not null);
alter policy regions_read on regions using (auth_role() is not null);

-- 2. „Fuer sich selbst" anlegen nur mit Rolle. Lesen und Loeschen der eigenen
--    Zeilen bleibt wie es ist — ohne Rolle gibt es keine eigenen Zeilen.
alter policy intro_requests_insert on intro_requests
  with check (created_by = auth.uid() and auth_role() is not null);
alter policy event_notes_insert on event_notes
  with check (author_id = auth.uid() and auth_role() is not null);
alter policy favorites_insert on favorites
  with check (profile_id = auth.uid() and auth_role() is not null);
-- Die Protokoll-Trigger schreiben ueber log_data_change (security definer) und
-- sind davon nicht betroffen; das hier regelt nur direkte Eintraege.
alter policy audit_insert on audit_log
  with check (actor_id = auth.uid() and auth_role() is not null);
alter policy note_media_write on storage.objects
  with check (bucket_id = 'event-note-media' and public.auth_role() is not null);

-- 3. Nur everphone.de legt Konten an. Greift bei jeder Registrierung und auch
--    beim Anlegen ueber die Admin-API — Testkonten brauchen eine everphone.de-
--    Adresse.
create or replace function guard_new_account() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(split_part(new.email, '@', 2)) <> 'everphone.de' then
    raise exception 'Anmeldung nur mit einem everphone.de-Konto'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger auth_users_everphone_only
  before insert on auth.users
  for each row execute function guard_new_account();

-- 4. Wartende Konten: angemeldet, aber noch ohne Profil. Nur fuer die Leitung.
--    Name aus den Angaben von Google, sonst aus der Adresse („vorname.nachname").
create or replace function pending_accounts()
returns table (
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
  language plpgsql stable security definer set search_path = public as $$
begin
  if auth_role() is distinct from 'overall_admin' then
    raise exception 'Nur die Leitung sieht wartende Konten'
      using errcode = '42501';
  end if;
  return query
    select u.id,
           u.email::text,
           coalesce(
             nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
             nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
             initcap(replace(split_part(u.email::text, '@', 1), '.', ' '))
           ),
           u.created_at,
           u.last_sign_in_at
    from auth.users u
    where not exists (select 1 from profiles p where p.id = u.id)
    order by u.created_at desc;
end
$$;

-- 5. Freischalten: Profil mit Rolle und Region anlegen, dazu die Zuordnung zum
--    Partner Telekom wie bei allen Konten (0026). Account Manager sehen nur ihre
--    Region — ohne Region saehen sie nichts, deshalb Pflicht.
create or replace function approve_account(
  p_user uuid,
  p_role app_role,
  p_region uuid default null
) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_name text;
begin
  if auth_role() is distinct from 'overall_admin' then
    raise exception 'Nur die Leitung darf Konten freischalten'
      using errcode = '42501';
  end if;

  select u.email::text,
         coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
           initcap(replace(split_part(u.email::text, '@', 1), '.', ' '))
         )
    into v_email, v_name
    from auth.users u
    where u.id = p_user;
  if not found then
    raise exception 'Konto nicht gefunden'
      using errcode = 'P0002';
  end if;

  if exists (select 1 from profiles where profiles.id = p_user) then
    raise exception 'Das Konto ist bereits freigeschaltet'
      using errcode = '23505';
  end if;

  if p_role = 'account_manager' and p_region is null then
    raise exception 'Account Manager brauchen eine Region'
      using errcode = '23514';
  end if;

  insert into profiles (id, full_name, role, region_id)
    values (p_user, v_name, p_role, p_region);
  insert into profile_partners (profile_id, partner_id)
    values (p_user, '11111111-1111-4111-8111-111111111111')
    on conflict do nothing;
end
$$;

revoke execute on function pending_accounts() from public, anon;
revoke execute on function approve_account(uuid, app_role, uuid) from public, anon;
grant execute on function pending_accounts() to authenticated;
grant execute on function approve_account(uuid, app_role, uuid) to authenticated;
