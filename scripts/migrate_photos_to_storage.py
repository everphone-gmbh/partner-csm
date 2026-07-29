# -*- coding: utf-8 -*-
"""Altbestand: Data-URL-Bilder aus der Datenbank nach Supabase Storage umziehen.

Vor Migration 0020 landeten Fotos base64-codiert direkt in Postgres-Spalten
(`contacts.photo_url`, `contact_photos.url`, `event_notes.attachments[].url`).
Die App liest solche Werte weiterhin, es besteht also kein Zwang — dieses
Skript raeumt sie trotzdem auf, damit die Zeilen klein werden.

Idempotent: bereits umgezogene Werte (`storage:...`) werden uebersprungen.

Aufruf aus dem Repo-Wurzelverzeichnis:
  python3 scripts/migrate_photos_to_storage.py            # Probelauf
  python3 scripts/migrate_photos_to_storage.py --apply    # wirklich umziehen
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(REPO_ROOT, ".env.local")

EXT_BY_MIME = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/gif": "gif",
    "audio/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/ogg": "ogg", "audio/wav": "wav",
}
DATA_URL_RE = re.compile(r"^data:([^;,]+);base64,(.*)$", re.DOTALL)


def env(key):
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    sys.exit("FEHLER: %s fehlt in .env.local" % key)


BASE = env("VITE_SUPABASE_URL")
KEY = env("SUPABASE_SERVICE_ROLE_KEY")
HDRS = {"apikey": KEY, "Authorization": "Bearer %s" % KEY}


def rest(method, path, body=None, extra=None):
    headers = dict(HDRS)
    headers["Content-Type"] = "application/json"
    if extra:
        headers.update(extra)
    req = urllib.request.Request(
        BASE + path, method=method, headers=headers,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
    )
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def upload(bucket, path, raw, mime):
    headers = dict(HDRS)
    headers["Content-Type"] = mime
    req = urllib.request.Request(
        "%s/storage/v1/object/%s/%s" % (BASE, bucket, path),
        method="POST", headers=headers, data=raw,
    )
    try:
        urllib.request.urlopen(req).read()
    except urllib.error.HTTPError as e:
        sys.exit("FEHLER beim Upload (%s): %s" % (e.code, e.read()[:300]))


def move(data_url, bucket, folder, apply_changes):
    """Data-URL nach Storage schieben; gibt die neue Referenz zurueck."""
    m = DATA_URL_RE.match(data_url or "")
    if not m:
        return None, 0
    mime, b64 = m.group(1), m.group(2)
    raw = base64.b64decode(b64)
    ext = EXT_BY_MIME.get(mime.lower(), "bin")
    path = "%s/%s.%s" % (folder, uuid.uuid4(), ext)
    if apply_changes:
        upload(bucket, path, raw, mime)
    return "storage:%s/%s" % (bucket, path), len(data_url)


def main():
    apply_changes = "--apply" in sys.argv
    print("Modus: %s\n" % ("UMZIEHEN" if apply_changes else "Probelauf (nichts wird geändert)"))
    saved = 0

    # 1) Profilbilder
    rows = rest("GET", "/rest/v1/contacts?select=id,full_name,photo_url&photo_url=like.data:*")
    print("Profilbilder als Data-URL: %d" % len(rows))
    for row in rows:
        ref, size = move(row["photo_url"], "contact-avatars", row["id"], apply_changes)
        if not ref:
            continue
        saved += size
        print("  %-30s %6d Zeichen -> %s" % (row["full_name"][:30], size, ref.split("/")[-1]))
        if apply_changes:
            rest("PATCH", "/rest/v1/contacts?id=eq.%s" % row["id"],
                 {"photo_url": ref}, {"Prefer": "return=minimal"})

    # 2) Galeriefotos
    photos = rest("GET", "/rest/v1/contact_photos?select=id,contact_id,url&url=like.data:*")
    print("\nGaleriefotos als Data-URL: %d" % len(photos))
    for row in photos:
        ref, size = move(row["url"], "contact-gallery", row["contact_id"], apply_changes)
        if not ref:
            continue
        saved += size
        print("  Foto %s: %d Zeichen" % (row["id"][:8], size))
        if apply_changes:
            rest("PATCH", "/rest/v1/contact_photos?id=eq.%s" % row["id"],
                 {"url": ref}, {"Prefer": "return=minimal"})

    # 3) Anhaenge an Event-Notizen (jsonb-Array)
    notes = rest("GET", "/rest/v1/event_notes?select=id,event_id,attachments")
    touched = 0
    for note in notes:
        atts = note.get("attachments") or []
        changed = False
        for att in atts:
            ref, size = move(att.get("url", ""), "event-note-media", note["event_id"], apply_changes)
            if ref:
                att["url"] = ref
                saved += size
                changed = True
        if changed:
            touched += 1
            if apply_changes:
                rest("PATCH", "/rest/v1/event_notes?id=eq.%s" % note["id"],
                     {"attachments": atts}, {"Prefer": "return=minimal"})
    print("\nNotizen mit Data-URL-Anhaengen: %d" % touched)

    print("\nAus Datenbankzeilen entfernt: %.1f KB" % (saved / 1024.0))
    if not apply_changes and saved:
        print("Mit --apply erneut aufrufen, um den Umzug durchzufuehren.")


if __name__ == "__main__":
    main()
