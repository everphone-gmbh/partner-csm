/** Date / time formatting helpers (de-DE), tolerant of bad input. */

/**
 * Parses a value that may be a date-only YYYY-MM-DD string as a LOCAL
 * calendar date. `new Date('YYYY-MM-DD')` parses as UTC midnight, which reads
 * back as the previous day in timezones west of UTC — a classic off-by-one.
 * Full timestamps fall through to normal Date parsing.
 */
function parseLocalDate(value: string): Date {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(value)
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = parseLocalDate(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time}`
}

/** Whole days until a calendar date (negative = in the past). */
export function daysUntil(dateStr: string | undefined, today: Date = new Date()): number | null {
  if (!dateStr) return null
  const d = parseLocalDate(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

/**
 * Day-of-year aware "days until next birthday" from a YYYY-MM-DD string.
 * Feb-29 birthdays fall on Feb 29 in leap years and Feb 28 otherwise
 * (naively constructing `new Date(y, 1, 29)` rolls over to Mar 1 — and did so
 * even in leap years when the rollover happened in the check year).
 */
export function daysUntilBirthday(birthday: string | undefined, today: Date = new Date()): number | null {
  if (!birthday) return null
  const b = parseLocalDate(birthday)
  if (Number.isNaN(b.getTime())) return null
  const month = b.getMonth()
  const day = b.getDate()
  const occurrenceIn = (year: number): Date => {
    const d = month === 1 && day === 29 && !isLeapYear(year) ? 28 : day
    return new Date(year, month, d)
  }
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let next = occurrenceIn(today.getFullYear())
  if (next < start) next = occurrenceIn(today.getFullYear() + 1)
  return Math.round((next.getTime() - start.getTime()) / 86_400_000)
}
