import { AlarmClock } from 'lucide-react'
import type { AttentionLevel } from '@/domain/attention'
import { ATTENTION_LABEL } from '@/domain/attention'
import { Badge } from '@/components/ui/badge'

export function AttentionBadge({ level, days }: { level: AttentionLevel; days: number }) {
  if (level === 'ok') return null
  return (
    <Badge variant={level === 'attention' ? 'destructive' : 'warning'} className="gap-1">
      <AlarmClock className="size-3" />
      {ATTENTION_LABEL[level]} · {days} T.
    </Badge>
  )
}
