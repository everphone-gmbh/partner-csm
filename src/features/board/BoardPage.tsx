import { useState } from 'react'
import { HandHelping, Plus, Trash2 } from 'lucide-react'
import type { IntroRequest } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'

/**
 * "Wer kann helfen?" — the intro-request board. AMs post what door they need
 * opened; whoever has the relationship clicks "Ich kann helfen". Drives the
 * multiplier effect the tool was built for.
 */
export function BoardPage() {
  const { user } = useSession()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  const { data, loading, error, retry } = useRepoQuery(() => repository.listIntroRequests(), [])
  const requests = data ?? []
  const open = requests.filter((r) => r.status === 'open')
  const resolved = requests.filter((r) => r.status === 'resolved')

  const post = async () => {
    const t = text.trim()
    if (!t) return
    setPosting(true)
    try {
      await repository.addIntroRequest({ text: t, createdById: user.id, createdByName: user.name })
      setText('')
      retry()
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setPosting(false)
    }
  }

  const help = async (req: IntroRequest) => {
    try {
      await repository.resolveIntroRequest(req.id, user.name)
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    toast('Danke! Der Kollege wird es im Board sehen.', 'success')
    retry()
  }

  const remove = async (req: IntroRequest) => {
    try {
      await repository.deleteIntroRequest(req.id)
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    retry()
  }

  if (error) return <QueryError error={error} retry={retry} />

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wer kann helfen?</h1>
        <p className="text-sm text-muted-foreground">
          Türöffner gesucht — poste, zu wem du einen Draht brauchst.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-5 sm:pt-5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="z. B. „Ich brauche einen Kontakt zum Einkauf in Region Ost — wer kennt dort jemanden?“"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={post} disabled={!text.trim() || posting}>
              <Plus className="size-4" /> {posting ? 'Posten…' : 'Posten'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Lädt…</p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold text-muted-foreground">
              Offen ({open.length})
            </h2>
            {open.length === 0 && (
              <p className="px-1 text-sm text-muted-foreground">
                Keine offenen Anfragen — alle Türen offen. 🚪
              </p>
            )}
            {open.map((req) => (
              <Card key={req.id}>
                <CardContent className="space-y-2 pt-5 sm:pt-5">
                  <p className="text-sm">{req.text}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {req.createdByName} · {formatDate(req.createdAt)}
                    </span>
                    <div className="flex items-center gap-2">
                      {(req.createdById === user.id || user.role === 'overall_admin') && (
                        <button
                          type="button"
                          onClick={() => remove(req)}
                          aria-label="Anfrage löschen"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                      {req.createdById !== user.id && (
                        <Button size="sm" variant="outline" onClick={() => help(req)}>
                          <HandHelping className="size-4" /> Ich kann helfen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>

          {resolved.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-sm font-semibold text-muted-foreground">
                Erledigt ({resolved.length})
              </h2>
              {resolved.map((req) => (
                <Card key={req.id} className="opacity-70">
                  <CardContent className="space-y-2 pt-5 sm:pt-5">
                    <p className="text-sm">{req.text}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {req.createdByName} · {formatDate(req.createdAt)}
                      </span>
                      <Badge variant="success">
                        <HandHelping className="size-3" /> {req.helperName} hilft
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
