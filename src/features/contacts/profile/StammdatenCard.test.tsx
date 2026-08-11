import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StammdatenCard } from './StammdatenCard'
import type { AppUser, Contact, Region } from '@/domain/types'

const contact: Contact = {
  id: 'c1',
  fullName: 'Test Person',
  position: 'CIO',
  regionId: 'r1',
  relationshipManagerId: 'u1',
  birthday: '1980-01-01',
  linkedin: { status: 'unknown' },
  sentiment: 'neutral',
  wonCustomersCount: 0,
  sideFacts: [],
  customers: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const regions: Region[] = [{ id: 'r1', name: 'Nord', isPlaceholder: false }]
const users: AppUser[] = [{ id: 'u1', name: 'Alex', role: 'sub_admin' }]

describe('StammdatenCard — neue Felder & Social-Links-Editor', () => {
  it('zeigt die neuen Felder an', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <StammdatenCard contact={contact} canEdit canSensitive regions={regions} users={users} onSave={onSave} />,
    )
    for (const label of ['Durchwahl / 2. Nummer', 'E-Mail (privat)', 'Dienstanschrift', 'Assistenz', 'Social Media']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('bearbeitet, fügt einen Social-Link hinzu und speichert den vollständigen Patch', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <StammdatenCard contact={contact} canEdit canSensitive regions={regions} users={users} onSave={onSave} />,
    )

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))

    // Der Social-Links-Editor rendert (das war der bislang nicht visuell
    // bestätigte Teil) und startet leer.
    expect(screen.getByText('Social-Media-Links')).toBeInTheDocument()
    expect(screen.getByText('Noch keine Links.')).toBeInTheDocument()

    // Skalare über eindeutige Platzhalter füllen.
    await user.type(screen.getByPlaceholderText('+49 30 000000-123'), '+49 30 111-222')
    await user.type(screen.getByPlaceholderText('Straße, PLZ Ort'), 'Musterstr. 1, 10115 Berlin')

    // Social-Link anlegen und ausfüllen.
    await user.click(screen.getByRole('button', { name: 'Link' }))
    await user.type(screen.getByPlaceholderText('Label'), 'LinkedIn')
    await user.type(screen.getByPlaceholderText('https://…'), 'https://linkedin.com/in/x')

    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const patch = onSave.mock.calls[0][0]
    expect(patch.phoneDirect).toBe('+49 30 111-222')
    expect(patch.businessAddress).toBe('Musterstr. 1, 10115 Berlin')
    expect(patch.socialLinks).toEqual([{ label: 'LinkedIn', url: 'https://linkedin.com/in/x' }])
  })

  it('leere Social-Link-Zeilen (ohne URL) fallen beim Speichern weg', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <StammdatenCard contact={contact} canEdit canSensitive regions={regions} users={users} onSave={onSave} />,
    )
    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    // Zwei Zeilen anlegen, nur eine mit URL füllen.
    await user.click(screen.getByRole('button', { name: 'Link' }))
    await user.click(screen.getByRole('button', { name: 'Link' }))
    const urlInputs = screen.getAllByPlaceholderText('https://…')
    await user.type(urlInputs[0], 'https://example.com')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    const patch = onSave.mock.calls[0][0]
    expect(patch.socialLinks).toEqual([{ label: '', url: 'https://example.com' }])
  })
})
