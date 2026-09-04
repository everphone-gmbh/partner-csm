/**
 * Testgerüst für ganze Seiten.
 *
 * Bis hierher gab es nur Tests für Fachlogik und einzelne Felder. Eine Seite wie
 * die Kontaktliste braucht drei Dinge, die im Test nicht von selbst da sind:
 * einen Router, eine Sitzung mit definierter Rolle und ein Repository mit
 * eigenen Daten je Testfall.
 *
 * Die ersten beiden löst dieses Modul, indem Testdateien die entsprechenden
 * Module dadurch ersetzen:
 *
 * ```ts
 * vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
 * vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))
 * ```
 *
 * Warum nicht der echte `SessionProvider`? Der spricht im Supabase-Modus mit der
 * echten Auth und leitet die Rolle aus dem angemeldeten Profil ab. Im Test wollen
 * wir die Rolle setzen, nicht einen Login nachbauen. Und warum nicht das echte
 * `repositoryProvider`? Es liefert im Mock-Modus einen SINGLETON — Testfälle
 * würden sich sonst gegenseitig die Daten verändern.
 *
 * Was dieses Gerüst deshalb NICHT prüft: Anmeldung, Rollenherleitung und alles
 * Serverseitige (RLS, die redigierenden Views, Storage-Regeln). Dafür bleibt es
 * bei der Prüfung von Hand mit echtem Token — siehe CLAUDE.md.
 */
import { type ReactNode } from 'react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { render } from '@testing-library/react'
import type { AppUser } from '@/domain/types'
import type { Repository } from '@/data/repository'
import { createMockRepository } from '@/data/mockRepository'
import { seedUsers } from '@/data/seed'
import { ToastProvider } from '@/components/ui/toast'

// ---------------------------------------------------------------------------
// Ersatz für @/data/repositoryProvider
// ---------------------------------------------------------------------------

let current: Repository = createMockRepository()
let currentUser: AppUser = seedUsers[0]

/** Frisches Repository für den nächsten Testfall. */
export function resetHarness(): Repository {
  current = createMockRepository()
  currentUser = seedUsers[0]
  return current
}

/** Das Repository, mit dem der laufende Testfall arbeitet. */
export function testRepository(): Repository {
  return current
}

/**
 * Steht für `repository` aus dem echten Provider. Ein Proxy, weil `resetHarness`
 * die Instanz zwischen den Testfällen austauscht — ein direkter Export zeigte
 * sonst auf die alte. Methoden werden an die aktuelle Instanz gebunden, damit
 * `this` im MockRepository stimmt.
 */
export const repository: Repository = new Proxy({} as Repository, {
  get(_target, prop) {
    const value = (current as unknown as Record<string, unknown>)[prop as string]
    return typeof value === 'function' ? value.bind(current) : value
  },
})

export const activeBackend: 'supabase' | 'mock' = 'mock'

// ---------------------------------------------------------------------------
// Ersatz für @/app/SessionContext
// ---------------------------------------------------------------------------

export function useSession() {
  return {
    user: currentUser,
    users: seedUsers,
    email: undefined as string | undefined,
    setUserId: (id: string) => {
      const found = seedUsers.find((u) => u.id === id)
      if (found) currentUser = found
    },
    canSwitchUser: true,
    signOut: async () => {},
  }
}

/** Nur damit der Ersatz dieselbe Oberfläche hat wie das echte Modul. */
export function SessionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

// ---------------------------------------------------------------------------
// Rendern
// ---------------------------------------------------------------------------

export interface RenderPageOptions {
  /** Startadresse, z. B. '/contacts?filter=stale'. */
  route?: string
  /**
   * Wer schaut zu — entweder eine Rolle (nimmt den ersten passenden Seed-Nutzer)
   * oder eine konkrete Nutzer-ID. Vorgabe ist der Overall-Admin, weil die
   * meisten Bearbeitungsfunktionen privilegiert sind.
   */
  as?: AppUser['role'] | string
}

/**
 * Rendert eine Seite mit Router, Sitzung und frischem Repository.
 *
 * Gibt zusätzlich `repo` zurück, damit ein Test den Zustand nach einer Aktion
 * direkt prüfen kann, statt sich allein auf die Oberfläche zu verlassen.
 */
export function renderPage(ui: ReactNode, options: RenderPageOptions = {}) {
  const repo = resetHarness()

  if (options.as) {
    const picked =
      seedUsers.find((u) => u.role === options.as) ?? seedUsers.find((u) => u.id === options.as)
    if (!picked) throw new Error(`Kein Seed-Nutzer für "${options.as}"`)
    currentUser = picked
  }

  // Daten-Router wie in App.tsx (dort createBrowserRouter): nur er kennt
  // useBlocker, auf dem die Rückfrage „Ungespeicherte Änderungen" aufbaut — ein
  // <MemoryRouter> ließe den Wächter im Test abstürzen. Eine einzelne
  // Splat-Route trägt die Seite; eigene <Routes> im übergebenen `ui` (etwa für
  // :id-Parameter) funktionieren darunter wie zuvor.
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <ToastProvider>
            {ui}
            <LocationProbe />
          </ToastProvider>
        ),
      },
    ],
    { initialEntries: [options.route ?? '/'] },
  )
  const result = render(<RouterProvider router={router} />)

  return { ...result, repo, user: currentUser }
}

/**
 * Macht die aktuelle Adresse prüfbar. Ohne das lässt sich nicht zeigen, dass ein
 * Klick NICHT navigiert hat — und genau das war der Fehler beim Auswahlkästchen
 * in der Kontaktliste.
 */
function LocationProbe() {
  const location = useLocation()
  return (
    <span data-testid="aktuelle-adresse" hidden>
      {location.pathname}
      {location.search}
    </span>
  )
}

/** Was der Router gerade anzeigt — für Navigations-Zusicherungen. */
export function currentLocation(): string {
  return document.querySelector('[data-testid="aktuelle-adresse"]')?.textContent ?? ''
}
