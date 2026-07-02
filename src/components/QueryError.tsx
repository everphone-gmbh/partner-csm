import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Inline error state for failed repository reads, with a retry affordance. */
export function QueryError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <TriangleAlert className="size-6 text-destructive" />
      <div>
        <p className="text-sm font-medium">Daten konnten nicht geladen werden.</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{error.message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={retry}>
        <RefreshCw className="size-4" /> Erneut versuchen
      </Button>
    </div>
  )
}
