import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { BarChart3, CalendarDays, LayoutGrid, Users } from 'lucide-react'
import { useSession } from '@/app/SessionContext'
import { ROLE_LABEL } from '@/domain/roles'
import { cn } from '@/lib/utils'

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
            className="h-9 w-[11rem] truncate rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[15rem]"
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

const NAV = [
  { to: '/dashboard', label: 'Übersicht', icon: LayoutGrid },
  { to: '/contacts', label: 'Kontakte', icon: Users },
  { to: '/events', label: 'Events', icon: CalendarDays },
]

function BottomNav() {
  const { user } = useSession()
  const items =
    user.role === 'overall_admin'
      ? [...NAV, { to: '/monitoring', label: 'Monitoring', icon: BarChart3 }]
      : NAV
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background pb-16">
      <Header />
      <main className="mx-auto w-full max-w-5xl px-4 pb-6 pt-4">{children}</main>
      <BottomNav />
    </div>
  )
}
