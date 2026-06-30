import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider } from '@/app/SessionContext'
import { AppShell } from '@/components/layout/AppShell'
import { ContactList } from '@/features/contacts/ContactList'
import { ContactProfile } from '@/features/contacts/ContactProfile'

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/contacts" replace />} />
            <Route path="/contacts" element={<ContactList />} />
            <Route path="/contacts/:id" element={<ContactProfile />} />
            <Route path="*" element={<Navigate to="/contacts" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </SessionProvider>
  )
}
