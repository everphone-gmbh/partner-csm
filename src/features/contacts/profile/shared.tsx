import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Lock, Pencil } from 'lucide-react'
import { Label } from '@/components/ui/label'

export const selectCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function BackLink() {
  return (
    <Link
      to="/contacts"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Alle Kontakte
    </Link>
  )
}

export function LockedNote() {
  return (
    <p className="inline-flex items-center gap-1.5 text-sm italic text-muted-foreground">
      <Lock className="size-3.5" /> Für Ihre Rolle ausgeblendet
    </p>
  )
}

export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <Pencil className="size-3.5" /> Bearbeiten
    </button>
  )
}

export function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function FieldRow({
  icon: Icon,
  label,
  locked,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  locked?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {locked ? (
          <div className="inline-flex items-center gap-1.5 text-sm italic text-muted-foreground">
            <Lock className="size-3.5" /> Für Ihre Rolle ausgeblendet
          </div>
        ) : (
          <div className="break-words text-sm text-foreground">{children}</div>
        )}
      </div>
    </div>
  )
}
