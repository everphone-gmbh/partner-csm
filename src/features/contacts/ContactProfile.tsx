import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Pencil, Sparkles } from 'lucide-react'
import type { AppUser, Contact, Region } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { canApprove, canViewSensitiveFields, redactContactForRole } from '@/domain/roles'
import { localSummarizer } from '@/domain/ai'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Timeline } from '@/features/activities/Timeline'
import { BackLink } from './profile/shared'
import { IdentityCard } from './profile/IdentityCard'
import { StammdatenCard } from './profile/StammdatenCard'
import { FactsCard } from './profile/FactsCard'
import { KundenCard } from './profile/KundenCard'
import { FotogalerieCard } from './profile/FotogalerieCard'
import { NotizCard } from './profile/NotizCard'

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
      repository.getContact(id),
      repository.listRegions(),
      repository.listUsers(),
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

  const canEdit = canApprove(user.role)
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

  const save = async (patch: ContactPatch) => {
    if (!raw) return
    const updated = await repository.updateContact(raw.id, patch)
    setRaw(updated)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <BackLink />
        {canEdit && (
          <Link
            to={`/contacts/${view.id}/edit`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Pencil className="size-4" /> Bearbeiten
          </Link>
        )}
      </div>

      <IdentityCard
        contact={view}
        canEdit={canEdit}
        regionName={regionName}
        managerName={managerName}
        viewerId={user.id}
        viewerName={user.name}
        onSave={save}
      />

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
        <div className="space-y-4">
          <StammdatenCard
            contact={view}
            canEdit={canEdit}
            canSensitive={canSensitive}
            regions={regions}
            users={users}
            onSave={save}
          />
          <FactsCard contact={view} canEdit={canEdit} canSensitive={canSensitive} onSave={save} />
          <KundenCard customers={view.customers} />
          <FotogalerieCard contact={view} onSave={save} />
          <NotizCard contact={view} canEdit={canEdit} canSensitive={canSensitive} onSave={save} />
        </div>

        {/* Right: unified activity timeline (stacks below on mobile) */}
        <Timeline contact={view} />
      </div>
    </div>
  )
}
