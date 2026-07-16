import type { Contact, EventItem } from '@/domain/types'

export interface PaletteItem {
  id: string
  type: 'contact' | 'event'
  title: string
  subtitle?: string
  to: string
}

export function buildPaletteItems(contacts: Contact[], events: EventItem[]): PaletteItem[] {
  return [
    ...contacts.map((c): PaletteItem => ({
      id: c.id,
      type: 'contact',
      title: c.fullName,
      // Firma im Untertitel macht die Palette auch nach Company durchsuchbar.
      subtitle: [c.position, c.company].filter(Boolean).join(' · '),
      to: `/contacts/${c.id}`,
    })),
    ...events.map((e): PaletteItem => ({
      id: e.id,
      type: 'event',
      title: e.name,
      subtitle: e.location,
      to: `/events/${e.id}`,
    })),
  ]
}

/** Case-insensitive substring match on title + subtitle, capped to `limit`. */
export function filterPaletteItems(items: PaletteItem[], query: string, limit = 8): PaletteItem[] {
  const term = query.trim().toLowerCase()
  if (!term) return items.slice(0, limit)
  return items
    .filter(
      (item) =>
        item.title.toLowerCase().includes(term) || item.subtitle?.toLowerCase().includes(term),
    )
    .slice(0, limit)
}
