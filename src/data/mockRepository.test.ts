import { describe, it, expect } from 'vitest'
import { mockRepository } from './mockRepository'

describe('mockRepository', () => {
  it('returns seeded contacts', async () => {
    const contacts = await mockRepository.listContacts()
    expect(contacts.length).toBeGreaterThan(0)
  })

  it('adds an activity attributed to its author with an auto AI summary', async () => {
    const before = await mockRepository.listActivities('c-anke')
    const created = await mockRepository.addActivity({
      contactId: 'c-anke',
      type: 'call',
      occurredAt: new Date().toISOString(),
      authorId: 'u-alex',
      authorName: 'Alexandra v. Königsmarck',
      body: 'Kurzes Update. Weitere Details folgen.',
    })
    expect(created.authorName).toBe('Alexandra v. Königsmarck')
    expect(created.aiSummary).toBe('Kurzes Update.')
    const after = await mockRepository.listActivities('c-anke')
    expect(after.length).toBe(before.length + 1)
  })

  it('lists activities newest first', async () => {
    const items = await mockRepository.listActivities('c-anke')
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].occurredAt >= items[i].occurredAt).toBe(true)
    }
  })

  it('patches a contact and bumps updatedAt', async () => {
    const updated = await mockRepository.updateContact('c-thomas', { sentiment: 'green' })
    expect(updated.sentiment).toBe('green')
    expect(typeof updated.updatedAt).toBe('string')
  })

  it('creates a contact with sensible defaults', async () => {
    const before = (await mockRepository.listContacts()).length
    const created = await mockRepository.createContact({
      fullName: 'Neue Person',
      position: 'Einkauf',
      regionId: 'r-nord',
      relationshipManagerId: 'u-alex',
    })
    expect(created.id).toMatch(/^c-local-/)
    expect(created.sentiment).toBe('neutral')
    expect(created.linkedin.status).toBe('unknown')
    expect(created.wonCustomersCount).toBe(0)
    const after = (await mockRepository.listContacts()).length
    expect(after).toBe(before + 1)
  })
})
