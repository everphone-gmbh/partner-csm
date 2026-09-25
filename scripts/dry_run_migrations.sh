#!/usr/bin/env bash
# Migrationen gegen ein WEGWERF-Postgres laufen lassen, bevor sie die einzige
# echte Instanz berühren.
#
# Warum es das gibt: es existiert kein Staging, kein Backup und kein Rollback
# (CLAUDE.md, „Migration anwenden"). Bis 0034 war die einzige Prüfung, die
# Datei zweimal zu lesen. Beim Bau von 0035 hat dieser Lauf zwei Fehler
# gefunden, die sonst live gegangen wären: ein Trigger, der bei DELETE auf ein
# nicht zugewiesenes NEW zugriff, und derselbe Trigger, der das Löschen eines
# Kontakts blockiert hätte — also den Löschweg nach DSGVO.
#
#   ./scripts/dry_run_migrations.sh
#
# Braucht ein lokales Postgres (brew install postgresql@17). Die Instanz liegt
# unter /tmp, läuft auf Port 55432 und wird am Ende wieder gestoppt. Sie hat
# mit der Produktionsdatenbank nichts zu tun.
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN=/tmp/pgdry
export LANG=C LC_ALL=C PATH="$PGBIN:$PATH"

# KEEP=1 laesst die Instanz stehen, um selbst nachzusehen:
#   psql -h /tmp/pgdry -p 55432 -U dry -d dryrun
cleanup() {
  if [ "${KEEP:-0}" = "1" ]; then
    echo "Instanz laeuft weiter: psql -h $RUN -p 55432 -U dry -d dryrun"
    return
  fi
  pg_ctl -D "$RUN/data" stop -s >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "$RUN"; mkdir -p "$RUN"
initdb -D "$RUN/data" -U dry --auth=trust --locale=C --encoding=UTF8 >/dev/null
pg_ctl -D "$RUN/data" -o "-p 55432 -k $RUN -c listen_addresses=''" -l "$RUN/pg.log" start >/dev/null
sleep 2

p() { psql -h "$RUN" -p 55432 -U dry -v ON_ERROR_STOP=1 -qtA -d dryrun "$@"; }
psql -h "$RUN" -p 55432 -U dry -q -d postgres -c "create database dryrun;" >/dev/null
p -f "$DIR/scripts/dryrun/supabase-shim.sql"

for f in "$DIR"/supabase/migrations/*.sql; do
  p -f "$f" || { echo "FEHLER in $(basename "$f")"; exit 1; }
done
echo "Alle Migrationen sauber durchgelaufen."

# Zugriffsregeln gegen echte Rollen — das deckt die Vitest-Suite bewusst nicht
# ab (fakeSupabase kennt keine RLS).
p -f "$DIR/scripts/dryrun/access-rules.sql"
