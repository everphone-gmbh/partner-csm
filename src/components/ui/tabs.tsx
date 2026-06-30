import * as React from 'react'
import { cn } from '@/lib/utils'

type TabsContextValue = { value: string; setValue: (v: string) => void }
const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabs() {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>')
  return ctx
}

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  className?: string
  children: React.ReactNode
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? '')
  const current = value ?? internal
  const setValue = (v: string) => {
    onValueChange?.(v)
    if (value === undefined) setInternal(v)
  }
  return (
    <TabsContext.Provider value={{ value: current, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-secondary p-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const ctx = useTabs()
  const active = ctx.value === value
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => ctx.setValue(value)}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const ctx = useTabs()
  if (ctx.value !== value) return null
  return (
    <div role="tabpanel" className={cn('mt-4 focus-visible:outline-none', className)}>
      {children}
    </div>
  )
}
