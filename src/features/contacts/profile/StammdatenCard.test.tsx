import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link } from 'react-router-dom'
import type { ComponentProps } from 'react'
import { StammdatenCard } from './StammdatenCard'
import type { AppUser, Contact, Region } from '@/domain/types'
// Die Karte importiert weder Repository noch Sitzung — das Gerüst wird nur wegen
// des Daten-Routers gebraucht: der Wächter gegen Datenverlust (useBlocker) läuft
// nicht in einem nackten render().
import { currentLocation, renderPage } from '@/test/pageHarness'

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

function renderCard(props: Partial<ComponentProps<typeof StammdatenCard>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const utils = renderPage(
    <>
      <StammdatenCard
        contact={contact}
        canEdit
        canSensitive
        regions={regions}
        users={users}
        onSave={onSave}
        {...props}
      />
      {/* Ein Ziel zum Weg-Navigieren, wie Menü oder Suche es täten. */}
      <Link to="/dashboard">Übersicht</Link>
    </>,
    { route: '/contacts/c1' },
  )
  return { ...utils, onSave }
}

describe('StammdatenCard — neue Felder & Social-Links-Editor', () => {
  it('zeigt die neuen Felder an', () => {
    renderCard()
    for (const label of ['Durchwahl / 2. Nummer', 'E-Mail (privat)', 'Dienstanschrift', 'Assistenz', 'Social Media']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('bearbeitet, fügt einen Social-Link hinzu und speichert den vollständigen Patch', async () => {
    const { onSave } = renderCard()
    const user = userEvent.setup()

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
    const { onSave } = renderCard()
    const user = userEvent.setup()
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

describe('StammdatenCard — Vorschläge für Firma und Team', () => {
  it('hängt die Vorschläge als Datalist an beide Felder, Freitext bleibt möglich', async () => {
    renderCard({
      suggestions: {
        teams: ['Einkauf Konzern', 'Einkauf Konzern / Mobilfunk'],
        companies: ['Deutsche Telekom'],
      },
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))

    const team = screen.getByLabelText('Team')
    const teamList = document.getElementById(team.getAttribute('list') ?? '')
    expect(teamList?.tagName).toBe('DATALIST')
    expect([...(teamList?.querySelectorAll('option') ?? [])].map((o) => o.value)).toEqual([
      'Einkauf Konzern',
      'Einkauf Konzern / Mobilfunk',
    ])

    const company = screen.getByLabelText('Firma')
    const companyList = document.getElementById(company.getAttribute('list') ?? '')
    expect([...(companyList?.querySelectorAll('option') ?? [])].map((o) => o.value)).toEqual([
      'Deutsche Telekom',
    ])

    // Kein Zwang zur Auswahl: ein neuer Wert bleibt stehen.
    await user.type(team, 'Etwas ganz Neues')
    expect(team).toHaveValue('Etwas ganz Neues')
  })
})

describe('StammdatenCard — ungespeicherte Änderungen', () => {
  it('fragt beim Verlassen nach; „Zurück“ bleibt mit Entwurf, „Verwerfen“ geht', async () => {
    renderCard()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    await user.type(screen.getByLabelText('Firma'), 'Neue Firma AG')

    await user.click(screen.getByRole('link', { name: 'Übersicht' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' })
    expect(currentLocation()).toBe('/contacts/c1')

    await user.click(within(dialog).getByRole('button', { name: 'Zurück' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(currentLocation()).toBe('/contacts/c1')
    expect(screen.getByLabelText('Firma')).toHaveValue('Neue Firma AG')

    await user.click(screen.getByRole('link', { name: 'Übersicht' }))
    const again = await screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' })
    await user.click(within(again).getByRole('button', { name: 'Verwerfen' }))
    await waitFor(() => expect(currentLocation()).toBe('/dashboard'))
  })

  it('speichert aus der Rückfrage heraus und navigiert dann weiter', async () => {
    const { onSave } = renderCard()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    await user.type(screen.getByLabelText('Firma'), 'Neue Firma AG')

    await user.click(screen.getByRole('link', { name: 'Übersicht' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' })
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(currentLocation()).toBe('/dashboard'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].company).toBe('Neue Firma AG')
  })

  it('fragt nicht nach, wenn im Bearbeiten nichts geändert wurde', async () => {
    renderCard()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))

    await user.click(screen.getByRole('link', { name: 'Übersicht' }))
    await waitFor(() => expect(currentLocation()).toBe('/dashboard'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// --- Mehrere Regionen je Kontakt (Migration 0035) --------------------------
//
// Gemeldet 2026-09-24: eine Teamassistenz betreut zwei Gebiete, konnte das aber
// nicht eintragen. Ihr Versuch über „+ Neue Region" legte ein Gebiet an, statt
// eines zuzuordnen — und lief in eine Datenbankmeldung.

const zweiRegionen: Region[] = [
  { id: 'r1', name: 'Public Süd/Südwest', isPlaceholder: false },
  { id: 'r2', name: 'Public Mitte/West', isPlaceholder: false },
  { id: 'r3', name: 'Unbekannt', isPlaceholder: true },
]

describe('StammdatenCard — mehrere Regionen', () => {
  it('nimmt eine zweite Region auf und speichert beide', async () => {
    const user = userEvent.setup()
    const { onSave } = renderCard({ regions: zweiRegionen })
    await user.click(screen.getByRole('button', { name: /bearbeiten/i }))

    await user.selectOptions(screen.getByLabelText('Region hinzufügen'), 'r2')
    await user.click(screen.getByRole('button', { name: /^speichern$/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].regionIds).toEqual(['r1', 'r2'])
  })

  it('entfernt eine Region wieder', async () => {
    const user = userEvent.setup()
    const { onSave } = renderCard({
      regions: zweiRegionen,
      contact: { ...contact, regionIds: ['r1', 'r2'] },
    })
    await user.click(screen.getByRole('button', { name: /bearbeiten/i }))

    await user.click(screen.getByRole('button', { name: /Region Public Süd\/Südwest entfernen/ }))
    await user.click(screen.getByRole('button', { name: /^speichern$/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].regionIds).toEqual(['r2'])
  })

  it('lässt die letzte Region nicht entfernen', async () => {
    const user = userEvent.setup()
    renderCard({ regions: zweiRegionen })
    await user.click(screen.getByRole('button', { name: /bearbeiten/i }))

    // Ein Kontakt ohne Gebiet wäre für jeden Account Manager unsichtbar, und die
    // Datenbank lehnt es ohnehin ab — die Oberfläche bietet es gar nicht erst an.
    expect(screen.getByRole('button', { name: /Region Public Süd\/Südwest entfernen/ })).toBeDisabled()
  })

  it('bietet eine bereits zugeordnete Region nicht noch einmal an', async () => {
    const user = userEvent.setup()
    renderCard({ regions: zweiRegionen, contact: { ...contact, regionIds: ['r1', 'r2'] } })
    await user.click(screen.getByRole('button', { name: /bearbeiten/i }))

    const add = screen.getByLabelText('Region hinzufügen')
    const offered = within(add)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean)
    expect(offered).toEqual(['r3'])
  })
})
