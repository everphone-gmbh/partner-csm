import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { AppUser, Contact, Region } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { contactRegionIds } from '@/domain/contactRegions'
import {
  canApprove,
  canManageContactPhoto,
  canViewSensitiveFields,
  redactContactForRole,
} from '@/domain/roles'
import { isPlaceholderRegion } from '@/domain/placeholders'
import { localSummarizer } from '@/domain/ai'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Timeline } from '@/features/activities/Timeline'
import { RelationshipTimelineCard } from '@/features/activities/RelationshipTimelineCard'
import { buildHistory } from '@/features/activities/timelineHistory'
import { BackLink } from './profile/shared'
import { IdentityCard } from './profile/IdentityCard'
import { StammdatenCard } from './profile/StammdatenCard'
import { FactsCard } from './profile/FactsCard'
import { NetworkCard } from './profile/NetworkCard'
import { IntroPathCard } from './profile/IntroPathCard'
import { KundenCard } from './profile/KundenCard'
import { FotogalerieCard } from './profile/FotogalerieCard'
import { NotizCard } from './profile/NotizCard'
import { TranscriptImportCard } from './TranscriptImportCard'
import { useFieldSuggestions } from './useFieldSuggestions'
import { FavoriteToggle } from './FavoriteToggle'
import { useFavorites } from './useFavorites'

export function ContactProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const { toast } = useToast()
  const [raw, setRaw] = useState<Contact | undefined>(undefined)
  // Firma-/Team-Vorschläge für die Stammdaten-Bearbeitung; die Karte selbst
  // bleibt wie regions/users rein über Props versorgt.
  const suggestions = useFieldSuggestions()
  // Persönlicher Stern (Feedback #6) — jede Rolle sieht nur die eigenen.
  const favorites = useFavorites(user.id)

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
  // Das Kontaktfoto hängt NICHT an canEdit: wer den Kontakt sieht, darf sein
  // Foto pflegen (Entscheidung 2026-09-17, serverseitig Migration 0032).
  const canEditPhoto = canManageContactPhoto()
  const canSensitive = canViewSensitiveFields(user.role)
  const view = useMemo(
    () => (raw ? redactContactForRole(raw, user.role) : undefined),
    [raw, user.role],
  )

  // Eine Abfrage für Timeline UND Historie-Zeitstrahl: beide zeigen dieselbe
  // Historie, getrenntes Laden würde den Zeitstrahl nach neuen Einträgen
  // veralten lassen.
  const historyQ = useRepoQuery(
    () =>
      view
        ? repository
            .listActivities(view.id)
            .then((items) => buildHistory(items, view.sentimentHistory))
        : Promise.resolve([]),
    [view?.id, view?.sentimentHistory],
  )
  const historyEntries = historyQ.data ?? []

  // Alle Gebiete, nicht nur das führende (0035) — sonst sieht man auf der Karte
  // nicht, dass der Kontakt zu zweien gehört.
  const regionName = view
    ? contactRegionIds(view)
        .map((id) => regions.find((r) => r.id === id)?.name)
        .filter(Boolean)
        .join(' · ') || undefined
    : undefined
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

  /**
   * Eigener Speicherweg fürs Kontaktfoto, sonst wie `save`. Nicht über
   * `updateContact`, weil dessen Policy serverseitig bei RM+ bleibt — ein
   * Account Manager bekäme dort keine Änderung durch (Migration 0032).
   */
  const savePhoto = async (photoUrl: string | null) => {
    if (!raw) return
    try {
      const updated = await repository.setContactPhoto(raw.id, photoUrl)
      setRaw(updated)
    } catch (err) {
      toast(saveErrorMessage(err))
      throw err // die Karte darf den Erfolg nicht annehmen und nichts wegräumen
    }
  }

  // Region direkt aus der Stammdaten-Bearbeitung heraus anlegen (nur RM+, weil
  // Bearbeiten canApprove verlangt). Danach die Regionsliste neu laden, damit die
  // neue Region überall — auch in anderen Karten — auftaucht; StammdatenCard macht
  // sie zusätzlich sofort lokal auswählbar. Gibt die neue Region zurück.
  const createRegion = async (name: string): Promise<Region> => {
    try {
      const created = await repository.createRegion(name)
      retry()
      return created
    } catch (err) {
      toast(saveErrorMessage(err))
      throw err
    }
  }

  // DSGVO-Löschung — nur Overall-Admin. Die Datenbank erzwingt das seit 0023
  // selbst; zuvor stand die Policy auf is_privileged(), die Beschränkung
  // existierte also NUR hier in der Oberfläche und war über die API umgehbar.
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <BackLink />
          {/* Zurück ins Team des Kontakts = nach Team gefilterte Liste (Feedback #9). */}
          {view.team && (
            <BackLink
              to={`/contacts?team=${encodeURIComponent(view.team)}`}
              label={`Team ${view.team}`}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <FavoriteToggle
            name={view.fullName}
            active={favorites.ids.has(view.id)}
            onToggle={() => void favorites.toggle(view.id)}
            showLabel
          />
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
            <>
              {/* Direkt von der Karte zum nächsten Kontakt (Feedback #4). */}
              <Link to="/contacts/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <Plus className="size-4" /> Neuer Kontakt
              </Link>
              <Link
                to={`/contacts/${view.id}/edit`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Pencil className="size-4" /> Bearbeiten
              </Link>
            </>
          )}
        </div>
      </div>

      <IdentityCard
        contact={view}
        canEdit={canEdit}
        canEditPhoto={canEditPhoto}
        regionName={regionName}
        regionIsPlaceholder={isPlaceholderRegion(view.regionId, regions)}
        managerName={managerName}
        viewerId={user.id}
        viewerName={user.name}
        onSave={save}
        onSavePhoto={savePhoto}
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
            onCreateRegion={createRegion}
            suggestions={suggestions}
          />
          <FactsCard contact={view} canEdit={canEdit} canSensitive={canSensitive} onSave={save} />
          <NetworkCard contact={view} canEdit={canEdit} />
          <IntroPathCard contact={view} />
          <KundenCard contact={view} canEdit={canEdit} onSave={save} />
          {/* Private photos are sensitive-tier data — hidden from Account Managers. */}
          {canSensitive && <FotogalerieCard contact={view} canEdit={canEdit} onSave={save} />}
          <NotizCard contact={view} canEdit={canEdit} canSensitive={canSensitive} onSave={save} />
          {/* Aus Jamie-Transkript strukturierte Fakten übernehmen — nur RM+ (Bearbeiten). */}
          {canEdit && <TranscriptImportCard contact={view} onApply={save} />}
          {/* Beziehungsverlauf auf einer Achse — ergänzt die Timeline rechts. */}
          <RelationshipTimelineCard history={historyEntries} createdAt={view.createdAt} />
        </div>

        {/* Right: unified activity timeline (stacks below on mobile) */}
        <Timeline
          contact={view}
          entries={historyEntries}
          error={historyQ.error}
          onReload={historyQ.retry}
          // Sprachmemo → Fakten-Vorschlag → Karte (Feedback #7), gleicher
          // Speicherweg wie alle Karten.
          onApplyFacts={save}
        />
      </div>
    </div>
  )
}
