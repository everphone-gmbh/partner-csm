import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Search, User } from 'lucide-react'
import type { Contact, EventItem } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useScopedContacts } from '@/app/useScopedContacts'
import { buildPaletteItems, filterPaletteItems, type PaletteItem } from './commandPaletteItems'
import { cn } from '@/lib/utils'

export function CommandPaletteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const { scoped } = useScopedContacts(contacts)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    Promise.all([repository.listContacts(), repository.listEvents()]).then(([c, e]) => {
      setContacts(c)
      setEvents(e)
    })
    // Focus after the dialog has mounted/rendered.
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  const items = useMemo(() => buildPaletteItems(scoped, events), [scoped, events])
  const results = useMemo(() => filterPaletteItems(items, query), [items, query])

  useEffect(() => setActiveIndex(0), [query])

  const select = (item: PaletteItem) => {
    navigate(item.to)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[activeIndex]
      if (item) select(item)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Schnellsuche"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Kontakt oder Event suchen…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Keine Treffer.</li>
          ) : (
            results.map((item, i) => (
              <li key={`${item.type}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => select(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    i === activeIndex ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary',
                  )}
                >
                  {item.type === 'contact' ? (
                    <User className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{item.title}</span>
                    {item.subtitle && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{item.subtitle}</span>
                    )}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
