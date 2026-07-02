import { Component, type ReactNode } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Route-level error boundary: a render error shows a recoverable message
 * instead of white-screening the whole app. Mounted keyed by route in App so
 * navigating away resets it automatically.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <TriangleAlert className="size-6 text-destructive" />
          <div>
            <p className="text-sm font-medium">Hier ist etwas schiefgelaufen.</p>
            <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
              {this.state.error.message}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="size-4" /> Neu laden
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
