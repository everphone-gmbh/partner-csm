import * as React from 'react'
import { cn } from '@/lib/utils'

// ComponentProps<'input'> statt InputHTMLAttributes: schließt `ref` ein (React 19
// reicht es als normale Prop durch), damit ein Formular ein Feld fokussieren kann.
export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        // iOS-style filled field: quiet gray fill, no hard border, ring on focus.
        'flex h-10 w-full rounded-[10px] border border-transparent bg-secondary px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:bg-card disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
