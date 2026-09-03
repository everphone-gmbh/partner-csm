import { describe, it, expect } from 'vitest'
import { daysUntil, daysUntilBirthday, formatDate, formatRelative } from './format'

// Fixed "today" values constructed in LOCAL time so the tests are
// timezone-independent (date-only strings must not be parsed as UTC).
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0)

// Full timestamp at local noon: round-trips through UTC without shifting the
// calendar day for any real timezone, so the relative-day maths is stable.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).toISOString()

describe('formatRelative', () => {
  const now = local(2026, 8, 26)

  it('says "heute" for the same calendar day', () => {
    expect(formatRelative(at(2026, 8, 26), now)).toBe('heute')
  })

  it('says "gestern" for the previous day', () => {
    expect(formatRelative(at(2026, 8, 25), now)).toBe('gestern')
  })

  it('counts days within the week', () => {
    expect(formatRelative(at(2026, 8, 23), now)).toBe('vor 3 Tagen')
    expect(formatRelative(at(2026, 8, 20), now)).toBe('vor 6 Tagen')
  })

  it('falls back to the absolute date from a week out', () => {
    expect(formatRelative(at(2026, 8, 19), now)).toBe(formatDate(at(2026, 8, 19)))
    expect(formatRelative(at(2026, 8, 1), now)).toBe(formatDate(at(2026, 8, 1)))
  })

  it('is tolerant of empty and bad input', () => {
    expect(formatRelative(undefined, now)).toBe('—')
    expect(formatRelative('nonsense', now)).toBe('nonsense')
  })
})

describe('daysUntilBirthday', () => {
  it('counts days to a birthday later this year', () => {
    expect(daysUntilBirthday('1979-07-10', local(2026, 7, 2))).toBe(8)
  })

  it('wraps around the year end', () => {
    expect(daysUntilBirthday('1980-01-05', local(2026, 12, 30))).toBe(6)
  })

  it('returns 0 on the birthday itself', () => {
    expect(daysUntilBirthday('1979-07-02', local(2026, 7, 2))).toBe(0)
  })

  it('lands Feb-29 birthdays on Feb 29 in leap years (not Mar 1)', () => {
    // Next occurrence after 2027-12-01 is 2028-02-29 (2028 is a leap year) = 90 days.
    expect(daysUntilBirthday('1992-02-29', local(2027, 12, 1))).toBe(90)
  })

  it('celebrates Feb-29 birthdays on Feb 28 in non-leap years', () => {
    // 2026 is not a leap year: 2026-02-28 is 27 days after 2026-02-01.
    expect(daysUntilBirthday('1992-02-29', local(2026, 2, 1))).toBe(27)
  })

  it('is not off by one for date-only strings regardless of timezone', () => {
    // A YYYY-MM-DD parsed as UTC but read in local time shifts a day west of
    // UTC — the calculation must treat it as a plain calendar date.
    expect(daysUntilBirthday('1979-07-03', local(2026, 7, 2))).toBe(1)
  })
})

describe('daysUntil', () => {
  it('handles date-only strings as local calendar dates', () => {
    expect(daysUntil('2026-07-04', local(2026, 7, 2))).toBe(2)
    expect(daysUntil('2026-06-30', local(2026, 7, 2))).toBe(-2)
  })
})
