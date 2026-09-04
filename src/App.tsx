import { lazy, Suspense } from 'react'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useLocation,
} from 'react-router-dom'
import { SessionProvider } from '@/app/SessionContext'
import { CommandPaletteProvider } from '@/app/CommandPaletteContext'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/ui/toast'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { ContactList } from '@/features/contacts/ContactList'
import { ContactProfile } from '@/features/contacts/ContactProfile'

// Rarely-visited routes load on demand; the landing paths stay eager.
const CoveragePage = lazy(() =>
  import('@/features/coverage/CoveragePage').then((m) => ({ default: m.CoveragePage })),
)
const AccountPage = lazy(() =>
  import('@/features/auth/AccountPage').then((m) => ({ default: m.AccountPage })),
)
const ContactFormPage = lazy(() =>
  import('@/features/contacts/ContactFormPage').then((m) => ({ default: m.ContactFormPage })),
)
const ContactImportPage = lazy(() =>
  import('@/features/contacts/ContactImportPage').then((m) => ({ default: m.ContactImportPage })),
)
const EventsList = lazy(() =>
  import('@/features/events/EventsList').then((m) => ({ default: m.EventsList })),
)
const EventDetail = lazy(() =>
  import('@/features/events/EventDetail').then((m) => ({ default: m.EventDetail })),
)
const BriefingPage = lazy(() =>
  import('@/features/events/BriefingPage').then((m) => ({ default: m.BriefingPage })),
)
const MonitoringPage = lazy(() =>
  import('@/features/monitoring/MonitoringPage').then((m) => ({ default: m.MonitoringPage })),
)
const ReportPage = lazy(() =>
  import('@/features/report/ReportPage').then((m) => ({ default: m.ReportPage })),
)
const BoardPage = lazy(() =>
  import('@/features/board/BoardPage').then((m) => ({ default: m.BoardPage })),
)

/**
 * Pfadlose Layout-Route: alles, was früher innerhalb von <BrowserRouter> lag
 * (Toasts, Befehlspalette, App-Rahmen mit NavLinks, Fehlergrenze, Suspense),
 * hängt jetzt hier und umschließt die eigentlichen Seiten über <Outlet />.
 */
function RootLayout() {
  const location = useLocation()
  return (
    <ToastProvider>
      <CommandPaletteProvider>
        <AppShell>
          {/* Keyed by path: navigating away from a crashed screen resets the boundary. */}
          <ErrorBoundary key={location.pathname}>
            <Suspense
              fallback={<p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>}
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </AppShell>
      </CommandPaletteProvider>
    </ToastProvider>
  )
}

// Daten-Router (createBrowserRouter) statt <BrowserRouter>: nur er kann eine
// Navigation innerhalb der App anhalten (useBlocker) — Grundlage der Rückfrage
// „Ungespeicherte Änderungen“ (useUnsavedChangesGuard). Keine Loader/Actions;
// Routen und `basename` sind unverändert. Der basename kommt weiter aus Vites
// BASE_URL: „/partner-csm/“ auf GitHub Pages, „/“ lokal — ein falscher Wert
// ließe die Live-Seite leer.
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />}>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/contacts" element={<ContactList />} />
      <Route path="/contacts/new" element={<ContactFormPage />} />
      <Route path="/contacts/import" element={<ContactImportPage />} />
      <Route path="/contacts/:id" element={<ContactProfile />} />
      <Route path="/contacts/:id/edit" element={<ContactFormPage />} />
      <Route path="/events" element={<EventsList />} />
      <Route path="/events/:id" element={<EventDetail />} />
      <Route path="/events/:id/briefing" element={<BriefingPage />} />
      <Route path="/monitoring" element={<MonitoringPage />} />
      <Route path="/report" element={<ReportPage />} />
      <Route path="/coverage" element={<CoveragePage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/board" element={<BoardPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Route>,
  ),
  { basename: import.meta.env.BASE_URL },
)

export default function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  )
}
