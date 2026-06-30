import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider } from '@/app/SessionContext'
import { AppShell } from '@/components/layout/AppShell'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { ContactList } from '@/features/contacts/ContactList'
import { ContactProfile } from '@/features/contacts/ContactProfile'

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/contacts" element={<ContactList />} />
            <Route path="/contacts/:id" element={<ContactProfile />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </SessionProvider>
  )
}
