import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Reminder } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatDate, daysUntil } from '@/lib/format'
import { cn } from '@/lib/utils'

export function RemindersCard({ contactId }: { contactId: string }) {
  const { user } = useSession()
  const [items, setItems] = useState<Reminder[]>([])
  const [text, setText] = useState('')
  const [due, setDue] = useState('')

  const refresh = () => {
    void repository.listReminders(contactId).then(setItems)
  }
  useEffect(refresh, [contactId])

  const add = async () => {
    if (!text.trim() || !due) return
    await repository.addReminder({
      contactId,
      dueDate: due,
      text: text.trim(),
      createdByName: user.name,
    })
    setText('')
    setDue('')
    refresh()
  }
  const toggle = async (r: Reminder) => {
    await repository.toggleReminder(r.id, !r.done)
    refresh()
  }
  const remove = async (id: string) => {
    await repository.deleteReminder(id)
    refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reminder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Reminder.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((r) => {
              const d = daysUntil(r.dueDate)
              const overdue = !r.done && d !== null && d < 0
              return (
                <li key={r.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={r.done}
                    onChange={() => toggle(r)}
                    className="mt-1 size-4 accent-primary"
                    aria-label="Erledigt"
                  />
                  <div className="min-w-0 flex-1">
                    <div className={cn('text-sm', r.done && 'text-muted-foreground line-through')}>
                      {r.text}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{formatDate(r.dueDate)}</span>
                      {!r.done && d !== null && (
                        <Badge variant={overdue ? 'destructive' : d <= 3 ? 'warning' : 'secondary'}>
                          {overdue ? 'überfällig' : d === 0 ? 'heute' : `in ${d} T.`}
                        </Badge>
                      )}
                      <span>· {r.createdByName}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    aria-label="Reminder löschen"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Woran erinnern?"
            className="flex-1"
          />
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="sm:w-40"
          />
          <Button type="button" variant="outline" onClick={add} disabled={!text.trim() || !due}>
            <Plus className="size-4" /> Reminder
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
