vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderPage } from '@/test/pageHarness'
import { CoveragePage } from './CoveragePage'

/**
 * Die Soll-Struktur ließ sich bisher nur per SQL ändern, obwohl die Seite selbst
 * dazu schrieb, sie „muss nachgezogen werden".
 */
describe('Telekom-Struktur pflegen (Abdeckung, nur Leitung)', () => {
  it('legt eine Einheit an und übernimmt die Firmen-Schreibweise der Struktur', async () => {
    const user = userEvent.setup()
    const { repo } = renderPage(<CoveragePage />, { route: '/coverage', as: 'overall_admin' })
    await user.click(await screen.findByRole('button', { name: /Telekom-Struktur pflegen/ }))
    await user.click(screen.getByRole('button', { name: /Einheit hinzufügen/ }))

    const existing = (await repo.listOrgUnits())[0].company
    expect(screen.getByLabelText('Firma')).toHaveValue(existing)
    await user.type(screen.getByLabelText('Abteilung'), 'Neue Abteilung')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(async () =>
      expect((await repo.listOrgUnits()).some((u) => u.department === 'Neue Abteilung')).toBe(true),
    )
  })

  it('löscht eine Einheit nach Rückfrage', async () => {
    const user = userEvent.setup()
    const { repo } = renderPage(<CoveragePage />, { route: '/coverage', as: 'overall_admin' })
    await user.click(await screen.findByRole('button', { name: /Telekom-Struktur pflegen/ }))
    const before = await repo.listOrgUnits()
    const first = [...before].sort(
      (a, b) =>
        a.company.localeCompare(b.company, 'de') ||
        a.department.localeCompare(b.department, 'de') ||
        (a.team ?? '').localeCompare(b.team ?? '', 'de'),
    )[0]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getAllByRole('button', { name: `${first.department} löschen` })[0])
    await waitFor(async () => expect((await repo.listOrgUnits()).length).toBe(before.length - 1))
    confirm.mockRestore()
  })
})
