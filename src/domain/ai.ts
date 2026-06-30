import type { Activity, Contact, TrafficLight } from './types'

const SENTIMENT_PHRASE: Record<TrafficLight, string> = {
  green: 'Beziehung ist gefestigt und positiv',
  amber: 'Beziehung im Aufbau',
  red: 'Beziehung noch kritisch',
  neutral: 'Beziehungsstatus noch nicht bewertet',
}

export interface SummaryContext {
  regionName?: string
  managerName?: string
}

export interface AiSummarizer {
  /** Short intro shown at the top of a profile (also the Account-Manager tier's "60%" view). */
  contactIntro(contact: Contact, ctx?: SummaryContext): string
  /** One-line digest of a logbook entry; the raw text stays behind "More details". */
  activitySummary(input: Pick<Activity, 'type' | 'body'>): string
}

/**
 * Local, deterministic stand-in for the production summariser.
 * ⚠ Production must call a GDPR-compliant, EU-resident model endpoint from a
 *   Supabase edge function — personal data must not leave the Sovereign-Cloud
 *   boundary. Swap this object behind the AiSummarizer interface; callers don't change.
 */
export const localSummarizer: AiSummarizer = {
  contactIntro(contact, ctx) {
    const parts: string[] = []
    const role = contact.position || 'Kontakt'
    parts.push(`${contact.fullName} — ${role}${ctx?.regionName ? `, Region ${ctx.regionName}` : ''}.`)
    if (ctx?.managerName) parts.push(`Betreut von ${ctx.managerName}.`)

    const withUs = contact.customers.filter((c) => c.withUs).length
    const withoutUs = contact.customers.length - withUs
    if (contact.customers.length) {
      parts.push(
        `${withUs} Kunde(n) mit uns${withoutUs ? `, ${withoutUs} ohne uns (Potenzial)` : ''}.`,
      )
    }

    parts.push(`${SENTIMENT_PHRASE[contact.sentiment]}.`)

    if (contact.sideFacts.length) {
      parts.push(`Anknüpfungspunkte: ${contact.sideFacts.map((f) => f.label).join(', ')}.`)
    }
    return parts.join(' ')
  },

  activitySummary(input) {
    const text = input.body.trim().replace(/\s+/g, ' ')
    if (!text) return ''
    const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text
    return firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}…` : firstSentence
  },
}
