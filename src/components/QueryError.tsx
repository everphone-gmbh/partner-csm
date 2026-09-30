import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadErrorMessage } from '@/lib/errorText'

/** Inline error state for failed repository reads, with a retry affordance. */
export function QueryError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <TriangleAlert className="size-6 text-destructive" />
      <div>
        <p className="text-sm font-medium">Daten konnten nicht geladen werden.</p>
        {/* Kein Originaltext: der kommt oft englisch aus der Datenbank. */}
        <p className="mt-0.5 text-xs text-muted-foreground">{loadErrorMessage(error)}</p>
      </div>
      <Button size="sm" variant="outline" onClick={retry}>
        <RefreshCw className="size-4" /> Erneut versuchen
      </Button>
    </div>
  )
}
