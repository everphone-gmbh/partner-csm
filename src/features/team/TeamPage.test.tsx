import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Muss vor den Importen stehen (vi.mock wird hochgezogen): die Seite bekommt ein
// eigenes Repository je Testfall und eine Sitzung mit gesetzter Rolle.
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { renderPage } from '@/test/pageHarness'
import { TeamPage } from './TeamPage'

describe('TeamPage — Team & Rechte', () => {
  it('listet die Konten und speichert einen Rollenwechsel', async () => {
    const { repo } = renderPage(<TeamPage />, { route: '/team', as: 'overall_admin' })

    // Nach Name sortiert: „Alexandra v. Königsmarck" steht vor „Lennart Bernhard".
    const roleSelect = await screen.findByLabelText('Rolle von Alexandra v. Königsmarck')
    expect(roleSelect).toHaveValue('sub_admin')
    expect(screen.getByLabelText('Rolle von Mehmet Yıldız')).toHaveValue('account_manager')

    await userEvent.selectOptions(roleSelect, 'account_manager')

    // Nicht nur die Oberfläche: der Stand im Repository muss stimmen.
    await waitFor(async () => {
      const saved = (await repo.listUsers()).find((u) => u.name === 'Alexandra v. Königsmarck')
      expect(saved?.role).toBe('account_manager')
    })
  })

  it('sperrt die eigene Rolle, lässt die eigene Region aber zu', async () => {
    // Vorgabe des Gerüsts ist seedUsers[0] — Lennart, der Overall Admin.
    renderPage(<TeamPage />, { route: '/team', as: 'overall_admin' })

    const own = await screen.findByLabelText('Rolle von Lennart Bernhard')
    expect(own).toBeDisabled()
    expect(own).toHaveAttribute('title', expect.stringContaining('eigene Rolle'))
    // Die Region ist von den Trigger-Sperren nicht betroffen.
    expect(screen.getByLabelText('Region von Lennart Bernhard')).toBeEnabled()
  })

  it('sperrt den letzten Overall Admin und gibt ihn frei, sobald es einen zweiten gibt', async () => {
    renderPage(<TeamPage />, { route: '/team', as: 'overall_admin' })

    // Im Seed ist Lennart der EINZIGE Administrator — beide Sperren fallen auf
    // dieselbe Zeile, und sein Feld ist zu. Dass dabei wirklich der Zähler
    // greift und nicht nur „das bin ich", zeigt das Gegenteil: ein zweiter
    // Administrator ist sofort wieder änderbar.
    expect(await screen.findByLabelText('Rolle von Lennart Bernhard')).toBeDisabled()

    const alex = screen.getByLabelText('Rolle von Alexandra v. Königsmarck')
    await userEvent.selectOptions(alex, 'overall_admin')
    await waitFor(() => expect(alex).toHaveValue('overall_admin'))

    expect(alex).toBeEnabled()
    // Lennart bleibt zu — jetzt nur noch wegen der eigenen Rolle.
    expect(screen.getByLabelText('Rolle von Lennart Bernhard')).toBeDisabled()
  })

  it('speichert einen Regionswechsel', async () => {
    const { repo } = renderPage(<TeamPage />, { route: '/team', as: 'overall_admin' })

    const regionSelect = await screen.findByLabelText('Region von Alexandra v. Königsmarck')
    expect(regionSelect).toHaveValue('r-nord')

    await userEvent.selectOptions(regionSelect, 'r-sued')

    await waitFor(async () => {
      const saved = (await repo.listUsers()).find((u) => u.name === 'Alexandra v. Königsmarck')
      expect(saved?.regionId).toBe('r-sued')
    })
  })

  it('nimmt die Auswahl zurück und meldet den Fehler, wenn das Speichern scheitert', async () => {
    const { repo } = renderPage(<TeamPage />, { route: '/team', as: 'overall_admin' })
    vi.spyOn(repo, 'updateUser').mockRejectedValue(new Error('Kein Zugriff'))

    const roleSelect = await screen.findByLabelText('Rolle von Alexandra v. Königsmarck')
    await userEvent.selectOptions(roleSelect, 'account_manager')

    expect(await screen.findByText(/Speichern fehlgeschlagen: Kein Zugriff/)).toBeInTheDocument()
    // Rücknahme: das Feld steht wieder auf dem alten Wert.
    await waitFor(() => expect(roleSelect).toHaveValue('sub_admin'))
  })

  it('zeigt dem Relationship Manager eine Absage statt der Tabelle', async () => {
    renderPage(<TeamPage />, { route: '/team', as: 'sub_admin' })

    expect(
      await screen.findByText('Rollen und Regionen darf nur der Overall Admin vergeben.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Rolle von/)).toBeNull()
  })

  it('zeigt dem Account Manager eine Absage statt der Tabelle', async () => {
    renderPage(<TeamPage />, { route: '/team', as: 'account_manager' })

    expect(
      await screen.findByText('Rollen und Regionen darf nur der Overall Admin vergeben.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Rolle von/)).toBeNull()
  })
})
