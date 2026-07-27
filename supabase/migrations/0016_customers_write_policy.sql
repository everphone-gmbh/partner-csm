-- Fix: `customers` hatte nur eine SELECT-Policy (0002), nie eine für Schreiben.
--
-- Folge: Sobald RLS aktiv ist, scheitert das Zuordnen eines Kunden mit
-- „new row violates row-level security policy for table customers" — die
-- Kunden-Pflege war also nie nutzbar. Verdeckt war das nur, weil RLS bis
-- 2026-07-16 deaktiviert war.
--
-- `customers` sind geteilte Firmen-Entities ohne contact_id, also greift keine
-- Regions-Einschränkung: Schreiben privilegiert (Overall/Sub-Admin), analog zu
-- contact_customers_write und side_facts_write aus 0008.

create policy customers_write on customers for all
  using (is_privileged())
  with check (is_privileged());
