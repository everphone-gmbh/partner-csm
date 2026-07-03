-- Partner CSM Tool — Buying-Center-Rolle pro Kontakt
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001-0010 on the Sovereign-Cloud
--   instance.

alter table contacts add column buying_role text
  check (buying_role in ('champion', 'supporter', 'neutral', 'blocker', 'gatekeeper'));
