import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { SessionProvider } from '@/app/SessionContext'
import { CommandPaletteProvider } from '@/app/CommandPaletteContext'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/ui/toast'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { ContactList } from '@/features/contacts/ContactList'
import { ContactProfile } from '@/features/contacts/ContactProfile'

// Rarely-visited routes load on demand; the landing paths stay eager.
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

function RoutedContent() {
  const location = useLocation()
  return (
    // Keyed by path: navigating away from a crashed screen resets the boundary.
    <ErrorBoundary key={location.pathname}>
      <Suspense
        fallback={<p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>}
      >
        <Routes>
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
          <Route path="/board" element={<BoardPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ToastProvider>
          <CommandPaletteProvider>
            <AppShell>
              <RoutedContent />
            </AppShell>
          </CommandPaletteProvider>
        </ToastProvider>
      </BrowserRouter>
    </SessionProvider>
  )
}
