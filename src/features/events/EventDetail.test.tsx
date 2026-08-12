import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'

// Muss vor den Importen stehen (vi.mock wird hochgezogen): die Seite bekommt ein
// eigenes Repository je Testfall und eine Sitzung mit gesetzter Rolle.
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { renderPage } from '@/test/pageHarness'
import { EventDetail } from './EventDetail'

// EventDetail liest die Event-ID aus der Route — deshalb echt über :id rendern,
// nicht die Komponente nackt (sonst ist useParams().id leer).
function renderEvent(eventId = 'ev-digitalx') {
  return renderPage(
    <Routes>
      <Route path="/events/:id" element={<EventDetail />} />
    </Routes>,
    { route: `/events/${eventId}` },
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
