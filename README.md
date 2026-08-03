# Partner CSM

Internes Beziehungs-CRM des Everphone-Partnerships-Teams für die Pflege von
Partnerkontakten bei Telekom. Kein Ersatz für Salesforce, sondern die Ebene
darüber: wer kennt wen, wie steht die Beziehung, was ist der nächste Schritt.

**Kein Open-Source-Projekt.** Das Repository ist öffentlich, damit das Team ohne
GitHub-Konto auf die veröffentlichte Oberfläche zugreifen kann. Es enthält
ausschließlich Quellcode — alle Daten und Zugangsdaten liegen außerhalb.

## Schnellstart

```bash
npm install
cp .env.example .env.local
npm run dev
```

Ohne weitere Einstellungen startet der **Demo-Modus**: Beispieldaten aus dem
Speicher, kein Login, kein Netzzugriff, dazu ein Rollenumschalter in der
Kopfzeile. Für Arbeit an der Oberfläche ist das der richtige Modus.

Für den Betrieb gegen die echte Datenbank siehe **[CLAUDE.md](CLAUDE.md)** —
dort stehen Rollen, Migrationen, Auslieferung und die Fallstricke, an denen man
unbemerkt etwas kaputt machen kann. Diese Datei zuerst lesen.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver auf Port 5173 |
| `npm test` | Testsuite (läuft immer im Demo-Modus) |
| `npm run build` | Produktionsbündel nach `dist/` |
| `npm run lint` | Oxlint |
| `npx tsc -b --noEmit` | Typprüfung |

## Aufbau

```
src/domain/      Fachlogik und Typen, ohne UI und ohne Datenbank
src/data/        Repository-Schnittstelle + zwei Implementierungen
                 (Demo im Speicher / Supabase) — vertraglich gleich getestet
src/features/    Oberfläche je Bereich (Kontakte, Events, Bericht, …)
src/components/  Wiederverwendbare Bausteine
supabase/        SQL-Migrationen, fortlaufend numeriert
scripts/         Datenpflege (Python)
```

Der Zuschnitt in `src/data/` ist die zentrale Entscheidung: die Oberfläche kennt
nur die Schnittstelle, nie die Datenbank. Eine gemeinsame Vertrags-Testsuite
prüft beide Implementierungen gegen dieselben Erwartungen, damit der Demo-Modus
nicht vom Ernstfall abweicht.

## Technik

React 19, TypeScript, Vite, Tailwind v4, Vitest.
Backend: Supabase (Everphone Sovereign Cloud, EU) mit Row Level Security.
Auslieferung: GitHub Actions auf GitHub Pages bei jedem Push auf `main`.
