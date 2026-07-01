import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider } from '@/app/SessionContext'
import { AppShell } from '@/components/layout/AppShell'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { ContactList } from '@/features/contacts/ContactList'
import { ContactProfile } from '@/features/contacts/ContactProfile'
import { ContactFormPage } from '@/features/contacts/ContactFormPage'
import { EventsList } from '@/features/events/EventsList'
import { EventDetail } from '@/features/events/EventDetail'
import { MonitoringPage } from '@/features/monitoring/MonitoringPage'

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/contacts" element={<ContactList />} />
            <Route path="/contacts/new" element={<ContactFormPage />} />
            <Route path="/contacts/:id" element={<ContactProfile />} />
            <Route path="/contacts/:id/edit" element={<ContactFormPage />} />
            <Route path="/events" element={<EventsList />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/monitoring" element={<MonitoringPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </SessionProvider>
  )
}
