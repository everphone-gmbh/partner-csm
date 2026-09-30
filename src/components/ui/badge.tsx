import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        accent: 'border-transparent bg-accent text-accent-foreground',
        // Helle Fläche, dunkle Schrift: die Ampelfarbe als Schrift auf ihrer
        // eigenen Tönung war kaum lesbar (Amber 2:1).
        success: 'border-transparent bg-success-soft text-success-ink',
        warning: 'border-transparent bg-warning-soft text-warning-ink',
        destructive: 'border-transparent bg-danger-soft text-danger-ink',
        info: 'border-transparent bg-info-soft text-info-ink',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { badgeVariants }
