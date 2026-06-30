import { Phone, Mail, Users, StickyNote, AtSign } from 'lucide-react'
import type { ComponentType } from 'react'
import type { ActivityType } from '@/domain/types'

type IconType = ComponentType<{ className?: string }>

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: IconType }> = {
  call: { label: 'Telefonat', icon: Phone },
  email: { label: 'E-Mail', icon: Mail },
  meeting: { label: 'Treffen', icon: Users },
  note: { label: 'Notiz', icon: StickyNote },
  social: { label: 'Social', icon: AtSign },
}
