-- Event-Scheduling (Meeting-Feedback: „Scheduling-Modell nochmal anschauen")
--
-- Bisher: ein Event = ein Tag ohne Uhrzeiten, Teilnehmer nur mit Status und
-- „Wofür". Für Mehrtages-Messen (Digital X) und Standtermine zu grob.
--
-- Neu:
--   events.end_date       — Enddatum; NULL = eintägig (event_date bleibt Start)
--   event_attendees.slot_at       — Terminbeginn als Zeitpunkt
--   event_attendees.slot_minutes  — Dauer in Minuten (NULL = Standard in der UI)
--   event_attendees.meeting_point — Treffpunkt, z. B. „Halle 4, Stand B3"
--
-- slot_at ist timestamptz (ein Zeitpunkt), anders als reminders.due_date +
-- due_time (ein Kalendertag mit optionaler Tageszeit) — bewusst, weil ein
-- Standtermin ein Moment ist, eine Fälligkeit ein Datum.

alter table events add column end_date date;

alter table event_attendees
  add column slot_at timestamptz,
  add column slot_minutes integer,
  add column meeting_point text;

-- Enddatum darf nicht vor dem Start liegen.
alter table events
  add constraint events_end_after_start
  check (end_date is null or end_date >= event_date);

-- Dauer nur zusammen mit einem Termin, und positiv.
alter table event_attendees
  add constraint event_attendees_slot_minutes_sane
  check (
    slot_minutes is null
    or (slot_at is not null and slot_minutes > 0 and slot_minutes <= 24 * 60)
  );

-- Agenda-Abfragen sortieren nach Termin.
create index on event_attendees (event_id, slot_at);
