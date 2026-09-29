import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Supabase-Modus mit einer angemeldeten Sitzung; was listUsers liefert, legt
// jeder Test fest.
const listUsers = vi.fn()
vi.mock('@/data/repositoryProvider', () => ({
  activeBackend: 'supabase',
  repository: { listUsers: (...args: unknown[]) => listUsers(...args) },
}))

const signOut = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: 'u-neu', email: 'neu.kollege@everphone.de' } } },
      })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut,
    },
  },
}))

import { SessionProvider } from './SessionContext'

describe('SessionProvider — Konto ohne Profil (0040)', () => {
  beforeEach(() => {
    listUsers.mockReset()
    signOut.mockClear()
  })

  it('zeigt „wartet auf Freischaltung" statt für immer „Lädt…"', async () => {
    // Ohne Profil sieht das Konto keine Profile — die Liste ist leer.
    listUsers.mockResolvedValue([])
    render(
      <SessionProvider>
        <p>App</p>
      </SessionProvider>,
    )
    expect(await screen.findByText('Dein Zugang wartet auf Freischaltung')).toBeInTheDocument()
    expect(screen.getByText('neu.kollege@everphone.de')).toBeInTheDocument()
    expect(screen.queryByText('App')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }))
    expect(signOut).toHaveBeenCalled()
  })

  it('lässt ein freigeschaltetes Konto in die App', async () => {
    listUsers.mockResolvedValue([{ id: 'u-neu', name: 'Neu Kollege', role: 'account_manager', regionId: 'r-west' }])
    render(
      <SessionProvider>
        <p>App</p>
      </SessionProvider>,
    )
    expect(await screen.findByText('App')).toBeInTheDocument()
  })
})
