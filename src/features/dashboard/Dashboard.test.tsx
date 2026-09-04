import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

// Muss vor den Importen stehen (vi.mock wird hochgezogen): die Seite bekommt ein
// eigenes Repository je Testfall und eine Sitzung mit gesetzter Rolle.
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { renderPage } from '@/test/pageHarness'
import { Dashboard } from './Dashboard'

describe('Dashboard — Regionen-Abdeckung', () => {
  it('führt jede Region in die nach ihr gefilterte Kontaktliste', async () => {
    renderPage(<Dashboard />, { route: '/dashboard' })

    const nord = await screen.findByRole('link', { name: /^Nord/ })
    expect(nord).toHaveAttribute('href', '/contacts?region=r-nord')
    expect(nord).toHaveTextContent(/betreut/)

    expect(screen.getByRole('link', { name: /^Süd/ })).toHaveAttribute(
      'href',
      '/contacts?region=r-sued',
    )
  })
})
