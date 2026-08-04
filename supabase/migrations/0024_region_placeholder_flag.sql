-- Platzhalter kennzeichnen, statt sie am Namen zu erraten
--
-- 446 der 671 Kontakte sitzen in der Region „Unbekannt" (Stand 2026-08-03).
-- Das ist keine Region, sondern ein Platzhalter aus dem Import: die Kontakte
-- kamen ohne verlässliche Regionsangabe, und weil contacts.region_id NOT NULL
-- ist, brauchten sie ein Ziel.
--
-- Bisher wusste das nur der Mensch. Eine Erkennung über den Namen im Code wäre
-- brüchig — jemand benennt die Region um, es kommen weitere Platzhalter dazu,
-- oder eine andere Schreibweise. Die Datenbank sagt es deshalb selbst. So lassen
-- sich künftig weitere Platzhalter kennzeichnen, ohne Code anzufassen.
--
-- Die Oberfläche stellt Platzhalter sichtbar anders dar als echte Zuordnungen,
-- damit niemand 446 Kontakte für „regional zugeordnet" hält.

alter table regions add column is_placeholder boolean not null default false;

update regions set is_placeholder = true where name = 'Unbekannt';
