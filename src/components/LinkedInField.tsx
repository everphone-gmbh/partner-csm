import { Check, X, HelpCircle, ExternalLink } from 'lucide-react'
import type { LinkedInInfo, LinkedInStatus } from '@/domain/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'

export const LINKEDIN_LABEL: Record<LinkedInStatus, string> = {
  has_account: 'LinkedIn vorhanden',
  no_account: 'Kein LinkedIn-Account',
  unknown: 'Nicht geprüft',
}

/**
 * Tri-state LinkedIn display. The point (per the briefing): distinguish
 * "has an account" ✓ from "verified to have none" ✗ from "not yet checked".
 */
export function LinkedInField({ info }: { info: LinkedInInfo }) {
  if (info.status === 'has_account') {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant="success">
          <Check className="size-3" /> {LINKEDIN_LABEL.has_account}
        </Badge>
        {info.url && (
          <a
            href={info.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Profil öffnen <ExternalLink className="size-3" />
          </a>
        )}
        {info.verifiedByName && (
          <span className="text-xs text-muted-foreground">
            geprüft von {info.verifiedByName}
            {info.verifiedAt ? `, ${formatDate(info.verifiedAt)}` : ''}
          </span>
        )}
      </div>
    )
  }

  if (info.status === 'no_account') {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant="destructive">
          <X className="size-3" /> {LINKEDIN_LABEL.no_account}
        </Badge>
        {info.verifiedByName && (
          <span className="text-xs text-muted-foreground">
            bestätigt von {info.verifiedByName}
            {info.verifiedAt ? `, ${formatDate(info.verifiedAt)}` : ''}
          </span>
        )}
      </div>
    )
  }

  return (
    <Badge variant="outline" className="text-muted-foreground">
      <HelpCircle className="size-3" /> {LINKEDIN_LABEL.unknown}
    </Badge>
  )
}

/** Compact tri-state selector for the edit form. */
export function LinkedInPicker({
  status,
  onChange,
}: {
  status: LinkedInStatus
  onChange: (s: LinkedInStatus) => void
}) {
  const options: { value: LinkedInStatus; label: string; icon: typeof Check }[] = [
    { value: 'has_account', label: 'Ja', icon: Check },
    { value: 'no_account', label: 'Nein', icon: X },
    { value: 'unknown', label: '?', icon: HelpCircle },
  ]
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border p-1">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={status === value}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors',
            status === value
              ? 'bg-secondary font-medium text-foreground'
              : 'text-muted-foreground hover:bg-secondary/60',
          )}
        >
          <Icon className="size-3" /> {label}
        </button>
      ))}
    </div>
  )
}
