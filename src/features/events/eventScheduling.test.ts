import { describe, expect, it } from 'vitest'
import {
  bySlotFirst,
  conflictingContactIds,
  DEFAULT_SLOT_MINUTES,
  eventDays,
  findSlotConflicts,
  inputsToSlot,
  isMultiDay,
  isSlotWithinEvent,
  slotTimeLabel,
  slotToInputs,
  slotWindow,
} from './eventScheduling'

const SINGLE = { date: '2026-10-14', endDate: undefined }
const MULTI = { date: '2026-10-14', endDate: '2026-10-16' }

/** Zeitpunkt in Ortszeit — die UI rechnet bewusst in Ortszeit. */
function localSlot(day: string, hh: number, mm = 0): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, hh, mm).toISOString()
}

describe('eventDays / isMultiDay', () => {
  it('gibt bei eintägigen Events genau einen Tag zurück', () => {
    expect(eventDays(SINGLE)).toEqual(['2026-10-14'])
    expect(isMultiDay(SINGLE)).toBe(false)
  })

  it('zählt bei mehrtägigen Events alle Tage inklusive Rand', () => {
    expect(eventDays(MULTI)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16'])
    expect(isMultiDay(MULTI)).toBe(true)
  })

  it('ignoriert ein Enddatum vor dem Start', () => {
    expect(eventDays({ date: '2026-10-14', endDate: '2026-10-01' })).toEqual(['2026-10-14'])
  })

  it('kommt über Monats- und Jahresgrenzen', () => {
    expect(eventDays({ date: '2026-12-30', endDate: '2027-01-02' })).toEqual([
      '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    ])
  })
})

describe('slotWindow', () => {
  it('ohne Termin kein Fenster', () => {
    expect(slotWindow({ slotAt: undefined, slotMinutes: 30 })).toBeUndefined()
  })

  it('nimmt die Standarddauer, wenn keine gepflegt ist', () => {
    const at = localSlot('2026-10-14', 10)
    const win = slotWindow({ slotAt: at, slotMinutes: undefined })!
    expect(win.endMs - win.startMs).toBe(DEFAULT_SLOT_MINUTES * 60_000)
  })

  it('nutzt die gepflegte Dauer', () => {
    const win = slotWindow({ slotAt: localSlot('2026-10-14', 10), slotMinutes: 90 })!
    expect(win.endMs - win.startMs).toBe(90 * 60_000)
  })

  it('behandelt eine unplausible Dauer wie keine', () => {
    const win = slotWindow({ slotAt: localSlot('2026-10-14', 10), slotMinutes: 0 })!
    expect(win.endMs - win.startMs).toBe(DEFAULT_SLOT_MINUTES * 60_000)
  })

  it('liefert bei unlesbarem Zeitstempel nichts', () => {
    expect(slotWindow({ slotAt: 'kein-datum', slotMinutes: 30 })).toBeUndefined()
  })
})

describe('isSlotWithinEvent', () => {
  it('akzeptiert Termine an Event-Tagen', () => {
    expect(isSlotWithinEvent(localSlot('2026-10-15', 14, 30), MULTI)).toBe(true)
    expect(isSlotWithinEvent(localSlot('2026-10-14', 9), SINGLE)).toBe(true)
  })

  it('lehnt Termine außerhalb ab', () => {
    expect(isSlotWithinEvent(localSlot('2026-10-17', 9), MULTI)).toBe(false)
    expect(isSlotWithinEvent(localSlot('2026-10-15', 9), SINGLE)).toBe(false)
  })

  it('akzeptiert Randzeiten des ersten und letzten Tages', () => {
    expect(isSlotWithinEvent(localSlot('2026-10-14', 0, 0), MULTI)).toBe(true)
    expect(isSlotWithinEvent(localSlot('2026-10-16', 23, 59), MULTI)).toBe(true)
  })

  it('lehnt unlesbare Zeitstempel ab', () => {
    expect(isSlotWithinEvent('kaputt', MULTI)).toBe(false)
  })
})

describe('findSlotConflicts', () => {
  const at = (hh: number, mm = 0) => localSlot('2026-10-14', hh, mm)

  it('findet echte Überschneidungen', () => {
    const conflicts = findSlotConflicts([
      { contactId: 'a', slotAt: at(10), slotMinutes: 60 },
      { contactId: 'b', slotAt: at(10, 30), slotMinutes: 30 },
    ])
    expect(conflicts).toEqual([['a', 'b']])
  })

  it('lässt direkt anschließende Termine gelten', () => {
    expect(
      findSlotConflicts([
        { contactId: 'a', slotAt: at(10), slotMinutes: 30 },
        { contactId: 'b', slotAt: at(10, 30), slotMinutes: 30 },
      ]),
    ).toEqual([])
  })

  it('ignoriert Teilnehmer ohne Termin', () => {
    expect(
      findSlotConflicts([
        { contactId: 'a', slotAt: undefined, slotMinutes: undefined },
        { contactId: 'b', slotAt: undefined, slotMinutes: undefined },
      ]),
    ).toEqual([])
  })

  it('meldet nur die Paare, die sich wirklich überlappen', () => {
    // a 10:00–11:00 überlappt b (10:15–10:30) und c (10:45–11:15);
    // b und c überlappen sich untereinander NICHT.
    const attendees = [
      { contactId: 'a', slotAt: at(10), slotMinutes: 60 },
      { contactId: 'b', slotAt: at(10, 15), slotMinutes: 15 },
      { contactId: 'c', slotAt: at(10, 45), slotMinutes: 30 },
    ]
    expect(findSlotConflicts(attendees)).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ])
    // Betroffen sind trotzdem alle drei — über a verbunden.
    expect(conflictingContactIds(attendees)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('meldet nichts bei klar getrennten Terminen', () => {
    expect(
      findSlotConflicts([
        { contactId: 'a', slotAt: at(9), slotMinutes: 30 },
        { contactId: 'b', slotAt: at(14), slotMinutes: 30 },
      ]),
    ).toEqual([])
  })

  it('erkennt Überschneidungen unabhängig von der Eingabereihenfolge', () => {
    const spaet = { contactId: 'spaet', slotAt: at(10, 30), slotMinutes: 30 }
    const frueh = { contactId: 'frueh', slotAt: at(10), slotMinutes: 60 }
    expect(findSlotConflicts([spaet, frueh])).toEqual([['frueh', 'spaet']])
  })
})

describe('bySlotFirst', () => {
  it('sortiert Termine chronologisch vor terminlose Teilnehmer', () => {
    const list = [
      { contactId: 'ohne', slotAt: undefined, slotMinutes: undefined },
      { contactId: 'spaet', slotAt: localSlot('2026-10-14', 15), slotMinutes: 30 },
      { contactId: 'frueh', slotAt: localSlot('2026-10-14', 9), slotMinutes: 30 },
    ]
    expect([...list].sort(bySlotFirst).map((x) => x.contactId)).toEqual(['frueh', 'spaet', 'ohne'])
  })
})

describe('Ein- und Ausgabe der Formularfelder', () => {
  it('macht den Rundlauf Felder → Zeitpunkt → Felder verlustfrei', () => {
    const slot = inputsToSlot('2026-10-15', '14:30')!
    expect(slotToInputs(slot)).toEqual({ day: '2026-10-15', time: '14:30' })
    expect(slotTimeLabel(slot)).toBe('14:30')
  })

  it('verlangt Datum UND Zeit', () => {
    expect(inputsToSlot('2026-10-15', '')).toBeUndefined()
    expect(inputsToSlot('', '14:30')).toBeUndefined()
  })

  it('weist unplausible Eingaben ab', () => {
    expect(inputsToSlot('2026-10-15', '25:00')).toBeUndefined()
    expect(inputsToSlot('2026-10-15', '10:75')).toBeUndefined()
    expect(inputsToSlot('15.10.2026', '10:00')).toBeUndefined()
  })

  it('liefert für fehlende Termine leere Felder', () => {
    expect(slotToInputs(undefined)).toEqual({ day: '', time: '' })
    expect(slotToInputs('kaputt')).toEqual({ day: '', time: '' })
  })
})
