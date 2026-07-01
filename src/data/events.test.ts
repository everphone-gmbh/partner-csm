import { describe, it, expect } from 'vitest'
import { mockRepository } from './mockRepository'

describe('events', () => {
  it('lists seeded events and their attendees', async () => {
    const events = await mockRepository.listEvents()
    expect(events.length).toBeGreaterThan(0)
    const attendees = await mockRepository.listEventAttendees('ev-digitalx')
    expect(attendees.length).toBeGreaterThan(0)
  })

  it('sets attendee status and purpose', async () => {
    const updated = await mockRepository.setAttendee('ev-digitalx', 'c-anke', {
      status: 'attended',
      purpose: 'Follow-up',
    })
    expect(updated.status).toBe('attended')
    expect(updated.purpose).toBe('Follow-up')
  })

  it('adds and removes an attendee', async () => {
    await mockRepository.setAttendee('ev-ciomove', 'c-peter', { status: 'invited' })
    let attendees = await mockRepository.listEventAttendees('ev-ciomove')
    expect(attendees.some((a) => a.contactId === 'c-peter')).toBe(true)

    await mockRepository.removeAttendee('ev-ciomove', 'c-peter')
    attendees = await mockRepository.listEventAttendees('ev-ciomove')
    expect(attendees.some((a) => a.contactId === 'c-peter')).toBe(false)
  })

  it('creates an event', async () => {
    const ev = await mockRepository.createEvent({ name: 'Test Event', date: '2026-11-01' })
    expect(ev.id).toMatch(/^ev-local-/)
  })

  it('adds an event note and lists notes newest first', async () => {
    const created = await mockRepository.addEventNote({
      eventId: 'ev-digitalx',
      text: 'Aktuelle Notiz',
      authorName: 'Tester',
      attachments: [],
    })
    expect(created.id).toMatch(/^en-local-/)
    const notes = await mockRepository.listEventNotes('ev-digitalx')
    expect(notes[0].text).toBe('Aktuelle Notiz')
  })
})
