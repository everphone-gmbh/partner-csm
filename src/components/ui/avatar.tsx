import * as React from 'react'
import { cn } from '@/lib/utils'

/** Simple avatar: shows the photo when present, otherwise initials on a tinted disc. */
export function Avatar({
  src,
  name,
  className,
}: {
  src?: string | null
  name: string
  className?: string
}) {
  const [failed, setFailed] = React.useState(false)
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const showImage = src && !failed

  return (
    <span
      className={cn(
        'relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-sm font-semibold text-accent-foreground select-none',
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  )
}
