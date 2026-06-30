import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Cake,
  Mail,
  MapPin,
  Heart,
  Users,
  PawPrint,
  Smartphone,
  Trophy,
  Lock,
  Sparkles,
  Building2,
  ExternalLink,
} from 'lucide-react'
import type { AppUser, Contact, Region, TrafficLight } from '@/domain/types'
import { mockRepository } from '@/data/mockRepository'
import { useSession } from '@/app/SessionContext'
import { canApprove, canViewSensitiveFields, redactContactForRole } from '@/domain/roles'
import { localSummarizer } from '@/domain/ai'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { TrafficLightBadge, TrafficLightPicker } from '@/components/TrafficLight'
import { LinkedInField } from '@/components/LinkedInField'
import { Logbook } from '@/features/activities/Logbook'
import { formatDate, daysUntilBirthday } from '@/lib/format'

export function ContactProfile() {
  const { id } = useParams()
  const { user } = useSession()
  const [raw, setRaw] = useState<Contact | undefined>(undefined)
  const [regions, setRegions] = useState<Region[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    Promise.all([
      mockRepository.getContact(id),
      mockRepository.listRegions(),
      mockRepository.listUsers(),
    ]).then(([c, r, u]) => {
      if (!active) return
      setRaw(c)
      setRegions(r)
      setUsers(u)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  const canSensitive = canViewSensitiveFields(user.role)
  const view = useMemo(
    () => (raw ? redactContactForRole(raw, user.role) : undefined),
    [raw, user.role],
  )

  const regionName = view ? regions.find((r) => r.id === view.regionId)?.name : undefined
  const managerName = view ? users.find((u) => u.id === view.relationshipManagerId)?.name : undefined

  const aiIntro = useMemo(
    () => (view ? localSummarizer.contactIntro(view, { regionName, managerName }) : ''),
    [view, regionName, managerName],
  )

  const updateSentiment = (sentiment: TrafficLight) => {
    if (!raw) return
    setRaw({ ...raw, sentiment })
    void mockRepository.updateContact(raw.id, { sentiment })
  }

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
  if (!view) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-sm text-muted-foreground">Kontakt nicht gefunden.</p>
      </div>
    )
  }

  const bdayDays = canSensitive ? daysUntilBirthday(view.birthday) : null
  const withUs = view.customers.filter((c) => c.withUs)
  const withoutUs = view.customers.filter((c) => !c.withUs)

  return (
    <div className="space-y-4">
      <BackLink />

      {/* Identity */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-start">
          <Avatar src={view.photoUrl} name={view.fullName} className="size-16 text-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h1 className="text-xl font-semibold leading-tight">{view.fullName}</h1>
              <p className="text-sm text-muted-foreground">{view.position}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{regionName ?? '—'}</Badge>
              <span>RM: {managerName ?? '—'}</span>
            </div>
            <LinkedInField info={view.linkedin} />
          </div>
          <div className="shrink-0">
            {canApprove(user.role) ? (
              <div className="space-y-1">
                <Label>Beziehung</Label>
                <TrafficLightPicker value={view.sentiment} onChange={updateSentiment} />
              </div>
            ) : (
              <TrafficLightBadge value={view.sentiment} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI summary — pinned prominently at the top */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex gap-3 pt-5">
          <Sparkles className="size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-primary">
              KI-Zusammenfassung
            </div>
            <p className="text-sm text-foreground">{aiIntro}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_minmax(320px,380px)]">
        {/* Left: profile details */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stammdaten</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              <FieldRow icon={Cake} label="Geburtstag" locked={!canSensitive}>
                {formatDate(view.birthday)}
                {bdayDays !== null && bdayDays <= 30 && (
                  <Badge variant="warning" className="ml-2">
                    {bdayDays === 0 ? 'heute' : `in ${bdayDays} Tg.`}
                  </Badge>
                )}
              </FieldRow>
              <FieldRow icon={Mail} label="E-Mail">
                {view.email ? (
                  <a href={`mailto:${view.email}`} className="text-primary hover:underline">
                    {view.email}
                  </a>
                ) : (
                  '—'
                )}
              </FieldRow>
              <FieldRow icon={MapPin} label="Wohnort" locked={!canSensitive}>
                {view.location || '—'}
              </FieldRow>
              <FieldRow icon={Heart} label="Familienstand" locked={!canSensitive}>
                {view.familyStatus || '—'}
              </FieldRow>
              <FieldRow icon={Users} label="Kinder" locked={!canSensitive}>
                {view.children || '—'}
              </FieldRow>
              <FieldRow icon={PawPrint} label="Haustiere" locked={!canSensitive}>
                {view.pets || '—'}
              </FieldRow>
              <FieldRow icon={Smartphone} label="Active Devices" locked={!canSensitive}>
                {view.activeDevices || '—'}
              </FieldRow>
              <FieldRow icon={Trophy} label="Gewonnene Kunden">
                {view.wonCustomersCount}
              </FieldRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Anknüpfungspunkte</CardTitle>
            </CardHeader>
            <CardContent>
              {!canSensitive ? (
                <LockedNote />
              ) : view.sideFacts.length ? (
                <div className="flex flex-wrap gap-2">
                  {view.sideFacts.map((f) => (
                    <Badge key={f.id} variant="accent">
                      {f.label}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Keine hinterlegt.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kunden</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CustomerGroup title="Mit uns" customers={withUs} />
              <CustomerGroup title="Ohne uns (Potenzial)" customers={withoutUs} />
              {view.customers.length === 0 && (
                <p className="text-sm text-muted-foreground">Keine Kunden zugeordnet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notiz</CardTitle>
            </CardHeader>
            <CardContent>
              {!canSensitive ? (
                <LockedNote />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {view.freeText || <span className="text-muted-foreground">—</span>}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: logbook (stacks below on mobile) */}
        <Logbook contactId={view.id} />
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/contacts"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Alle Kontakte
    </Link>
  )
}

function LockedNote() {
  return (
    <p className="inline-flex items-center gap-1.5 text-sm italic text-muted-foreground">
      <Lock className="size-3.5" /> Für Ihre Rolle ausgeblendet
    </p>
  )
}

function FieldRow({
  icon: Icon,
  label,
  locked,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  locked?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {locked ? (
          <div className="inline-flex items-center gap-1.5 text-sm italic text-muted-foreground">
            <Lock className="size-3.5" /> Für Ihre Rolle ausgeblendet
          </div>
        ) : (
          <div className="break-words text-sm text-foreground">{children}</div>
        )}
      </div>
    </div>
  )
}

function CustomerGroup({
  title,
  customers,
}: {
  title: string
  customers: Contact['customers']
}) {
  if (customers.length === 0) return null
  return (
    <div className="space-y-1.5">
      <Label>{title}</Label>
      <div className="space-y-1.5">
        {customers.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-sm">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.name}</span>
            </span>
            {c.salesforceUrl && (
              <a
                href={c.salesforceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
              >
                Salesforce <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
