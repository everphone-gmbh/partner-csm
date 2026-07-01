import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CommandPaletteDialog } from '@/components/CommandPaletteDialog'

interface CommandPaletteValue {
  open: () => void
}

const CommandPaletteContext = createContext<CommandPaletteValue | null>(null)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen((o) => !o)
      }
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo<CommandPaletteValue>(() => ({ open: () => setIsOpen(true) }), [])

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog open={isOpen} onClose={() => setIsOpen(false)} />
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette(): CommandPaletteValue {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider')
  return ctx
}
