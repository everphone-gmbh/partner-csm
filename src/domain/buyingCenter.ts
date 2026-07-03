import type { BuyingRole } from './types'

export const BUYING_ROLE_LABEL: Record<BuyingRole, string> = {
  champion: 'Champion',
  supporter: 'Unterstützer:in',
  neutral: 'Neutral',
  blocker: 'Blocker',
  gatekeeper: 'Gatekeeper',
}

/** Badge variants aligned with the traffic-light tokens. */
export const BUYING_ROLE_VARIANT: Record<BuyingRole, 'success' | 'accent' | 'secondary' | 'destructive' | 'warning'> = {
  champion: 'success',
  supporter: 'accent',
  neutral: 'secondary',
  blocker: 'destructive',
  gatekeeper: 'warning',
}

export const BUYING_ROLE_OPTIONS: { value: '' | BuyingRole; label: string }[] = [
  { value: '', label: 'Nicht eingeschätzt' },
  { value: 'champion', label: BUYING_ROLE_LABEL.champion },
  { value: 'supporter', label: BUYING_ROLE_LABEL.supporter },
  { value: 'neutral', label: BUYING_ROLE_LABEL.neutral },
  { value: 'gatekeeper', label: BUYING_ROLE_LABEL.gatekeeper },
  { value: 'blocker', label: BUYING_ROLE_LABEL.blocker },
]
