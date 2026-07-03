import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { BarChart3, CalendarDays, FileText, LayoutGrid, Search, Users } from 'lucide-react'
import { useSession } from '@/app/SessionContext'
import { useCommandPalette } from '@/app/CommandPaletteContext'
import { canApprove, ROLE_LABEL } from '@/domain/roles'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', label: 'Übersicht', icon: LayoutGrid },
  { to: '/contacts', label: 'Kontakte', icon: Users },
  { to: '/events', label: 'Events', icon: CalendarDays },
]

function useNavItems() {
  const { user } = useSession()
  const items = [...NAV]
  if (canApprove(user.role)) items.push({ to: '/report', label: 'Bericht', icon: FileText })
  if (user.role === 'overall_admin')
    items.push({ to: '/monitoring', label: 'Monitoring', icon: BarChart3 })
  return items
}

function Logo() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5">
      <span className="inline-flex size-8 items-center justify-center rounded-[9px] bg-primary text-sm font-bold text-primary-foreground">
        P
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">Partner CSM</span>
        <span className="block text-[11px] text-muted-foreground">Telekom Partnerschaften</span>
      </span>
    </Link>
  )
}

function RoleSwitcher({ compact }: { compact?: boolean }) {
  const { user, users, setUserId } = useSession()
  const select = (
    <select
      value={user.id}
      onChange={(e) => setUserId(e.target.value)}
      className={cn(
        'h-9 truncate rounded-[10px] border border-transparent bg-secondary px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'w-[11.5rem]' : 'w-full',
      )}
    >
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} · {ROLE_LABEL[u.role]}
        </option>
      ))}
    </select>
  )
  if (compact) return select
  return (
    <div className="space-y-1">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Ansicht als
      </span>
      {select}
    </div>
  )
}

function SearchTrigger({ className }: { className?: string }) {
  const { open } = useCommandPalette()
  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        // Spotlight-style capsule search field
        'flex items-center gap-2 rounded-full bg-secondary px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
    >
      <Search className="size-4 shrink-0" />
      <span className="flex-1 text-left">Suchen…</span>
      <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] sm:inline">⌘K</kbd>
    </button>
  )
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]',
  )
}

function Sidebar() {
  const items = useNavItems()
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-black/[0.05] bg-card/80 backdrop-blur-xl lg:flex dark:border-white/[0.08] print:hidden">
      <div className="space-y-3 px-5 py-5">
        <Logo />
        <SearchTrigger className="w-full" />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <RoleSwitcher />
      </div>
    </aside>
  )
}

function MobileHeader() {
  const { open } = useCommandPalette()
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-black/[0.05] bg-background/80 px-4 py-2.5 backdrop-blur-xl lg:hidden dark:border-white/[0.08] print:hidden">
      <Logo />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={open}
          aria-label="Suchen"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
        >
          <Search className="size-4" />
        </button>
        <RoleSwitcher compact />
      </div>
    </header>
  )
}

function BottomNav() {
  const items = useNavItems()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/[0.05] bg-card/80 backdrop-blur-xl lg:hidden dark:border-white/[0.08] print:hidden">
      <div className="flex">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
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
    <div className="min-h-svh bg-background">
      <Sidebar />
      <MobileHeader />
      <div className="lg:pl-64 print:pl-0">
        <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-5 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
