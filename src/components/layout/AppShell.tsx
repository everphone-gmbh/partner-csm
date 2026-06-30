import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '@/app/SessionContext'
import { ROLE_LABEL } from '@/domain/roles'

function Header() {
  const { user, users, setUserId } = useSession()
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <Link to="/contacts" className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            P
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Partner CSM</span>
            <span className="block text-xs text-muted-foreground">Telekom Partnerschaften</span>
          </span>
        </Link>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Ansicht als</span>
          <select
            value={user.id}
            onChange={(e) => setUserId(e.target.value)}
            className="h-9 max-w-[14rem] rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {ROLE_LABEL[u.role]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <Header />
      <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-4">{children}</main>
    </div>
  )
}
