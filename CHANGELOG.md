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

## Unreleased → 1.1 (Freitag 2026-09-25)

### Neu

### Behoben

### Intern
