import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

// Muss vor den Importen stehen (vi.mock wird hochgezogen): der Rahmen bekommt
// ein eigenes Repository je Testfall und eine Sitzung mit gesetzter Rolle.
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { renderPage } from '@/test/pageHarness'
import { CommandPaletteProvider } from '@/app/CommandPaletteContext'
import { AppShell } from './AppShell'

/** Der Rahmen braucht die Befehlspalette — sonst wirft useCommandPalette. */
function shell() {
  return (
    <CommandPaletteProvider>
      <AppShell>
        <p>Inhalt</p>
      </AppShell>
    </CommandPaletteProvider>
  )
}

/** Navigationseinträge sind in Seitenleiste UND unterer Leiste doppelt. */
function navLabels(): string[] {
  return screen.getAllByRole('link').map((el) => el.textContent ?? '')
}

describe('AppShell — Navigation nach Rolle', () => {
  it('zeigt dem Overall Admin den Eintrag „Team"', async () => {
    renderPage(shell(), { route: '/dashboard', as: 'overall_admin' })

    expect(await screen.findAllByRole('link', { name: 'Team' })).not.toHaveLength(0)
    // Die Auswertungen bleiben daneben stehen — das neue Prädikat ersetzt
    // canViewAnalytics nicht, es tritt daneben.
    expect(navLabels()).toEqual(expect.arrayContaining([expect.stringContaining('Monitoring')]))
  })

  it('verbirgt „Team" vor dem Relationship Manager', async () => {
    renderPage(shell(), { route: '/dashboard', as: 'sub_admin' })

    await screen.findByText('Inhalt')
    expect(screen.queryByRole('link', { name: 'Team' })).toBeNull()
    // Gegenprobe: die allgemeinen Einträge sind da, es fehlt nicht die ganze
    // Navigation.
    expect(screen.getAllByRole('link', { name: 'Kontakte' }).length).toBeGreaterThan(0)
  })

  it('verbirgt „Team" vor dem Account Manager', async () => {
    renderPage(shell(), { route: '/dashboard', as: 'account_manager' })

    await screen.findByText('Inhalt')
    expect(screen.queryByRole('link', { name: 'Team' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Kontakte' }).length).toBeGreaterThan(0)
  })
})
