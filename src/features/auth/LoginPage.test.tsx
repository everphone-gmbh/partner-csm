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
    const google = screen.queryByRole('button', { name: 'Mit Google anmelden' })
    if (GOOGLE_LOGIN_LIVE) {
      expect(google).toBeInTheDocument()
      // Die Passwort-Anmeldung liegt eingeklappt darunter.
      expect(screen.queryByRole('button', { name: 'Anmelden' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Mit Passwort anmelden' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    } else {
      expect(google).toBeNull()
      expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
    }
  })

  it('klappt die Passwort-Anmeldung auf und sagt, was fehlt, statt den Knopf zu sperren', async () => {
    const { LoginPage } = await loadAt('/?google=1')
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Mit Passwort anmelden' }))
    const submit = screen.getByRole('button', { name: 'Anmelden' })
    expect(submit).toBeEnabled()

    await userEvent.click(submit)
    expect(screen.getByText('Gib deine E-Mail-Adresse ein.')).toBeInTheDocument()
    expect(screen.getByLabelText('E-Mail')).toHaveFocus()

    await userEvent.type(screen.getByLabelText('E-Mail'), 'lena.kramer@everphone.de')
    expect(screen.queryByText('Gib deine E-Mail-Adresse ein.')).toBeNull()
    await userEvent.click(submit)
    expect(screen.getByText('Gib dein Passwort ein.')).toBeInTheDocument()
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
    expect(
      screen.getByText(
        'Dieses Google-Konto gehört nicht zu everphone.de. Melde dich mit deinem Everphone-Konto an.',
      ),
    ).toBeInTheDocument()
    expect(window.location.hash).toBe('')
  })

  it('übersetzt einen Abbruch bei Google', async () => {
    const { friendlyReturnError } = await loadAt('/')
    expect(friendlyReturnError('access_denied')).toBe('Die Google-Anmeldung wurde abgebrochen.')
  })

  it('zeigt statt englischer Technik einen nächsten Schritt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { friendlyReturnError } = await loadAt('/')
    expect(friendlyReturnError('Unable to exchange external code')).toBe(
      'Die Google-Anmeldung hat nicht geklappt. Versuch es noch einmal. Klappt es wieder nicht, melde dich bei Jannik Heeland.',
    )
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
