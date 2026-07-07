-- Partner CSM Tool — Firmen-Dimension (Feedback-Runde KW 28)
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001-0012 on the Sovereign-Cloud
--   instance.
--
-- Scope-Erweiterung: das Tool mappt Partner über Firmen hinweg (Telekom,
-- Apple, Lenovo, Samsung, …); company ist die Arbeitgeber-Dimension der
-- Kontakte. contact_cards (0002) enthält die Spalte bewusst NICHT — für den
-- AM-Tier reicht der bestehende Sichtumfang, bis der DPO etwas anderes sagt.

alter table contacts add column company text;

create index on contacts (company);
