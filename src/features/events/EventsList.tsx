import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, MapPin, Plus, Users } from 'lucide-react'
import type { EventItem } from '@/domain/types'
import { mockRepository } from '@/data/mockRepository'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'

export function EventsList() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [counts, setCounts] = useState<Record<string, { total: number; accepted: number }>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')

  const load = () => {
    void mockRepository.listEvents().then(async (evs) => {
      setEvents(evs)
      const entries = await Promise.all(
        evs.map(async (e) => {
          const at = await mockRepository.listEventAttendees(e.id)
          return [
            e.id,
            { total: at.length, accepted: at.filter((a) => a.status === 'accepted').length },
          ] as const
        }),
      )
      setCounts(Object.fromEntries(entries))
      setLoading(false)
    })
  }

  useEffect(load, [])

  const create = async () => {
    if (!name.trim() || !date) return
    await mockRepository.createEvent({
      name: name.trim(),
      date,
      location: location.trim() || undefined,
    })
    setName('')
    setDate('')
    setLocation('')
    setCreating(false)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">Messen & Termine — wer kommt und wofür</p>
        </div>
        <Button size="sm" onClick={() => setCreating((c) => !c)}>
          <Plus className="size-4" /> Neues Event
        </Button>
      </div>

      {creating && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Datum</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Ort</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={create} disabled={!name.trim() || !date}>
                Event anlegen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Lädt…</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {events.map((e) => (
            <Link key={e.id} to={`/events/${e.id}`} className="group">
              <Card className="p-4 transition-colors group-hover:border-primary/40 group-hover:bg-secondary/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{e.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {formatDate(e.date)}
                      </span>
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {e.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="secondary">
                    <Users className="size-3" />
                    {counts[e.id]?.accepted ?? 0}/{counts[e.id]?.total ?? 0}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Events.</p>
          )}
        </div>
      )}
    </div>
  )
}
