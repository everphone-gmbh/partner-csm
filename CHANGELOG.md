# Changelog — Partner CSM

Wöchentliche Releases, freitags im Gruppenchat „Partnerships Tool" gepostet. Version =
`1.<Wochenzähler>`; ein Hotfix dazwischen bekommt eine dritte Zahl (`1.3.1`). Jede Änderung
trägt sofort eine Zeile unter **Unreleased** ein, in den Worten eines Relationship Managers —
der Freitagspost wird von hier abgeschrieben.

Fehlerbehebungen gehen live, sobald sie geprüft sind; neue Funktionen sammeln sich bis Freitag.
Beides steht ab dem Merge unter **Unreleased**, freitags wird der Abschnitt nummeriert.

## 1.0 (Freitag 2026-09-18)

Erstes nummeriertes Release. Sammelt, was seit dem Digital-X-Event dazugekommen ist.

### Neu
- **Favoriten**: ein Stern an jedem Kontakt, in der Liste und oben auf der Karte. Der Filter „Favoriten" zeigt nur die markierten. Jeder sieht ausschließlich die eigenen Sterne. (Kontakte)
- **Sprachmemo statt tippen**: im Aktivitätsfeld einsprechen, der Text landet als Notiz. Danach optional „Fakten für die Karte vorschlagen" — Geburtstag, Familienstand, Hobbys, Kunden werden erkannt und einzeln bestätigt. Nur für Relationship Manager aufwärts. (Kontaktkarte)
- **Kontaktfoto entfernen**: neben der Kamera sitzt jetzt ein Papierkorb. Und das darf ab sofort **jede Rolle** für die Kontakte, die sie sieht — auch Account Manager in ihrer Region. (Kontaktkarte)
- **Event-Notizen aufräumen**: eine gespeicherte Notiz und einzelne Anhänge lassen sich löschen. Erlaubt für den Verfasser und für Relationship Manager aufwärts. (Events)
- **Schneller anlegen**: „+ Neuer Kontakt" direkt auf jeder Kontaktkarte, dazu „Speichern & weiteren anlegen" im Formular — Region und Betreuer bleiben stehen. Firma, Telefon und Mobil lassen sich schon beim Anlegen eintragen. (Kontakte)
- **Vorschläge beim Tippen** für Team und Firma, gespeist aus den vorhandenen Kontakten und der Telekom-Struktur. (Kontakte)
- **Schneller finden**: Team-Filter in der Liste, Regionen auf der Startseite anklickbar, und von einer Kontaktkarte zurück zu „← Team …". Filter stehen in der Adresse und lassen sich als Lesezeichen speichern. (Übersicht, Kontakte)
- **Nichts mehr verlieren**: wer eine Seite mit ungespeicherten Änderungen verlässt, wird gefragt — Speichern, Verwerfen oder Zurück. (Kontakte)
- **Aktivität neu gestaltet**: Historie als Zeitstrahl mit Datumsgruppen, farbigen Typ-Chips und Mini-Fotos; Filter auch am Handy bedienbar; Kontaktfoto per Klick groß. (Kontaktkarte)
- **Team & Rechte**: neuer Bereich „Team" für die Leitung — Rolle und Region jedes Kontos direkt umstellen, ohne Umweg. Neue Logins kommen später mit Google-Anmeldung. (Team)

### Behoben
- **Ein einmal hinterlegtes Kontaktfoto ließ sich nicht löschen**, nur überschreiben. Gemeldet aus dem Team, jetzt erledigt. (Kontaktkarte)
- **Ersetzte Bilder blieben im Speicher liegen** — unsichtbar, aber vorhanden. Sie werden jetzt mitgelöscht, die eine Altlast wurde entfernt. (Datenschutz)
- **Das Kreuz zum Löschen eines Galeriefotos** war nur mit der Maus sichtbar und am Tablet damit unauffindbar. Jetzt dauerhaft sichtbar und größer. (Kontaktkarte)
- **„Zum Startbildschirm hinzufügen" funktionierte auf Android nie** — die App lief unter einem Unterpfad, den die Installation nicht kannte. (Allgemein)
- **Die Leiste am unteren Rand des Handys** ließ die Beschriftungen ineinanderlaufen, sobald alle Einträge sichtbar waren. (Allgemein)

### Intern
- Datenbank auf Stand 0033: Favoriten pro Nutzer, Kontaktfoto über eine eng geschnittene Funktion statt gelockerter Schreibrechte, Rollenverwaltung mit Sperren gegen Selbst-Aussperrung. Rollenwechsel laufen ins Änderungsprotokoll.
- Routing auf den Daten-Router umgestellt, Grundlage für die Speichern/Verwerfen-Abfrage.
- 541 automatische Tests, Dependabot ohne offene Meldungen.

## 1.1 (Montag 2026-09-28)

Bündelt den Freitagsstand (25.09.) und den Ausbau vom Montag: die Sektion „Geschenke", das Organigramm je Region, das Zusammenführen von Dubletten und alle übrigen offenen Punkte, die keine anderen Personen brauchten. Der Post ging erst mit dem Montagsstand raus.

### Neu
- **Ein Kontakt kann zu mehreren Regionen gehören**: im Kontakt unter „Bearbeiten" stehen die Gebiete jetzt als Chips, weitere lassen sich hinzufügen und wieder entfernen. Wer zwei Gebiete betreut — etwa eine Teamassistenz —, taucht in beiden Listen, Filtern und Abdeckungen auf. Ein Gebiet muss bleiben. **Die Regionszahlen summieren sich dadurch auf mehr als die Gesamtzahl der Kontakte**; das ist gewollt, sonst fehlte so jemand in einer der Listen. (Kontakte, Übersicht, Bericht)
- **Eine gespeicherte Notiz lässt sich korrigieren**: am Eintrag sitzen jetzt ein Stift und ein Papierkorb. Wenn die Spracherkennung aus JOBRAD ein JOBRAT gemacht hat, ist das kein Dauerzustand mehr. Erlaubt für den Verfasser und für Relationship Manager; korrigierte Einträge sind als „bearbeitet" gekennzeichnet. (Kontaktkarte)
- **Neue Sektion „Geschenke"**: Weihnachts- und Geburtstagsgeschenke an einem Ort statt im Sheet. Je Anlass die Produkte mit Stückzahl, ein Stand von geplant bis zugestellt, und die Empfängerliste mit Absendern und Versandweg. Status direkt in der Zeile umstellen oder für viele auf einmal. Die Geschäftsführung (C-Level) steht in jeder neuen Zeile schon als Absender drin. Sichtbar ab Relationship Manager. (Geschenke)
- **Bestehende Listen importieren**: eine Liste aus dem Sheet einfach einfügen — sie wird erkannt, auch ohne Kopfzeile. Absender-Schreibweisen ordnet man einmal zu, gleichnamige Kontakte werden auf Wunsch verknüpft. Die bisherigen Listen sind bereits übernommen: Weihnachten 2025/26 mit 231 Geschenkboxen (zugestellt) und Weihnachten 2026/27 mit 55 Gin und 171 Schokolade (geplant). (Geschenke)
- **Geburtstage**: wer in den nächsten Wochen Geburtstag hat, mit „Geschenk planen" direkt daneben. (Geschenke)
- **Organigramm je Region**: jede Region hat jetzt eine eigene Seite mit Organigramm — erreichbar über das kleine Symbol neben der Region auf der Übersicht oder aus der gefilterten Kontaktliste. Kontakte stehen nach Ebene (Top-Management, Executive, Management, Fachebene, Assistenz), Linien zeigen, wer an wen berichtet. Über „Einordnen" setzt man Ebene und Führungskraft in einem Schritt, auch für Kontakte aus einer anderen Region. Wer für eine weitere Firma arbeitet, ist gestrichelt markiert. (Regionen, Kontaktkarte)
- **Dubletten zusammenführen**: im Monitoring steht bei jeder erkannten Dublette jetzt „Zusammenführen". Man wählt, welcher Kontakt bleibt, und bei abweichenden Feldern, welcher Wert gilt; alles, was am anderen hängt — Aktivitäten, Reminder, Fotos, Anknüpfungspunkte, Kunden, Regionen, Verknüpfungen, Event-Teilnahmen, Favoriten, Geschenke — zieht um. Nur für die Leitung. (Monitoring)
- **Telekom-Struktur selbst pflegen**: auf der Abdeckungsseite lassen sich die Einheiten, gegen die die Abdeckung misst, jetzt anlegen, ändern und löschen. Bisher ging das nur über Claude. Nur für die Leitung. (Abdeckung)
- **Geschenke auf der Kontaktkarte**: ist ein Empfänger mit einem Kontakt verknüpft, zeigt dessen Karte, was er wann bekommen hat und von wem. (Kontaktkarte)

### Behoben
- **Eine vorhandene Region noch einmal anzulegen** endete in einer englischen Datenbankmeldung. Jetzt wird das bestehende Gebiet einfach ausgewählt — Groß- und Kleinschreibung egal. (Kontakte)
- **Fehlermeldungen der Datenbank** landeten wortwörtlich auf dem Bildschirm. Sie werden jetzt überall in verständliche Sätze übersetzt. (Allgemein)
- **Massenzuordnung und mehrere Regionen**: wer in der Kontaktliste mehrere Kontakte auswählt und eine Region zuordnet, entscheidet jetzt, ob sie die bisherigen Regionen **ersetzt** (Vorgabe, wie früher) oder **dazukommt**. Bisher kam sie still dazu. (Kontakte)
- **Nichts mehr verlieren, auf allen Karten**: wer eine Notiz, einen noch nicht hinzugefügten Anknüpfungspunkt oder einen ungespeicherten Aktivitätseintrag — etwa ein frisch diktiertes Sprachmemo — stehen lässt und wegklickt, wird jetzt gefragt. Bisher galt das nur für die Stammdaten. (Kontaktkarte)

### Intern
- Datenbank 0034: Aktivitätseinträge nachträglich korrigierbar — änderbar ist nur der Inhalt; Kontakt, Verfasser, Zeitpunkt und Art bleiben gesperrt, und den Vermerk „bearbeitet" setzt die Datenbank selbst.
- Datenbank 0035: Regionen als eigene Zuordnung, alle 267 Kontakte übernommen. Die Sichtbarkeit für Account Manager gilt für jede ihrer Regionen.
- Trockenprobe: jede Migration läuft vor dem Einspielen gegen eine Wegwerf-Datenbank mit echten Rollen (`scripts/dry_run_migrations.sh`).
- Datenbank 0036: Geschenke als eigene Tabellen, nur ab Relationship Manager lesbar, mit Riegeln (ein Geburtstags-Anlass, eindeutige Absender, Produkt passt zum Anlass). Ein verknüpfter Kontakt bleibt löschbar — seine Geschenkhistorie geht dann mit.
- **Auswertungen serverseitig gesperrt** (0037): das Änderungsprotokoll und die Telekom-Struktur liest nur noch die Leitung — bisher waren sie für Relationship Manager nur in der Oberfläche ausgeblendet. Für die Vorschläge beim Tippen gibt es die Teamnamen weiter, aber nur die Namen. Event-Teilnehmer und -Gäste bearbeiten serverseitig nur noch Relationship Manager aufwärts, wie die Oberfläche es seit August zeigt.
- Zusammenführen läuft in der Datenbank als eine einzige Transaktion (0038) — halb zusammengeführt gibt es nicht. Jeder Vorgang wird festgehalten.
- Datenbank 0039: Ebene und weitere Firmen als Kontaktfelder, Geschäftsdaten wie Funktion und Team — für alle Rollen sichtbar, änderbar ab Relationship Manager.
- Trockenprobe prüft jetzt auch die Rollenverwaltung mit echten Rollen: niemand stuft sich selbst hoch, die eigene Rolle ist gesperrt, der letzte Administrator bleibt. Damit ist der Resttest zu 1.0 erledigt.

## Unreleased → 1.2 (Freitag 2026-10-02)

### Neu

### Behoben
- **Der Geschenke-Import liest das umgebaute Sheet**: seit jede Liste auf einem eigenen Blatt steht und die Fußzeile („in 2025/26") rechts neben der letzten Zeile, erkennt der Import Saison und Status wieder selbst. Bei Listen ohne Kopfzeile lässt sich die Spaltenerkennung nicht mehr von einer fast leeren Spalte in die Irre führen. (Geschenke)
- **Ein neuer Anlass entstand doppelt**, wenn zwei eingefügte Listen dazugehörten — etwa Gin und Schokolade, beide 2026/27. Jetzt landen beide im selben Anlass, gleichnamige Produkte ebenso. (Geschenke)
- **Gleichnamige Kontakte werden nur noch verknüpft, wenn die Firma passt**: ein Empfänger bei einer anderen Firma landet nicht mehr auf der Karte des gleichnamigen Telekom-Kontakts. (Geschenke)

### Intern
- CHANGELOG aufgeräumt: doppelte Abschnitte entfernt, 1.1 nennt jetzt Freitag und Montag.
- 737 automatische Tests. Testwerkzeug vitest auf 4.1.11 — schließt die zwei offenen Dependabot-Meldungen (betrafen nur die Entwicklung, nicht das ausgelieferte Tool).
