import { describe, it, expect } from 'vitest'
import { mockRepository } from './mockRepository'

describe('reminders', () => {
  it('lists seeded reminders sorted by due date', async () => {
    const all = await mockRepository.listReminders()
    expect(all.length).toBeGreaterThan(0)
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].dueDate <= all[i].dueDate).toBe(true)
    }
  })

  it('adds, toggles and deletes a reminder', async () => {
    const created = await mockRepository.addReminder({
      contactId: 'c-anke',
      dueDate: '2026-08-01',
      text: 'Testreminder',
      createdByName: 'Tester',
    })
    expect(created.done).toBe(false)

    const toggled = await mockRepository.toggleReminder(created.id, true)
    expect(toggled.done).toBe(true)

    await mockRepository.deleteReminder(created.id)
    const forAnke = await mockRepository.listReminders('c-anke')
    expect(forAnke.some((r) => r.id === created.id)).toBe(false)
  })
})
