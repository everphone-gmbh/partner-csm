/** Date / time formatting helpers (de-DE), tolerant of bad input. */

export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
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

/** Day-of-year aware "days until next birthday" from a YYYY-MM-DD string. */
export function daysUntilBirthday(birthday: string | undefined, today: Date = new Date()): number | null {
  if (!birthday) return null
  const b = new Date(birthday)
  if (Number.isNaN(b.getTime())) return null
  const next = new Date(today.getFullYear(), b.getMonth(), b.getDate())
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (next < start) next.setFullYear(next.getFullYear() + 1)
  return Math.round((next.getTime() - start.getTime()) / 86_400_000)
}
