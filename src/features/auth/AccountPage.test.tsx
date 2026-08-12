import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Muss vor den Importen stehen (vi.mock wird hochgezogen): die Seite bekommt ein
// eigenes Repository je Testfall und eine Sitzung mit gesetzter Rolle.
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { renderPage } from '@/test/pageHarness'
import { AccountPage } from './AccountPage'

describe('AccountPage — Regionen verwalten', () => {
  it('legt als RM+ eine neue Region an (createRegion wird gerufen, taucht auf)', async () => {
    const { repo } = renderPage(<AccountPage />, { route: '/account', as: 'sub_admin' })
    const createSpy = vi.spyOn(repo, 'createRegion')

    const input = await screen.findByLabelText('Name der neuen Region')
    await userEvent.type(input, 'Testregion')
    await userEvent.click(screen.getByRole('button', { name: /Anlegen/ }))

    // Nach dem Anlegen wird die Liste neu geladen und zeigt die neue Region.
    expect(await screen.findByText('Testregion')).toBeInTheDocument()
    expect(createSpy).toHaveBeenCalledWith('Testregion')
  })

  it('benennt als RM+ eine bestehende Region um (renameRegion wird gerufen)', async () => {
    const { repo } = renderPage(<AccountPage />, { route: '/account', as: 'sub_admin' })
    const renameSpy = vi.spyOn(repo, 'renameRegion')

    // Nord (r-nord aus den Seed-Daten) in den Bearbeitungsmodus schalten.
    await userEvent.click(await screen.findByRole('button', { name: 'Nord umbenennen' }))
    const input = screen.getByLabelText('Neuer Name für Nord')
    await userEvent.clear(input)
    await userEvent.type(input, 'Nordwest')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText('Nordwest')).toBeInTheDocument()
    expect(renameSpy).toHaveBeenCalledWith('r-nord', 'Nordwest')
  })

  it('zeigt den Platzhalter ohne Umbenennen-Schaltfläche', async () => {
    renderPage(<AccountPage />, { route: '/account', as: 'sub_admin' })

    // Der Platzhalter „Unbekannt" ist gelistet, aber nicht umbenennbar.
    expect(await screen.findByText('Unbekannt')).toBeInTheDocument()
    expect(screen.getByText(/Platzhalter · nicht umbenennbar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unbekannt umbenennen' })).toBeNull()
  })

  it('blendet die Verwaltungskarte für Account Manager aus', async () => {
    renderPage(<AccountPage />, { route: '/account', as: 'account_manager' })

    // Die Konto-Seite lädt, aber ohne die RM+-Verwaltungskarte.
    expect(await screen.findByText('Mein Konto')).toBeInTheDocument()
    expect(screen.queryByText('Regionen verwalten')).toBeNull()
  })
})
