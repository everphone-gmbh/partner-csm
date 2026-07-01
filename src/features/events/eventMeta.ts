import type { AttendanceStatus } from '@/domain/types'
import type { BadgeProps } from '@/components/ui/badge'

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  invited: 'Eingeladen',
  accepted: 'Zugesagt',
  declined: 'Abgesagt',
  attended: 'Teilgenommen',
  no_show: 'No-Show',
}

export const ATTENDANCE_VARIANT: Record<AttendanceStatus, NonNullable<BadgeProps['variant']>> = {
  invited: 'secondary',
  accepted: 'success',
  declined: 'destructive',
  attended: 'accent',
  no_show: 'warning',
}

/** Display / sort order for statuses. */
export const ATTENDANCE_ORDER: AttendanceStatus[] = [
  'accepted',
  'invited',
  'attended',
  'declined',
  'no_show',
]
