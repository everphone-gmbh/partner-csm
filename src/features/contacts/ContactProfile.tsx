import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Pencil, Sparkles, Trash2 } from 'lucide-react'
import type { AppUser, Contact, Region } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { canApprove, canViewSensitiveFields, redactContactForRole } from '@/domain/roles'
import { localSummarizer } from '@/domain/ai'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Timeline } from '@/features/activities/Timeline'
import { BackLink } from './profile/shared'
import { IdentityCard } from './profile/IdentityCard'
import { StammdatenCard } from './profile/StammdatenCard'
import { FactsCard } from './profile/FactsCard'
import { NetworkCard } from './profile/NetworkCard'
import { KundenCard } from './profile/KundenCard'
import { FotogalerieCard } from './profile/FotogalerieCard'
import { NotizCard } from './profile/NotizCard'

export function ContactProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const { toast } = useToast()
  const [raw, setRaw] = useState<Contact | undefined>(undefined)

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      Promise.all([
        repository.getContact(id ?? ''),
        repository.listRegions(),
        repository.listUsers(),
      ]),
    [id],
  )
  const regions: Region[] = data?.[1] ?? []
  const users: AppUser[] = data?.[2] ?? []
  useEffect(() => {
    setRaw(data?.[0])
  }, [data])

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
    try {
      const updated = await repository.updateContact(raw.id, patch)
      setRaw(updated)
    } catch (err) {
      toast(saveErrorMessage(err))
      throw err // keep the card in edit mode so nothing typed is lost
    }
  }

  // GDPR erasure — deliberately Overall-Admin only (mirrors RLS in 0008).
  const erase = async () => {
    if (!raw) return
    const sure = window.confirm(
      `„${raw.fullName}“ und ALLE zugehörigen Daten (Aktivitäten, Fotos, Reminder) unwiderruflich löschen?`,
    )
    if (!sure) return
    try {
      await repository.deleteContact(raw.id)
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    toast('Kontakt gelöscht.', 'success')
    navigate('/contacts')
  }

  if (error) return <QueryError error={error} retry={retry} />
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
        <div className="flex items-center gap-2">
          {user.role === 'overall_admin' && (
            <button
              type="button"
              onClick={erase}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              title="Kontakt und alle zugehörigen Daten löschen (DSGVO)"
            >
              <Trash2 className="size-4 text-destructive" />
              <span className="text-destructive">Löschen</span>
            </button>
          )}
          {canEdit && (
            <Link
              to={`/contacts/${view.id}/edit`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Pencil className="size-4" /> Bearbeiten
            </Link>
          )}
        </div>
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
        <CardContent className="flex gap-3 pt-5 sm:pt-5">
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
          <NetworkCard contact={view} canEdit={canEdit} />
          <KundenCard contact={view} canEdit={canEdit} onSave={save} />
          {/* Private photos are sensitive-tier data — hidden from Account Managers. */}
          {canSensitive && <FotogalerieCard contact={view} canEdit={canEdit} onSave={save} />}
          <NotizCard contact={view} canEdit={canEdit} canSensitive={canSensitive} onSave={save} />
        </div>

        {/* Right: unified activity timeline (stacks below on mobile) */}
        <Timeline contact={view} />
      </div>
    </div>
  )
}
