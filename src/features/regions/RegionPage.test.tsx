vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderPage } from '@/test/pageHarness'
import { RegionPage } from './RegionPage'

function openRegion(regionId: string, as: 'sub_admin' | 'account_manager' | 'overall_admin' = 'sub_admin') {
  return renderPage(
    <Routes>
      <Route path="/regions/:id" element={<RegionPage />} />
    </Routes>,
    { route: `/regions/${regionId}`, as },
  )
}

describe('Organigramm je Region', () => {
  it('ordnet die Kontakte der Region in Ebenen von oben nach unten', async () => {
    openRegion('r-sued')
    expect(await screen.findByRole('heading', { name: 'Süd' })).toBeInTheDocument()
    const bands = screen.getAllByRole('region').map((b) => b.getAttribute('aria-label'))
    expect(bands).toEqual(['Executive', 'Fachebene'])
    expect(within(screen.getByRole('region', { name: 'Executive' })).getByText('Thomas Berger')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Fachebene' })).getByText('Nicole Wagner')).toBeInTheDocument()
  })

  it('kennzeichnet eine weitere Firma gestrichelt an der Karte', async () => {
    openRegion('r-sued')
    expect(await screen.findByText('auch bei T-Systems')).toBeInTheDocument()
  })

  it('nennt eine Führungskraft aus einer anderen Region, statt eine Linie ins Leere zu ziehen', async () => {
    // Demo: Sandra Vogel (West) berichtet an Julia Hoffmann (Mitte).
    openRegion('r-west')
    expect(await screen.findByText('↑ berichtet an Julia Hoffmann (andere Region)')).toBeInTheDocument()
  })

  it('ordnet einen Kontakt aus einer anderen Region ein: Ebene, Region und „berichtet an"', async () => {
    const user = userEvent.setup()
    const { repo } = openRegion('r-sued')
    await screen.findByRole('heading', { name: 'Süd' })

    await user.type(screen.getByLabelText('Kontakt zum Einordnen'), 'Peter')
    await user.click(await screen.findByRole('button', { name: /Peter Schulz/ }))
    expect(screen.getByText('kommt in diese Region')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Ebene'), 'management')
    await user.selectOptions(screen.getByLabelText('berichtet an'), 'c-thomas')
    await user.click(screen.getByRole('button', { name: 'Einordnen' }))

    await waitFor(async () => {
      const peter = await repo.getContact('c-peter')
      expect(peter?.hierarchyLevel).toBe('management')
      expect(peter?.regionIds).toEqual(expect.arrayContaining(['r-west', 'r-sued']))
      const links = await repo.listContactLinks('c-peter')
      expect(links.some((l) => l.kind === 'reports_to' && l.toContactId === 'c-thomas')).toBe(true)
    })
    // Und er steht jetzt im Band „Management" dieser Region.
    await waitFor(() =>
      expect(within(screen.getByRole('region', { name: 'Management' })).getByText('Peter Schulz')).toBeInTheDocument(),
    )
  })

  it('zeigt Account Managern das Organigramm, aber nicht den Schnell-Eintrag', async () => {
    openRegion('r-west', 'account_manager')
    await screen.findByRole('heading', { name: 'West' })
    expect(screen.queryByRole('button', { name: 'Einordnen' })).toBeNull()
  })
})
