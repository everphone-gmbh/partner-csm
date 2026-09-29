import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const signInWithOAuth = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithOAuth, signInWithPassword: vi.fn() } },
}))

// Die Seite liest einen Rücksprung-Fehler beim Laden des Moduls — deshalb je
// Test die Adresse setzen und das Modul frisch laden.
async function loadAt(url: string) {
  window.history.replaceState(null, '', url)
  vi.resetModules()
  const [page, google] = await Promise.all([import('./LoginPage'), import('./googleLogin')])
  return { ...page, ...google }
}

describe('LoginPage — Google-Anmeldung (0040)', () => {
  beforeEach(() => {
    signInWithOAuth.mockClear()
  })

  it('zeigt den Google-Knopf, sobald er freigeschaltet ist — sonst nur mit ?google=1', async () => {
    const { LoginPage, GOOGLE_LOGIN_LIVE } = await loadAt('/')
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
    const google = screen.queryByRole('button', { name: 'Mit Google anmelden' })
    if (GOOGLE_LOGIN_LIVE) expect(google).toBeInTheDocument()
    else expect(google).toBeNull()
  })

  it('schickt mit ?google=1 zu Google und zurück in die App', async () => {
    const { LoginPage } = await loadAt('/?google=1')
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Mit Google anmelden' }))
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
  })

  it('erklärt eine abgewiesene fremde Adresse verständlich und räumt die Adresse auf', async () => {
    const { LoginPage } = await loadAt(
      '/?google=1#error=server_error&error_description=Database+error+saving+new+user',
    )
    render(<LoginPage />)
    expect(screen.getByText('Die Anmeldung geht nur mit einem everphone.de-Konto.')).toBeInTheDocument()
    expect(window.location.hash).toBe('')
  })

  it('übersetzt einen Abbruch bei Google', async () => {
    const { friendlyReturnError } = await loadAt('/')
    expect(friendlyReturnError('access_denied')).toBe('Die Google-Anmeldung wurde abgebrochen.')
  })
})
