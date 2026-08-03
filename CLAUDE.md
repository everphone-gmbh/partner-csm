# Partner CSM — Einarbeitung & Runbook

> ⚠ **Dieses Repository ist öffentlich.** Keine Passwörter, Schlüssel,
> personenbezogenen Daten oder Beschreibungen offener Schwachstellen in Dateien
> schreiben, die hier landen. `.env.local` ist gitignored und bleibt es.
>
> Betriebswissen, Zuständigkeiten und offene Schwachstellen stehen in
> **`CLAUDE.local.md`** (gitignored, wird beim Sitzungsstart mitgeladen). Fehlt
> die Datei, fehlt die Hälfte der Übergabe — dann bei Jannik erfragen.

## Was das ist

Internes Beziehungs-CRM („Partner Facebook") für das Everphone-Partnerships-Team,
um ~670 Kontakte bei Telekom zu pflegen — nicht als zweites Salesforce, sondern
für **Beziehungstiefe**: wer kennt wen, wie steht die Beziehung, was ist der
Aufhänger. Salesforce bleibt System of Record.

Nutzer: Partnerships-Leitung (Lennart Bernhard), Relationship Manager,
Account Manager. Rund 10 Personen.

**Live:** https://everphone-gmbh.github.io/partner-csm/ (seit 2026-07-16)
**Repo:** everphone-gmbh/partner-csm · **Backend:** Supabase Sovereign Cloud (EU)

Enthält echte personenbezogene Daten von Telekom-Mitarbeitenden. DSGVO ist
nicht Beiwerk, sondern Kernanforderung — siehe „Fallstricke".

## Lokal starten

```bash
npm install && npm run dev
```

`.env.local` steuert das Backend (nicht im Repo, bei Jannik):

- `VITE_DATA_BACKEND=supabase` → echte Datenbank, echter Login
- weggelassen / `mock` → Demo-Modus mit Seed-Daten, **kein** Login, dafür
  ein „Ansicht als…"-Rollenumschalter

> ⚠ **Lokal ist Produktion.** Es gibt **keine** zweite Instanz und keine
> Testdatenbank. Auf Janniks Rechner steht `.env.local` auf `supabase` — ein
> unbedachtes `npm run dev` arbeitet also auf 671 echten Personendatensätzen,
> und `deleteContact` löscht dort zusätzlich die Storage-Dateien. Wer an der
> Oberfläche arbeitet, stellt `VITE_DATA_BACKEND=mock` — die Tests warnen nicht,
> weil sie ohnehin immer im Demo-Modus laufen.

Tests laufen **immer** im Mock-Modus (in `vite.config.ts` per `test.env`
festgenagelt), unabhängig von `.env.local`.

```bash
npm test                 # 308 Tests
npx tsc -b --noEmit
npm run build
```

## Migration anwenden

Migrationen liegen in `supabase/migrations/` und werden über das
`lovable-documentor`-MCP angewendet:

```
run_migrations(project_id: c017bbbe-ff07-4c05-ee4d-6b781c97364b,
               environment: "gcpdev",
               github_repo: "everphone-gmbh/partner-csm")
```

**Reihenfolge beachten:** Der Runner liest die Dateien aus **GitHub**, nicht
von der Platte. Neue Migration also erst committen und pushen, dann anwenden —
sonst meldet er „0 applied" und man sucht lange.

Es gibt nur `gcpdev` — diese eine Instanz ist gleichzeitig Produktion. Kein
Staging, keine Down-Migrationen, kein dokumentiertes Backup. Eine Migration, die
zur Hälfte durchläuft, muss also von Hand geradegezogen werden. Deshalb vor dem
Anwenden zweimal lesen, und Datenänderungen und Strukturänderungen nicht in
derselben Datei mischen.

**Ist-Stand prüfen** statt der Dateinummern vertrauen — Einzelabfragen gehen
über das MCP `execute_sql` (dasselbe `project_id`), z. B.
`select table_name from information_schema.tables where table_schema='public'`
oder für den Redaktionsstand
`select viewname from pg_views where schemaname='public'`.
Ein Migrations-Ledger führt die Instanz nicht.

## Zugangsdaten

Anon- und Service-Role-Key kommen aus dem MCP-Werkzeug
`get_supabase_credentials_claude` (Vorlage `.env.example`) — nicht aus dem Repo.
Wer wofür zuständig ist, steht in `CLAUDE.local.md`.

## Deployen

Push auf `main` → GitHub Actions baut und veröffentlicht auf GitHub Pages.
Supabase-Zugangsdaten kommen aus GitHub-Repo-Secrets, nicht aus dem Code.
Prüfen mit `gh run list --limit 1`.

**CI prüft nur den Build** — `npm test`, `npm run lint` und die Typprüfung laufen
dort **nicht**. Ein Push mit roten Tests wird trotzdem veröffentlicht. Bis das im
Workflow ergänzt ist: vor jedem Push lokal `npm test && npx tsc -b --noEmit`.
Es gibt keinen Branch-Schutz, alles läuft direkt auf `main`.

## Anmelden

Sechs Konten (E-Mail/Passwort), Rollen: `overall_admin`, `sub_admin`
(= Relationship Manager), `account_manager`. Google-SSO ist vorbereitet, aber
devops-blockiert.

**Passwörter stehen absichtlich nicht hier** (öffentliches Repo) — bei Jannik
bzw. im Passwortmanager. Zum Testen einer anderen Rolle: abmelden und mit dem
Konto der Zielrolle anmelden; im Supabase-Modus gibt es **keinen**
Rollenumschalter, weil serverseitige Regeln entscheiden, nicht die Oberfläche.
Passwort ändern unter `/account`.

Nutzer anlegen, Passwort zurücksetzen und Rollen gegen die echte Datenbank
prüfen: siehe `CLAUDE.local.md` — dort steht auch, warum ein
`insert into auth.users` von Hand den Login zerschießt.

## Fallstricke — hier kann man unbemerkt etwas kaputt machen

1. **PostgREST-`upsert` schreibt die GANZE Zeile.** Bei `merge-duplicates`
   werden alle Spalten, die nicht im Payload stehen, auf NULL gesetzt. Ein
   Status-Wechsel löschte so früher Termin, Dauer, Treffpunkt und „Wofür" —
   ohne Fehlermeldung. Für Teil-Änderungen deshalb **UPDATE-dann-INSERT**, wie
   in `setAttendee`. Es gibt bewusst kein `.upsert(` mehr im Adapter.

2. **Die Lese-Views `contact_cards` / `activity_cards` laufen OHNE
   `security_invoker`** und umgehen damit die RLS der Basistabelle. Der
   `where is_privileged() or region_id = auth_region()` **in der View** ist der
   einzige Schutz gegen mandantenweites Lesen. Beim Ändern der Views nie
   entfernen. Die App liest Kontakte/Aktivitäten ausschließlich über diese
   Views (`CONTACT_READ` / `ACTIVITY_READ`); Schreiben geht direkt auf die
   Tabellen.

3. **Die Storage-Pfadkonvention ist sicherheitsrelevant.** Avatare liegen
   unter `contact-avatars/<contactId>/…`; die Zugriffsregel prüft
   `can_see_contact()` gegen den **ersten Pfadordner**. Wer den Pfad anders
   baut, hebelt die Regionsbeschränkung aus.

4. **`src/test/fakeSupabase.ts` muss echtes Postgres-Verhalten nachbilden.**
   Er kennt inzwischen Views, `onConflict`, `nullsFirst`, mehrfaches `order()`
   und die Audit-Trigger. Wenn ein Contract-Test **nur im Supabase-Zweig**
   scheitert: erst prüfen, ob der Fake das Verhalten überhaupt abbildet, bevor
   man den Adapter „reparlert". Zwei falsche Divergenzen kamen schon daher.

5. **Firmennamen-Normalisierung existiert doppelt** — TypeScript in
   `src/domain/everphoneAccounts.ts` und Python in
   `scripts/sync_everphone_accounts.py`. Weichen sie ab, findet der
   Bestandskunden-Abgleich nichts mehr. Bei Änderung beide anpassen und die
   Parität gegen echte Namen prüfen.

6. **Änderungen an personenbezogenen Daten protokollieren DB-Trigger**
   (Migration 0019), nicht die App. Nie „zur Sicherheit" zusätzlich im Client
   protokollieren, und im Protokoll niemals Feldwerte speichern — nur
   Feldnamen, sonst liegen die Daten doppelt.

7. **React:** Ein frisch erzeugtes Array/Objekt als Prop (`days={eventDays(e)}`)
   lässt `useEffect` bei jedem Rendern feuern und setzt Eingaben zurück,
   während getippt wird. Im Elternteil memoisieren, im Effekt auf einen
   stabilen Wert hören.

8. **UI-Detail:** `CardContent` hat standardmäßig `sm:pt-0`. Bei Karten ohne
   `CardHeader` deshalb `pt-5 sm:pt-5` setzen, sonst fehlt oben der Abstand.

## Datenpflege-Skripte

```bash
python3 scripts/sync_everphone_accounts.py        # Salesforce → everphone_accounts
python3 scripts/migrate_photos_to_storage.py      # Probelauf
python3 scripts/migrate_photos_to_storage.py --apply
```

Beide brauchen `.env.local` (Service-Key) und die angemeldete Salesforce-CLI:
`sf org login web --alias everphone`.

## Externe Systeme

| System | Zugriff | Zweck |
|---|---|---|
| Supabase (gcpdev) | `.env.local`, MCP `lovable-documentor` | Datenbank, Auth, Storage |
| Salesforce | `sf` CLI, Alias `everphone` | Kontakte, Bestandskunden (nur lesend) |
| GitHub | `gh` CLI | Repo, Actions, Pages |
| Google Drive | MCP-Connector | Vertriebsstruktur-Sheet |

## Arbeitsweise, die sich hier bewährt hat

- **Im Browser gegen die echte Datenbank verifizieren**, nicht nur Tests grün
  melden. Mehrere echte Fehler (Datenverlust beim Teil-Update, zurückgesetzte
  Eingabefelder, falsche Protokoll-Sortierung) sind erst dort aufgefallen.
- **Testdaten hinterher entfernen.** Die Datenbank enthält echte Personendaten;
  erfundene Kontakte, Fotos oder Verknüpfungen dürfen nicht liegen bleiben.
- **Vor Feature-Zusagen prüfen, ob die Tabelle Daten HAT**, nicht nur
  existiert. `contact_links` und `activities` sind aktuell leer — Features, die
  darauf aufbauen, liefern sonst leere Seiten.

## Offen

- **Google SSO** ist vorbereitet, aber von devops abhängig; Passwort-Login
  funktioniert bereits. Die einzutragenden URIs und der Stand: `CLAUDE.local.md`.
- **Datenschutz-Freigaben und Abnahmen** stehen teilweise aus — Einzelheiten und
  Zuständige in `CLAUDE.local.md`. Vor einer Ausweitung des Nutzerkreises dort
  nachsehen.
- **Datenpflege durch das Team** ist der eigentliche Engpass: viele Kontakte
  ohne Region und ohne Betreuer, keine bewerteten Beziehungen, keine gepflegten
  Verknüpfungen. Ohne diese Angaben laufen Dashboard, Bericht, Abdeckung und
  Vorstellungspfade weitgehend leer — das ist kein Fehler im Code.
- **Endpunkt-abhängig:** echte KI-Zusammenfassungen, Memo-Transkription und
  Visitenkarten-Erfassung brauchen einen EU-gehosteten Dienst mit AVV.
- **Offene technische Schulden** (Anhänge-Rechte, verwaiste Storage-Dateien,
  fehlende Pflege-Oberfläche für `org_units`, nicht reproduzierbarer Erstimport):
  aufgelistet in `CLAUDE.local.md`.
- Feature-Ideen mit Bewertung: siehe Projektnotizen (Abschnitt
  „Feature-Recherche").

## Wo die Entscheidungsgeschichte steht

Die vollständige Historie — was wir warum entschieden haben, welche Fehler
gefunden wurden, welche Alternativen verworfen — liegt in den Projektnotizen:

`~/.claude/projects/-Users-jannik-heeland/memory/project_partner_csm.md`

Ergänzend sind die Commit-Nachrichten bewusst ausführlich: `git log` erklärt
zu jeder Änderung das *Warum*, nicht nur das *Was*.
