import { Star } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Der Stern am Kontakt (Feedback #6) — in der Liste als kompaktes Symbol, im
 * Kopf der Karte mit Beschriftung. Immer ein eigener <button>, nie Inhalt des
 * Links: in der Kontaktliste steht er bewusst NEBEN dem verlinkten Rest der
 * Zeile (CLAUDE.md, Fallstrick 9). Sichtbar für jede Rolle, weil Favoriten
 * persönlich sind (Migration 0031).
 */
export function FavoriteToggle({
  name,
  active,
  onToggle,
  showLabel = false,
  className,
}: {
  /** Vor- und Nachname für die Beschriftung des Knopfs. */
  name: string
  active: boolean
  onToggle: () => void
  /** Mit sichtbarem „Favorit“-Text (Kartenkopf) statt nur Symbol (Liste). */
  showLabel?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? `${name} aus Favoriten entfernen` : `${name} als Favorit markieren`}
      title={active ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
      className={cn(
        showLabel
          ? buttonVariants({ variant: 'ghost', size: 'sm' })
          : 'inline-flex shrink-0 items-center justify-center rounded-full p-1.5 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !active && 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <Star className={cn('size-4', active && 'fill-current text-status-amber')} aria-hidden />
      {showLabel && <span>Favorit</span>}
    </button>
  )
}
