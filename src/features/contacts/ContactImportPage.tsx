import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Upload } from 'lucide-react'
import type { AppUser, Contact, Region } from '@/domain/types'
import {
  buildContactsFromRows,
  findDuplicateRowIndices,
  guessMapping,
  IMPORTABLE_FIELDS,
  parseCsv,
  type FieldMapping,
} from '@/domain/csvImport'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { canApprove, ROLE_LABEL } from '@/domain/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { saveErrorMessage, useToast } from '@/components/ui/toast'

const selectCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type Step = 'paste' | 'map' | 'preview' | 'done'

export function ContactImportPage() {
  const { user } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('paste')
  const [csvText, setCsvText] = useState('')
  const [mapping, setMapping] = useState<FieldMapping>({})
  const [regions, setRegions] = useState<Region[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [existing, setExisting] = useState<Contact[]>([])
  const [regionId, setRegionId] = useState('')
  const [relationshipManagerId, setRelationshipManagerId] = useState('')
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [importFailures, setImportFailures] = useState<{ name: string; reason: string }[]>([])
  const { toast } = useToast()

  const parsed = useMemo(() => parseCsv(csvText), [csvText])

  const loadRefData = async () => {
    const [r, u, c] = await Promise.all([
      repository.listRegions(),
      repository.listUsers(),
      repository.listContacts(),
    ])
    setRegions(r)
    setUsers(u)
    setExisting(c)
    setRegionId(r[0]?.id ?? '')
    setRelationshipManagerId(u[0]?.id ?? '')
  }

  const startMapping = async () => {
    if (parsed.headers.length === 0 || parsed.rows.length === 0) return
    try {
      await loadRefData()
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    setMapping(guessMapping(parsed.headers))
    setSkipped(new Set()) // row indices from a previous CSV/mapping are meaningless now
    setStep('map')
  }

  const { results, errors, warnings } = useMemo(
    () =>
      step === 'preview'
        ? buildContactsFromRows(parsed.headers, parsed.rows, mapping, {
            regionId,
            relationshipManagerId,
          })
        : { results: [], errors: [], warnings: [] },
    [step, parsed, mapping, regionId, relationshipManagerId],
  )
  const duplicates = useMemo(() => findDuplicateRowIndices(results, existing), [results, existing])

  const toggleSkip = (rowIndex: number) =>
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })

  // Per-row fault tolerance: one bad row must not abort the batch mid-way
  // (previously a mid-loop failure left a partial import with no feedback,
  // and retrying duplicated the already-imported rows).
  const runImport = async () => {
    setImporting(true)
    const toImport = results.filter((r) => !skipped.has(r.rowIndex))
    const failures: { name: string; reason: string }[] = []
    let ok = 0
    for (const { contact } of toImport) {
      try {
        await repository.createContact(contact)
        ok++
      } catch (err) {
        failures.push({
          name: contact.fullName,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }
    setImportedCount(ok)
    setImportFailures(failures)
    setImporting(false)
    setStep('done')
  }

  if (!canApprove(user.role)) {
    return (
      <div className="space-y-3">
        <Link to="/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Alle Kontakte
        </Link>
        <p className="text-sm text-muted-foreground">
          Für Ihre Rolle ist der Kontakt-Import nicht freigegeben.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Alle Kontakte
      </Link>
      <h1 className="text-xl font-semibold">Kontakte importieren</h1>

      {step === 'paste' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. CSV einfügen oder hochladen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className={`${selectCls} inline-flex cursor-pointer items-center justify-center gap-2`}>
              <Upload className="size-4" /> CSV-Datei auswählen
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => setCsvText(String(reader.result ?? ''))
                  reader.readAsText(file)
                }}
              />
            </label>
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={10}
              placeholder={'Name,E-Mail,Funktion\nAnke Richter,anke@example.de,Einkauf\n…'}
              className="font-mono text-xs"
            />
            <div className="flex justify-end">
              <Button onClick={startMapping} disabled={!csvText.trim()}>
                Weiter
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'map' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Spalten zuordnen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {parsed.rows.length} Zeilen erkannt. Zuordnung wurde automatisch vorgeschlagen — bitte prüfen.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {IMPORTABLE_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label>
                    {f.label} {f.required && <span className="text-destructive">*</span>}
                  </Label>
                  <select
                    className={selectCls}
                    value={mapping[f.key] ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))
                    }
                  >
                    <option value="">— nicht importieren —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Region (für alle Zeilen)</Label>
                <select className={selectCls} value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Relationship Manager (für alle Zeilen)</Label>
                <select
                  className={selectCls}
                  value={relationshipManagerId}
                  onChange={(e) => setRelationshipManagerId(e.target.value)}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {ROLE_LABEL[u.role]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('paste')}>
                Zurück
              </Button>
              <Button
                onClick={() => {
                  setSkipped(new Set()) // mapping may have changed → old skips are stale
                  setStep('preview')
                }}
                disabled={!mapping.fullName}
              >
                Vorschau
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Vorschau &amp; Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {results.length} importierbar
              {errors.length > 0 && `, ${errors.length} übersprungen (Fehler)`}
              {warnings.length > 0 && ` · ${warnings.length} Hinweise`}
              {duplicates.size > 0 && ` · ${duplicates.size} mögliche Duplikate`}
            </p>
            {warnings.map((w) => (
              <div
                key={`warn-${w.rowIndex}`}
                className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                Zeile {w.rowIndex + 1}: {w.reason}
              </div>
            ))}
            <div className="max-h-96 space-y-1.5 overflow-y-auto">
              {results.map(({ rowIndex, contact }) => {
                const isDup = duplicates.has(rowIndex)
                const isSkipped = skipped.has(rowIndex)
                return (
                  <div
                    key={rowIndex}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={!isSkipped}
                      onChange={() => toggleSkip(rowIndex)}
                      className="size-4 accent-primary"
                      aria-label="Importieren"
                    />
                    <div className={`min-w-0 flex-1 ${isSkipped ? 'opacity-50' : ''}`}>
                      <div className="truncate text-sm font-medium">{contact.fullName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {contact.position || '—'} {contact.email ? `· ${contact.email}` : ''}
                      </div>
                    </div>
                    {isDup && (
                      <Badge variant="warning" className="shrink-0 gap-1">
                        <AlertTriangle className="size-3" /> Duplikat?
                      </Badge>
                    )}
                  </div>
                )
              })}
              {errors.map((e) => (
                <div
                  key={`err-${e.rowIndex}`}
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                >
                  Zeile {e.rowIndex + 1}: {e.reason}
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('map')}>
                Zurück
              </Button>
              <Button onClick={runImport} disabled={importing || results.length - skipped.size <= 0}>
                {importing
                  ? 'Importiere…'
                  : `${results.length - skipped.size} Kontakte importieren`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'done' && (
        <Card>
          <CardContent className="space-y-3 pt-5 text-center">
            <p className="text-sm text-foreground">
              {importedCount} Kontakt{importedCount === 1 ? '' : 'e'} erfolgreich importiert.
            </p>
            {importFailures.length > 0 && (
              <div className="space-y-1.5 text-left">
                <p className="text-sm font-medium text-destructive">
                  {importFailures.length} Zeile{importFailures.length === 1 ? '' : 'n'} fehlgeschlagen
                  — bitte prüfen und ggf. nur diese erneut importieren:
                </p>
                {importFailures.map((f, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                  >
                    {f.name}: {f.reason}
                  </div>
                ))}
              </div>
            )}
            <Button onClick={() => navigate('/contacts')}>Zu den Kontakten</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
