import type { Activity, AppUser, Contact, TrafficLight } from '@/domain/types'

export interface ManagerStat {
  user: AppUser
  contactsManaged: number
  engaged: number
  engagedPct: number
  activities: number
  bySentiment: Record<TrafficLight, number>
}

/**
 * Performance ranking of Relationship Managers (sub_admin), for the admin view.
 * Ranked by relationship coverage, then activity volume, then book size.
 */
export function computeManagerRanking(
  users: AppUser[],
  contacts: Contact[],
  activities: Activity[],
): ManagerStat[] {
  const managers = users.filter((u) => u.role === 'sub_admin')
  const stats = managers.map((user) => {
    const managed = contacts.filter((c) => c.relationshipManagerId === user.id)
    const engaged = managed.filter((c) => c.sentiment !== 'neutral').length
    const bySentiment: Record<TrafficLight, number> = { green: 0, amber: 0, red: 0, neutral: 0 }
    managed.forEach((c) => {
      bySentiment[c.sentiment]++
    })
    return {
      user,
      contactsManaged: managed.length,
      engaged,
      engagedPct: managed.length ? Math.round((engaged / managed.length) * 100) : 0,
      activities: activities.filter((a) => a.authorId === user.id).length,
      bySentiment,
    }
  })
  return stats.sort(
    (a, b) =>
      b.engagedPct - a.engagedPct ||
      b.activities - a.activities ||
      b.contactsManaged - a.contactsManaged,
  )
}
