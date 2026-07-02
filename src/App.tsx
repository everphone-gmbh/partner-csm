import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { SessionProvider } from '@/app/SessionContext'
import { CommandPaletteProvider } from '@/app/CommandPaletteContext'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/ui/toast'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { ContactList } from '@/features/contacts/ContactList'
import { ContactProfile } from '@/features/contacts/ContactProfile'
import { ContactFormPage } from '@/features/contacts/ContactFormPage'
import { ContactImportPage } from '@/features/contacts/ContactImportPage'
import { EventsList } from '@/features/events/EventsList'
import { EventDetail } from '@/features/events/EventDetail'
import { MonitoringPage } from '@/features/monitoring/MonitoringPage'

function RoutedContent() {
  const location = useLocation()
  return (
    // Keyed by path: navigating away from a crashed screen resets the boundary.
    <ErrorBoundary key={location.pathname}>
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
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
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
