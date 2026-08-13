import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import type { EventAttendee } from '@/domain/types'

// Muss vor den Importen stehen (vi.mock wird hochgezogen): die Seite bekommt ein
// eigenes Repository je Testfall und eine Sitzung mit gesetzter Rolle.
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { renderPage } from '@/test/pageHarness'
import { EventDetail, SlotSummary } from './EventDetail'

// EventDetail liest die Event-ID aus der Route — deshalb echt über :id rendern,
// nicht die Komponente nackt (sonst ist useParams().id leer).
function renderEvent(eventId = 'ev-digitalx', as?: string) {
  return renderPage(
    <Routes>
      <Route path="/events/:id" element={<EventDetail />} />
    </Routes>,
    { route: `/events/${eventId}`, as },
  )
}

describe('EventDetail — Gäste', () => {
  it('fügt einen Gast hinzu und zeigt ihn in der Liste', async () => {
    renderEvent()

    await userEvent.type(await screen.findByLabelText('Name des Gastes'), 'Max Mustermann')
    await userEvent.type(screen.getByLabelText('Firma des Gastes'), 'Vodafone')
    await userEvent.click(screen.getByRole('button', { name: 'Gast hinzufügen' }))

    // Der Gast erscheint mit Namen und der Firma als Meta-Zeile.
    expect(await screen.findByText('Max Mustermann')).toBeInTheDocument()
    expect(screen.getByText(/Vodafone/)).toBeInTheDocument()
  })

  it('macht aus einem Gast einen Kontakt (Region + RM) und verlinkt ihn', async () => {
    const { repo } = renderEvent()

    await userEvent.type(await screen.findByLabelText('Name des Gastes'), 'Max Mustermann')
    await userEvent.click(screen.getByRole('button', { name: 'Gast hinzufügen' }))
    await screen.findByText('Max Mustermann')

    // Promote-Wähler öffnen.
    await userEvent.click(screen.getByRole('button', { name: 'Zu Kontakt machen' }))

    // Vorgaben prüfen: Lennart (Standard-Nutzer) hat keine eigene Region → Platzhalter,
    // RM = der angemeldete Nutzer selbst.
    expect(screen.getByLabelText('Region')).toHaveValue('r-unbekannt')
    expect(screen.getByLabelText('Relationship Manager')).toHaveValue('u-lennart')

    // Bewusst andere Werte wählen, um die Übergabe an promoteGuestToContact zu belegen.
    await userEvent.selectOptions(screen.getByLabelText('Region'), 'r-west')
    await userEvent.selectOptions(screen.getByLabelText('Relationship Manager'), 'u-olaf')
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))

    // Beleg für den Aufruf: der neue Kontakt trägt genau die gewählte Region + RM.
    // (Nur promoteGuestToContact kann diesen Kontakt erzeugt haben.)
    await waitFor(async () => {
      const created = (await repo.listContacts()).find((c) => c.fullName === 'Max Mustermann')
      expect(created).toBeTruthy()
      expect(created?.regionId).toBe('r-west')
      expect(created?.relationshipManagerId).toBe('u-olaf')
      expect(created?.position).toBe('')
    })

    // In der Oberfläche ist der Gast jetzt als Kontakt verlinkt.
    const link = await screen.findByRole('link', { name: /Max Mustermann/ })
    expect(link.getAttribute('href')).toMatch(/\/contacts\/c-local-/)
  })
})

describe('EventDetail — Teilnehmer-Bearbeitung nur RM+', () => {
  it('Account Manager sieht Status als Badge und keine Bearbeitungselemente', async () => {
    renderEvent('ev-digitalx', 'account_manager')

    // Der Name steht auch im Notiz-Dropdown — deshalb gezielt den Teilnehmer-Link suchen.
    expect(await screen.findByRole('link', { name: 'Anke Richter' })).toBeInTheDocument()

    // Status ist reiner Text (Anke ist „accepted“), kein Auswahlfeld.
    expect(screen.getByText('Zugesagt')).toBeInTheDocument()
    expect(screen.queryByLabelText('Teilnahme-Status')).not.toBeInTheDocument()

    // Kein Entfernen/Hinzufügen, kein „Wofür“-Eingabefeld, kein Termin-Editor.
    expect(screen.queryByLabelText('Teilnehmer entfernen')).not.toBeInTheDocument()
    expect(screen.queryByText('Teilnehmer hinzufügen…')).not.toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText('Wofür? (Ziel / Gesprächsaufhänger)'),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Uhrzeit des Termins')).not.toBeInTheDocument()

    // „Wofür“ bleibt als Text lesbar.
    expect(screen.getByText(/Ausweitung auf Hanse Logistik besprechen/)).toBeInTheDocument()

    // Gast-Erfassung ist ebenfalls RM+ (bestehendes Gating bleibt erhalten).
    expect(screen.queryByRole('button', { name: 'Gast hinzufügen' })).not.toBeInTheDocument()
  })

  it('Relationship Manager behält alle Bearbeitungselemente', async () => {
    renderEvent('ev-digitalx', 'sub_admin')

    expect(await screen.findByRole('link', { name: 'Anke Richter' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('Teilnahme-Status').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Teilnehmer entfernen').length).toBeGreaterThan(0)
    expect(
      screen.getAllByPlaceholderText('Wofür? (Ziel / Gesprächsaufhänger)').length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Gast hinzufügen' })).toBeInTheDocument()
  })
})

describe('SlotSummary — Nur-Lese-Termin', () => {
  const base: EventAttendee = { contactId: 'c1', status: 'accepted' }

  it('zeigt Termin, Dauer und Treffpunkt als Text', () => {
    render(
      <SlotSummary
        attendee={{
          ...base,
          // Ortszeit-ISO wie aus inputsToSlot: 9. Sept., 10:30 Uhr lokal.
          slotAt: new Date(2026, 8, 9, 10, 30).toISOString(),
          slotMinutes: 45,
          meetingPoint: 'Halle 4, Stand B3',
        }}
        hasConflict={false}
      />,
    )
    expect(screen.getByText(/09\.09\.2026 10:30 · 45 Min\./)).toBeInTheDocument()
    expect(screen.getByText('Halle 4, Stand B3')).toBeInTheDocument()
    expect(screen.queryByText('Überschneidung')).not.toBeInTheDocument()
  })

  it('rendert ohne Termin nichts, markiert aber Überschneidungen', () => {
    const { container } = render(<SlotSummary attendee={base} hasConflict />)
    expect(container).toBeEmptyDOMElement()

    render(
      <SlotSummary
        attendee={{ ...base, slotAt: new Date(2026, 8, 9, 10, 30).toISOString() }}
        hasConflict
      />,
    )
    expect(screen.getByText('Überschneidung')).toBeInTheDocument()
  })
})
