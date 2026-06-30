import { useEffect, useState } from 'react'
import { ChevronDown, Paperclip } from 'lucide-react'
import type { Activity } from '@/domain/types'
import { mockRepository } from '@/data/mockRepository'
import { useSession } from '@/app/SessionContext'
import { canViewActivityBody } from '@/domain/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ACTIVITY_META } from './activityMeta'
import { AddActivity } from './AddActivity'

function ActivityItem({ activity, canBody }: { activity: Activity; canBody: boolean }) {
  const [open, setOpen] = useState(false)
  const { label, icon: Icon } = ACTIVITY_META[activity.type]
  const summary = activity.aiSummary || activity.body
  const hasMore = activity.body && activity.aiSummary && activity.body !== activity.aiSummary

  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-1 text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span>·</span>
        <span>{formatDateTime(activity.occurredAt)}</span>
        <span>·</span>
        <span>von {activity.authorName}</span>
      </div>
      <p className="mt-0.5 text-sm text-foreground">{summary}</p>

      {canBody
        ? hasMore && (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
                {open ? 'Weniger' : 'Mehr Details'}
              </button>
              {open && (
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-secondary/50 p-2 text-sm text-foreground">
                  {activity.body}
                </p>
              )}
            </>
          )
        : hasMore && (
            <p className="mt-1 text-xs italic text-muted-foreground">
              Volltext für Ihre Rolle nicht sichtbar
            </p>
          )}

      {activity.attachments.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {activity.attachments.map((a) => (
            <Badge key={a.id} variant="secondary">
              <Paperclip className="size-3" /> {a.name}
            </Badge>
          ))}
        </div>
      )}
    </li>
  )
}

export function Logbook({ contactId }: { contactId: string }) {
  const { user } = useSession()
  const [items, setItems] = useState<Activity[]>([])
  const canBody = canViewActivityBody(user.role)

  const refresh = () => {
    void mockRepository.listActivities(contactId).then(setItems)
  }

  useEffect(refresh, [contactId])

  return (
    <Card className="lg:sticky lg:top-[4.5rem]">
      <CardHeader>
        <CardTitle className="text-base">Logbuch</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AddActivity contactId={contactId} onAdded={refresh} />
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Einträge.</p>
        ) : (
          <ul className="space-y-4">
            {items.map((a) => (
              <ActivityItem key={a.id} activity={a} canBody={canBody} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
