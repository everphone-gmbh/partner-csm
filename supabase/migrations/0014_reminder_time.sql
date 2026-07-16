-- Reminder mit optionaler Uhrzeit (Meeting-Feedback 2026-07-16).
-- due_date bleibt eigenständig (Sortierung/Abwärtskompatibilität);
-- due_time ergänzt die Tageszeit, NULL = ganztägig.
alter table reminders add column due_time time;
