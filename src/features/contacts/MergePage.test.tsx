vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { currentLocation, renderPage } from '@/test/pageHarness'
import { MergePage } from './MergePage'

// Zwei beliebige Demo-Kontakte — die Mechanik ist dieselbe wie bei echten Dubletten.
const ROUTE = '/contacts/merge?a=c-anke&b=c-julia'

describe('Dubletten zusammenführen', () => {
  it('ist nur für die Leitung', async () => {
    renderPage(<MergePage />, { route: ROUTE, as: 'sub_admin' })
    expect(await screen.findByText(/darf nur die Leitung/)).toBeInTheDocument()
  })

  it('führt zusammen, übernimmt die gewählten Werte und landet beim Gewinner', async () => {
    const user = userEvent.setup()
    const { repo } = renderPage(<MergePage />, { route: ROUTE, as: 'overall_admin' })
    const choose = await screen.findByRole('radiogroup', { name: 'Welcher Kontakt bleibt' })
    const [anke] = within(choose).getAllByRole('radio')
    await user.click(anke)
    expect(anke).toHaveAttribute('aria-checked', 'true')

    const before = await repo.getContact('c-julia')
    // Bei einem echten Konflikt den Wert des Verlierers wählen: die Funktion.
    const position = screen.getByRole('radiogroup', { name: 'Funktion' })
    await user.click(within(position).getByRole('radio', { name: before!.position }))

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: /Zusammenführen/ }))

    await waitFor(() => expect(currentLocation()).toBe('/contacts/c-anke'))
    confirm.mockRestore()
    expect(await repo.getContact('c-julia')).toBeUndefined()
    expect((await repo.getContact('c-anke'))?.position).toBe(before!.position)
  })

  it('tut nichts, wenn die Rückfrage abgelehnt wird', async () => {
    const user = userEvent.setup()
    const { repo } = renderPage(<MergePage />, { route: ROUTE, as: 'overall_admin' })
    await screen.findByRole('radiogroup', { name: 'Welcher Kontakt bleibt' })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: /Zusammenführen/ }))
    confirm.mockRestore()
    expect(await repo.getContact('c-julia')).toBeDefined()
    expect(await repo.getContact('c-anke')).toBeDefined()
  })
})
