-- Drei Befunde aus der Datenschutz-Durchsicht vom 2026-08-03
--
-- ===========================================================================
-- 1. SCHWERWIEGEND: Die Redaktions-Views waren beschreibbar und umgingen dabei
--    die Row Level Security.
-- ===========================================================================
-- 0018 hat contact_cards/activity_cards bewusst OHNE security_invoker angelegt,
-- damit Account Manager lesen können, ohne Rechte auf der Basistabelle zu
-- haben. Übersehen wurde die Kehrseite: Supabase erteilt anon und authenticated
-- per Voreinstellung ALLE Rechte auf neue Objekte in public. Beide Views sind
-- automatisch beschreibbar (is_insertable_into = YES), ihr Eigentümer
-- supabase_admin ist Superuser mit BYPASSRLS, und ein WITH CHECK OPTION fehlt.
--
-- Folge, am 2026-08-03 gegen die laufende Instanz geprüft:
--   * INSERT über die View landet an der RLS vorbei in contacts/activities.
--     Der anon-Schlüssel steckt im öffentlich ausgelieferten Programm — das
--     war für jeden ausnutzbar, der die Adresse kennt.
--   * UPDATE/DELETE über die View umgehen die Bedingung is_privileged() der
--     Schreib-Policies. Ein Account Manager konnte damit Kontakte seiner
--     Region ändern und löschen, obwohl er auf contacts nur lesen darf.
--
-- Die App schreibt ausschließlich auf die Basistabellen; die Views werden nur
-- lesend verwendet (CONTACT_READ/ACTIVITY_READ in supabaseRepository.ts).
-- Der Entzug der Schreibrechte kostet daher keine Funktion.
--
-- SELECT bleibt absichtlich erhalten: die Zeileneinschränkung im WHERE der
-- View ist der Lesepfad der Anwendung. Für anon liefert sie ohnehin keine
-- Zeilen, weil auth_role() und auth_region() ohne Sitzung NULL sind.

revoke insert, update, delete, truncate, references, trigger
  on contact_cards from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on activity_cards from anon, authenticated;

-- Damit künftige Objekte in public die Lücke nicht erben:
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon;

-- ===========================================================================
-- 2. Löschen von Kontakten: jetzt wirklich nur Overall-Admin
-- ===========================================================================
-- Die Oberfläche zeigt „Löschen" nur dem Overall-Admin, und der Code-Kommentar
-- behauptete, das spiegele die RLS aus 0008. Das war falsch: die Policy stand
-- auf is_privileged() und erlaubte damit auch den beiden Relationship-Manager-
-- Konten, jeden der 671 Kontakte samt Kaskade zu löschen — regionsübergreifend,
-- weil is_privileged() die Region nicht prüft.
--
-- Löschen ist die Ausübung des Rechts auf Vergessenwerden und unwiderruflich
-- (Kaskade über Aktivitäten, Reminder, Verknüpfungen, Notizen und Dateien).
-- Die Datenbank setzt die Beschränkung deshalb jetzt selbst durch, statt sich
-- auf die Oberfläche zu verlassen.

drop policy contacts_delete on contacts;
create policy contacts_delete on contacts for delete
  using (auth_role() = 'overall_admin');

-- ===========================================================================
-- 3. Änderungsprotokoll: Abdeckung auf alle personenbezogenen Tabellen
-- ===========================================================================
-- 0019 protokollierte nur contacts (I/U/D) sowie contact_photos und side_facts
-- (nur I/D). Nicht protokolliert waren unter anderem activities — inhaltlich
-- das Sensibelste, weil dort Gesprächsinhalte stehen — sowie Event-Notizen,
-- Reminder und Beziehungsverknüpfungen. Für die Nachweispflicht nach
-- Art. 5 Abs. 2 DSGVO ist das zu schmal.
--
-- log_data_change() ist generisch (to_jsonb über new/old, Schlüssel `id`) und
-- braucht nur eine id-Spalte. event_attendees bleibt außen vor: dort bilden
-- event_id und contact_id den Schlüssel, es gibt also kein old.id/new.id.
-- Protokolliert werden weiterhin nur FELDNAMEN, niemals Werte.

create trigger activities_audit
  after insert or update or delete on activities
  for each row execute function log_data_change('activity');

create trigger event_notes_audit
  after insert or update or delete on event_notes
  for each row execute function log_data_change('event_note');

create trigger reminders_audit
  after insert or update or delete on reminders
  for each row execute function log_data_change('reminder');

create trigger contact_links_audit
  after insert or update or delete on contact_links
  for each row execute function log_data_change('contact_link');

-- Die beiden bestehenden Trigger kannten UPDATE nicht — eine geänderte
-- Bildunterschrift oder ein umbenannter Anknüpfungspunkt blieb unprotokolliert.
drop trigger contact_photos_audit on contact_photos;
create trigger contact_photos_audit
  after insert or update or delete on contact_photos
  for each row execute function log_data_change('contact_photo');

drop trigger side_facts_audit on side_facts;
create trigger side_facts_audit
  after insert or update or delete on side_facts
  for each row execute function log_data_change('side_fact');
