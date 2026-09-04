import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

// Muss vor den Importen stehen (vi.mock wird hochgezogen): die Seite bekommt ein
// eigenes Repository je Testfall und eine Sitzung mit gesetzter Rolle.
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { renderPage } from '@/test/pageHarness'
import { ContactProfile } from './ContactProfile'

// Die Karte liest :id aus der Route — deshalb echt über die Route rendern.
function renderProfile(id: string, as?: string) {
  return renderPage(
    <Routes>
      <Route path="/contacts/:id" element={<ContactProfile />} />
    </Routes>,
    { route: `/contacts/${id}`, as },
  )
}

describe('ContactProfile — Kopfzeile', () => {
  it('verlinkt zurück ins Team des Kontakts (nach Team gefilterte Liste)', async () => {
    renderProfile('c-anke')
    const team = await screen.findByRole('link', { name: 'Team Partner Management' })
    expect(team).toHaveAttribute('href', '/contacts?team=Partner%20Management')
    expect(screen.getByRole('link', { name: 'Alle Kontakte' })).toHaveAttribute('href', '/contacts')
  })

  it('zeigt den Team-Link nicht, wenn der Kontakt kein Team hat', async () => {
    renderProfile('c-thomas')
    await screen.findByRole('link', { name: 'Alle Kontakte' })
    expect(screen.queryByRole('link', { name: /^Team / })).toBeNull()
  })

  it('bietet „Neuer Kontakt“ neben „Bearbeiten“ an', async () => {
    renderProfile('c-anke')
    const neu = await screen.findByRole('link', { name: 'Neuer Kontakt' })
    expect(neu).toHaveAttribute('href', '/contacts/new')
    expect(screen.getByRole('link', { name: 'Bearbeiten' })).toBeInTheDocument()
  })

  it('zeigt Account Managern weder „Neuer Kontakt“ noch „Bearbeiten“', async () => {
    // Mehmet (Account Manager, West) schaut auf einen Kontakt seiner Region.
    renderProfile('c-sandra', 'account_manager')
    await screen.findByRole('link', { name: 'Alle Kontakte' })
    expect(screen.queryByRole('link', { name: 'Neuer Kontakt' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).toBeNull()
  })
})
