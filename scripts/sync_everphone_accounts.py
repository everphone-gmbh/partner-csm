# -*- coding: utf-8 -*-
"""Salesforce -> Supabase-Sync der Everphone-Account-Referenz.

Fuellt `everphone_accounts` (Migration 0015), damit das Partner-CSM-Tool
warnen kann, wenn ein Kunde bereits Everphone-Kunde ist.

Uebertragen werden nur bestehende/ehemalige Kundenbeziehungen und Partner —
Prospects (~38k reine Leads) bleiben draussen: sie wuerden die Liste
dominieren, ohne fuer die Warnung relevant zu sein.

Es werden ausschliesslich FIRMENDATEN uebertragen (Name, Typ, Geraetezahl),
keine personenbezogenen Daten.

Voraussetzungen:
  - Salesforce CLI angemeldet:  sf org login web --alias everphone
  - SUPABASE_SERVICE_ROLE_KEY in partner-csm/.env.local

Aufruf (aus dem Repo-Wurzelverzeichnis):
  python3 scripts/sync_everphone_accounts.py
"""
import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.request

SF_ALIAS = "everphone"
RELEVANT_TYPES = ["Customer", "Inactive Customer", "Offboarding", "Partner", "Other"]
BATCH = 500

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(REPO_ROOT, ".env.local")

# --- Namensnormalisierung: muss zu src/domain/everphoneAccounts.ts passen ---
LEGAL_FORMS = [
    "gmbh & co kg", "ag & co kgaa", "gmbh", "mbh", "kgaa", "kg", "ag", "se",
    "ohg", "gbr", "ug", "ek", "ev", "holding", "deutschland", "germany",
    "group", "gruppe", "inc", "ltd", "llc", "plc", "bv", "nv", "sa", "sas",
    "srl", "spa", "oy", "ab", "as",
]
PUNCT_RE = re.compile(r"[.,;:!?\"'`´()\[\]{}/\\|+*_–—-]")


def normalize_company_name(raw):
    s = unicodedata.normalize("NFC", raw or "").lower()
    for src, dst in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(src, dst)
    s = PUNCT_RE.sub(" ", s).replace("&", " & ")
    s = re.sub(r"\s+", " ", s).strip()

    changed = True
    while changed:
        changed = False
        for form in LEGAL_FORMS:
            token = re.sub(r"\s+", " ", form.replace(".", "")).strip()
            if s == token:
                continue
            if s.endswith(" " + token):
                s = re.sub(r"\s*&\s*$", "", s[: -(len(token) + 1)]).strip()
                changed = True
                break
    return re.sub(r"\s+", " ", s).strip()


def read_service_key():
    if not os.path.exists(ENV_FILE):
        sys.exit("FEHLER: %s nicht gefunden." % ENV_FILE)
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("FEHLER: SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local")


def read_supabase_url():
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            if line.startswith("VITE_SUPABASE_URL="):
                return line.split("=", 1)[1].strip()
    sys.exit("FEHLER: VITE_SUPABASE_URL fehlt in .env.local")


def fetch_salesforce_accounts():
    types = ", ".join("'%s'" % t for t in RELEVANT_TYPES)
    soql = (
        "SELECT Id, Name, Type, Total_Active_Rentals__c FROM Account "
        "WHERE Type IN (%s) AND Name != null ORDER BY Name" % types
    )
    print("Salesforce-Abfrage laeuft …")
    proc = subprocess.run(
        ["sf", "data", "query", "--query", soql, "--target-org", SF_ALIAS,
         "--json", "--result-format", "json"],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        sys.exit("FEHLER bei der Salesforce-Abfrage:\n%s" % (proc.stderr or proc.stdout)[:2000])
    payload = json.loads(proc.stdout)
    if payload.get("status") != 0:
        sys.exit("FEHLER: Salesforce meldet Status %s" % payload.get("status"))
    return payload["result"]["records"]


def upsert(rows, base_url, key):
    url = "%s/rest/v1/everphone_accounts?on_conflict=salesforce_id" % base_url
    headers = {
        "apikey": key,
        "Authorization": "Bearer %s" % key,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    req = urllib.request.Request(
        url, method="POST", headers=headers,
        data=json.dumps(rows, ensure_ascii=False).encode("utf-8"),
    )
    try:
        urllib.request.urlopen(req).read()
    except urllib.error.HTTPError as e:
        sys.exit("FEHLER beim Upsert (%s): %s" % (e.code, e.read().decode("utf-8", "replace")[:800]))


def main():
    key = read_service_key()
    base_url = read_supabase_url()
    records = fetch_salesforce_accounts()
    print("%d relevante Accounts aus Salesforce gelesen." % len(records))

    rows, skipped = [], 0
    for rec in records:
        name = (rec.get("Name") or "").strip()
        normalized = normalize_company_name(name)
        if not normalized:
            skipped += 1
            continue
        rentals = rec.get("Total_Active_Rentals__c")
        rows.append({
            "salesforce_id": rec["Id"],
            "name": name,
            "name_normalized": normalized,
            "account_type": rec.get("Type") or "Other",
            "active_rentals": int(rentals) if rentals is not None else None,
        })

    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        upsert(chunk, base_url, key)
        print("  Batch %d: %d Accounts uebertragen" % (i // BATCH + 1, len(chunk)))

    from collections import Counter
    print("\nFertig: %d Accounts synchronisiert." % len(rows))
    if skipped:
        print("%d ohne verwertbaren Namen uebersprungen." % skipped)
    for t, n in Counter(r["account_type"] for r in rows).most_common():
        print("  %-20s %d" % (t, n))


if __name__ == "__main__":
    main()
