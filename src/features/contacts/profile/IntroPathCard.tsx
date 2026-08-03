import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Route, Sparkles } from 'lucide-react'
import type { Contact } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { findIntroPaths, type IntroPath } from '@/domain/introPaths'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * „Wie komme ich an diese Person heran?" — der beste Weg aus unserem Team
 * zum Kontakt. Belegte Wege (Betreuung, gepflegte Verknüpfung) stehen vorn;
 * erschlossene Schritte („gleiches Team") werden als Vermutung ausgewiesen,
 * damit niemand sie für eine bestätigte Beziehung hält.
 */
export function IntroPathCard({ contact }: { contact: Contact }) {
  const { user } = useSession()

  const { data } = useRepoQuery(
    () =>
      Promise.all([
        repository.listContacts(),
        repository.listAllContactLinks(),
        repository.listUsers(),
      ]),
    [contact.id],
  )
  const contacts = useMemo(() => data?.[0] ?? [], [data])
  const links = useMemo(() => data?.[1] ?? [], [data])
  const users = useMemo(() => data?.[2] ?? [], [data])

  const paths = useMemo(
    () => (contacts.length > 0 ? findIntroPaths(contact.id, { contacts, links, users }) : []),
    [contact.id, contacts, links, users],
  )
  const nameOf = useMemo(() => new Map(contacts.map((c) => [c.id, c.fullName])), [contacts])
  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])

  // Betreut der angemeldete Nutzer selbst? Dann braucht es keine Vorstellung.
  const ownsIt = contact.relationshipManagerId === user.id

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="size-4 text-muted-foreground" /> Zugang
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {ownsIt && (
          <p className="text-sm text-foreground">
            Du betreust {contact.fullName.split(' ')[0]} selbst — kein Umweg nötig.
          </p>
        )}
        {!ownsIt && paths.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Kein Weg über unser Netz gefunden. Wenn niemand im Team eine Verbindung hat, hilft eine
            Anfrage im{' '}
            <Link to="/board" className="text-primary hover:underline">
              „Wer kann helfen?“-Board
            </Link>
            .
          </p>
        )}
        {!ownsIt &&
          paths.map((path) => (
            <PathRow
              key={`${path.startUserId}-${path.cost}`}
              path={path}
              startName={userName.get(path.startUserId) ?? 'Teammitglied'}
              nameOf={nameOf}
            />
          ))}
        {!ownsIt && paths.some((p) => p.hasInferred) && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="mt-0.5 size-3 shrink-0" />
            Schritte mit „vermutet“ sind erschlossen, weil die Personen im selben Team sitzen — nicht
            bestätigt. Gepflegte Verknüpfungen im Netzwerk machen die Wege belastbar.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function PathRow({
  path,
  startName,
  nameOf,
}: {
  path: IntroPath
  startName: string
  nameOf: Map<string, string>
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        <span className="font-medium">{startName}</span>
        {path.steps.map((step, i) => (
          <span key={`${step.contactId}-${i}`} className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowRight className="size-3" />
              {step.label}
            </span>
            {i === path.steps.length - 1 ? (
              <span className="font-medium">{nameOf.get(step.contactId) ?? '—'}</span>
            ) : (
              <Link to={`/contacts/${step.contactId}`} className="hover:underline">
                {nameOf.get(step.contactId) ?? '—'}
              </Link>
            )}
          </span>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge variant={path.hasInferred ? 'warning' : 'success'}>
          {path.hasInferred ? 'teils vermutet' : 'belegt'}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {path.steps.length} {path.steps.length === 1 ? 'Schritt' : 'Schritte'}
        </span>
      </div>
    </div>
  )
}
