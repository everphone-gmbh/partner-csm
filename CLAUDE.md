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
> und `deleteContact` löscht dort zusätzlich die Storage-Dateien. Die Tests
> warnen nicht, weil sie ohnehin immer im Demo-Modus laufen.
>
> **Für Arbeit an der Oberfläche deshalb den Demo-Start nehmen:**
>
> ```bash
> npm run dev -- --mode demo
> ```
>
> Der lädt `.env.demo` (`VITE_DATA_BACKEND=mock`) **nach** `.env.local` und
> überschreibt sie damit, läuft auf Port 5174 und rührt die echten Daten nicht
> an. `.env.demo` ist gitignored; fehlt sie, genügt genau diese eine Zeile.

Tests laufen **immer** im Mock-Modus (in `vite.config.ts` per `test.env`
festgenagelt), unabhängig von `.env.local`.

```bash
npm test                 # 333 Tests
npx tsc -b --noEmit      # App
npx tsc -p tsconfig.test.json --noEmit   # Tests (App-Config schließt sie aus)
npm run build
```

### Tests für ganze Seiten

`src/test/pageHarness.tsx` stellt Router, Sitzung und ein **frisches** Repository
je Testfall. Eine Testdatei braucht genau zwei Zeilen — sie müssen vor den
Importen stehen, weil `vi.mock` hochgezogen wird:

```ts
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))
```

Dann `renderPage(<Seite />, { route: '/contacts', as: 'account_manager' })`.
Zurück kommt zusätzlich `repo`, damit ein Test den Zustand nach einer Aktion
direkt prüfen kann statt nur die Oberfläche. `currentLocation()` zeigt, wohin der
Router gesprungen ist — damit lässt sich belegen, dass ein Klick **nicht**
navigiert hat.

Warum die Ersatzmodule: das echte `repositoryProvider` liefert im Mock-Modus
einen Singleton (Testfälle würden sich die Daten verändern), und der echte
`SessionProvider` leitet die Rolle aus einer Supabase-Anmeldung ab.

**Was diese Tests nicht abdecken:** Anmeldung, Rollenherleitung und alles
Serverseitige — RLS, die redigierenden Views, Storage-Regeln. Dafür bleibt es bei
der Prüfung von Hand mit echtem Token.

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

## Edge Functions

Liegen in `supabase/functions/<name>/index.ts` (Deno) und werden beim **Push**
automatisch von GitHub aus deployt; Status und URL liefert das MCP-Werkzeug
`deploy_edge_function` (gleiches `project_id` wie Migrationen). Secrets setzt
`set_edge_function_secret` (GCP Secret Manager, bestehende Schlüssel bleiben
erhalten) — danach einmal neu deployen, damit sie greifen.

Aktuell gibt es `extract-transcript` (Auto-Weg des Transkript-Imports): prüft
Login + RM+-Rolle, redigiert den Kontaktnamen vor dem Modellaufruf und ruft den
Gemini-Endpoint aus dem Secret `TRANSCRIPT_AI_URL`. Auth wahlweise per Secret
`TRANSCRIPT_AI_KEY` (API-Key) oder — Produktionspfad, Vertex nimmt keine Keys —
per OAuth-Token vom Cloud-Run-Metadata-Server, optional mit Impersonation des
Service Accounts aus `TRANSCRIPT_AI_SA` (der Runtime-SA braucht dann
`serviceAccountTokenCreator` darauf). Ohne `TRANSCRIPT_AI_URL` antwortet sie
`not_configured` und die Karte fällt auf den manuellen Gemini-Workspace-Weg
zurück — der Code kann also vor dem Schlüssel live sein. **Der REGELN-Block
des Prompts existiert doppelt** (Function + `extraction.ts`);
`promptParity.test.ts` erzwingt Wortgleichheit.

Daneben `transcribe-memo` (Sprachnotiz → Text, gleiche Secrets und gleiche
Auth): nimmt Base64-Audio entgegen (Chrome webm und Safari mp4 sind gegen
Gemini verifiziert), transkribiert über dasselbe Modell und speichert das
Audio nirgends. Bewusst eine Notiz NACH dem Gespräch, kein Anruf-Mitschnitt.
Auth-Block/`buildAuthHeader` sind eine dokumentierte Kopie aus
`extract-transcript` — Änderungen dort mitziehen.

## Zugangsdaten

Anon- und Service-Role-Key kommen aus dem MCP-Werkzeug
`get_supabase_credentials_claude` (Vorlage `.env.example`) — nicht aus dem Repo.
Wer wofür zuständig ist, steht in `CLAUDE.local.md`.

## Deployen

Push auf `main` → GitHub Actions baut und veröffentlicht auf GitHub Pages.
Supabase-Zugangsdaten kommen aus GitHub-Repo-Secrets, nicht aus dem Code.
Prüfen mit `gh run list --limit 1`.

**Zwei Workflows, zwei Aufgaben:**

- `deploy.yml` (Push auf `main`) fährt `npm test`, `npm run lint`,
  `tsc -p tsconfig.test.json --noEmit`, dann `npm run build` und veröffentlicht.
  Scheitert einer der Schritte, läuft `deploy` nicht — rote Tests gehen nicht
  live. Schützt die **veröffentlichte Seite**.
- `ci.yml` (Pull Requests) fährt dieselben Prüfungen ohne Veröffentlichung.
  Schützt den **Hauptzweig**, vor allem gegen ungeprüfte Dependabot-PRs.

Zwei Feinheiten, die leicht falsch gemacht werden:

- `deploy.yml` hat bewusst `cancel-in-progress: false`. Mit `true` würde ein
  nachgeschobener Push mit roten Tests einen noch laufenden grünen Lauf
  abwürgen: dessen `deploy` liefe nie, der eigene scheitert — und live bliebe
  stumm der Stand von davor. In der Oberfläche sieht das nur nach „cancelled"
  aus.
- Die Typprüfung braucht **beide** Konfigurationen. `tsc -b` prüft `src` ohne
  Tests, weil `tsconfig.app.json` sie ausschließt; `tsconfig.test.json` holt die
  32 Test- und Testinfrastruktur-Dateien nach — darunter `fakeSupabase.ts`.

**Branch-Schutz auf `main`** (seit 2026-08-03): der Check `test` aus `ci.yml` ist
Pflicht, Force-Push und Löschen sind gesperrt, eine Review-Pflicht gibt es nicht
(dafür ist das Team zu klein). Ein roter Pull Request lässt sich damit nicht mehr
mergen.

Bewusst **nicht** auf Administratoren ausgedehnt: Jannik pusht direkt auf `main`,
und genau das soll weiter funktionieren. Direkte Pushes werden deshalb wie bisher
erst *nach* dem Push von `deploy.yml` geprüft — die Schranke verhindert dann die
Veröffentlichung, nicht den Commit. Wer sicher gehen will, fährt vorher lokal
`npm test`.

Grenze: `oxlint` beendet auch mit Warnungen als Erfolg und fängt daher nur echte
Fehler.

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

9. **Kein Auswahlkästchen in einen Link legen.** In der Kontaktliste steckte es
   zuerst in der verlinkten Karte, mit `preventDefault` gegen die Navigation —
   das unterdrückt aber auch das native Umschalten: die Leiste zählte richtig,
   das Kästchen blieb optisch leer. Außerdem ist es ungültiges Markup. Kästchen
   **neben** den Link legen, Link nimmt den Rest der Zeile.

10. **Leer heißt hier meist `''`, nicht `NULL`.** Der Import hat 458 Positionen
    als leeren String hinterlassen; `count(position)` liefert deshalb 671,
    obwohl nur 213 Kontakte eine Position haben. `src/domain/placeholders.ts`
    ist die einzige Wahrheit dazu (`isBlank`, `findGaps`, `isUnassigned`) —
    Lückenprüfungen dort ergänzen, nicht in Komponenten nachbauen.

11. **Was Platzhalter ist, sagt die Datenbank**, nicht der Code:
    `regions.is_placeholder` (Migration 0024). Die Region „Unbekannt" hält 446
    Kontakte und ist kein Vertriebsgebiet. Nie über den Namen erkennen — eine
    Umbenennung hebelt das sonst aus.

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
- **Datenpflege durch das Team** ist der eigentliche Engpass (gemessen am
  2026-08-03): 446 der 671 Kontakte sitzen in der Platzhalter-Region
  „Unbekannt", 607 haben keinen Betreuer, 458 keine Position, 467 kein Team;
  0 bewertete Beziehungen, 0 Verknüpfungen, 0 Gespräche, 0 Reminder, 0 Events.
  Dashboard, Bericht, Abdeckung und Vorstellungspfade laufen deshalb weitgehend
  leer — das ist kein Fehler im Code. Zahlen vor dem Zitieren neu messen; bei
  Textspalten auf nicht-leere Werte zählen, nicht nur auf `not null`.
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
