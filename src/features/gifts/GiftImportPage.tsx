import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Upload } from 'lucide-react'
import type { GiftOccasion, GiftOccasionKind, GiftStatus } from '@/domain/types'
import { GIFT_STATUSES } from '@/domain/types'
import type { NewGiftRecipient } from '@/data/repository'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { canManageGifts } from '@/domain/roles'
import { detectDelimiter, parseCsv } from '@/domain/csvImport'
import {
  blockToDrafts,
  collectSenderTokens,
  GIFT_IMPORT_FIELD_LABEL,
  matchContact,
  splitIntoBlocks,
  type GiftImportField,
  type ImportBlock,
} from '@/domain/giftImport'
import { GIFT_STATUS_LABEL } from '@/domain/gifts'
import { QueryError } from '@/components/QueryError'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { FieldHint, Notice } from '@/components/ui/notice'
import { selectCls } from '@/features/contacts/profile/shared'
import { cn } from '@/lib/utils'

const FIELDS = Object.keys(GIFT_IMPORT_FIELD_LABEL) as GiftImportField[]

interface BlockSettings {
  include: boolean
  mapping: GiftImportField[]
  /** Vorhandener Anlass (id) oder '' = neu anlegen unter `newName`. */
  occasionId: string
  newName: string
  newKind: GiftOccasionKind
  status: GiftStatus
}

type SenderChoice =
  | { mode: 'existing'; senderId: string }
  | { mode: 'new'; name: string; cLevel: boolean }
  | { mode: 'ignore' }

/** „2025/26" aus der Fußzeile → Saison; die laufende beginnt im August. */
function seasonFrom(text?: string): string | undefined {
  return text?.match(/(\d{4})\s*\/\s*(\d{2})/)?.slice(1, 3).join('/')
}

function currentSeason(today = new Date()): string {
  const y = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1
  return `${y}/${String(y + 1).slice(2)}`
}

function defaultsFor(block: ImportBlock, occasions: GiftOccasion[]): BlockSettings {
  const season = seasonFrom(block.footer)
  const name = season ? `Weihnachten ${season}` : `Import Liste ${block.index + 1}`
  const existing = occasions.find((o) => o.name.toLowerCase() === name.toLowerCase())
  // Ein Vorjahr ist gelaufen — dessen Geschenke sind zugestellt, nicht „geplant".
  const past = season !== undefined && season < currentSeason()
  return {
    include: true,
    mapping: block.mapping,
    occasionId: existing?.id ?? '',
    newName: name,
    newKind: season ? 'weihnachten' : 'sonstiges',
    status: past ? 'zugestellt' : 'geplant',
  }
}

/**
 * Die bestehenden Geschenklisten ins Tool holen, damit dieses Jahr nicht doppelt
 * gepflegt wird. Versteht das Sheet „X-Mas Gifts" mit seinen drei Listen: jede
 * wird einzeln erkannt, ihre Spalten zugeordnet (bei der Liste ohne Kopfzeile
 * geraten und zum Bestätigen angezeigt), und die Absender-Schreibweisen werden
 * einmal von Hand auf die Absenderliste abgebildet.
 *
 * Die Daten gehen vom Browser direkt in die Datenbank.
 */
export function GiftImportPage() {
  const { user } = useSession()
  const { toast } = useToast()
  const allowed = canManageGifts(user.role)
  const q = useRepoQuery(
    () =>
      allowed
        ? Promise.all([
            repository.listGiftOccasions(),
            repository.listGiftProducts(),
            repository.listGiftSenders(),
            repository.listGiftRecipients(),
            repository.listContacts(),
          ])
        : Promise.resolve(undefined),
    [allowed],
  )
  const [occasions, products, senders, recipients, contacts] = q.data ?? [[], [], [], [], []]

  const [text, setText] = useState('')
  const blocks = useMemo(() => {
    if (!text.trim()) return []
    const parsed = parseCsv(text, detectDelimiter(text))
    return splitIntoBlocks([parsed.headers, ...parsed.rows])
  }, [text])

  // Einstellungen je Block — neu gesetzt, sobald sich die eingefügte Liste ändert.
  const [settingsFor, setSettingsFor] = useState<{ text: string; blocks: BlockSettings[] }>({ text: '', blocks: [] })
  const settings =
    settingsFor.text === text && settingsFor.blocks.length === blocks.length
      ? settingsFor.blocks
      : blocks.map((b) => defaultsFor(b, occasions))
  const setBlock = (i: number, patch: Partial<BlockSettings>) =>
    setSettingsFor({ text, blocks: settings.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const drafts = useMemo(
    () =>
      blocks.map((b, i) =>
        settings[i]?.include ? blockToDrafts({ rows: b.rows, mapping: settings[i].mapping }) : { drafts: [], skipped: 0 },
      ),
    [blocks, settings],
  )
  const allDrafts = drafts.flatMap((d) => d.drafts)
  const tokens = useMemo(() => collectSenderTokens(allDrafts), [allDrafts])

  const [senderChoices, setSenderChoices] = useState<Record<string, SenderChoice>>({})
  const choiceFor = (token: string): SenderChoice => {
    const key = token.toLowerCase()
    if (senderChoices[key]) return senderChoices[key]
    const existing = senders.find((s) => s.name.toLowerCase() === key)
    return existing ? { mode: 'existing', senderId: existing.id } : { mode: 'new', name: token, cLevel: false }
  }
  const setChoice = (token: string, c: SenderChoice) =>
    setSenderChoices((prev) => ({ ...prev, [token.toLowerCase()]: c }))

  const [linkContacts, setLinkContacts] = useState(true)
  const contactMatches = allDrafts.filter((d) => matchContact(d, contacts)).length

  const [running, setRunning] = useState(false)
  const [importHint, setImportHint] = useState(false)
  const [result, setResult] = useState<{ total: number; occasions: GiftOccasion[] } | null>(null)

  if (!allowed) {
    return (
      <Notice tone="info">Der Import ist für Relationship Manager und die Leitung.</Notice>
    )
  }

  const runImport = async () => {
    setRunning(true)
    try {
      // 1. Absender auflösen — gleichnamige neue fallen dabei zusammen, weil
      //    createGiftSender „finden oder anlegen" ist. So werden Tippfehler
      //    zusammengeführt, indem man ihnen denselben Namen gibt.
      const senderIdByToken = new Map<string, string | undefined>()
      for (const { token } of tokens) {
        const c = choiceFor(token)
        if (c.mode === 'ignore') senderIdByToken.set(token.toLowerCase(), undefined)
        else if (c.mode === 'existing') senderIdByToken.set(token.toLowerCase(), c.senderId)
        else senderIdByToken.set(token.toLowerCase(), (await repository.createGiftSender(c.name, c.cLevel)).id)
      }

      let total = 0
      const touched: GiftOccasion[] = []
      // Was dieser Lauf anlegt, kennt die nächste Liste: Gin und Schokolade
      // gehören beide zu „Weihnachten 2026/27" — der Anlass entsteht einmal,
      // ein gleichnamiges Produkt auch.
      const knownOccasions = [...occasions]
      const knownProducts = [...products]
      for (let i = 0; i < blocks.length; i++) {
        const s = settings[i]
        if (!s.include || drafts[i].drafts.length === 0) continue
        // 2. Anlass: vorhanden oder neu — „neu" mit einem Namen, den es schon
        //    gibt, nimmt den vorhandenen statt einen zweiten gleichnamigen.
        const newName = s.newName.trim().toLowerCase()
        let occasion = s.occasionId
          ? knownOccasions.find((o) => o.id === s.occasionId)!
          : knownOccasions.find((o) => o.name.trim().toLowerCase() === newName)
        if (!occasion) {
          occasion = await repository.createGiftOccasion({ name: s.newName, kind: s.newKind })
          knownOccasions.push(occasion)
        }
        const occasionId = occasion.id
        if (!touched.some((o) => o.id === occasionId)) touched.push(occasion)
        // 3. Produkte dieses Anlasses: vorhandene nach Namen, fehlende anlegen.
        const productIdByName = new Map(
          knownProducts.filter((p) => p.occasionId === occasionId).map((p) => [p.name.toLowerCase(), p.id]),
        )
        for (const d of drafts[i].drafts) {
          const name = d.productName?.trim()
          if (name && !productIdByName.has(name.toLowerCase())) {
            const p = await repository.createGiftProduct({ occasionId, name })
            knownProducts.push(p)
            productIdByName.set(name.toLowerCase(), p.id)
          }
        }
        // 4. Empfänger.
        const rows: NewGiftRecipient[] = drafts[i].drafts.map((d) => ({
          occasionId,
          productId: d.productName ? productIdByName.get(d.productName.trim().toLowerCase()) : undefined,
          contactId: linkContacts ? matchContact(d, contacts) : undefined,
          firstName: d.firstName,
          lastName: d.lastName,
          company: d.company,
          street: d.street,
          postalCode: d.postalCode,
          city: d.city,
          country: d.country,
          shipping: d.shipping ?? 'direkt',
          status: s.status,
          senderIds: [
            ...new Set(
              d.senderTokens
                .map((t) => senderIdByToken.get(t.toLowerCase()))
                .filter((id): id is string => Boolean(id)),
            ),
          ],
        }))
        total += await repository.importGiftRecipients(rows)
      }
      setResult({ total, occasions: touched })
      toast(`${total} Empfänger importiert.`, 'success')
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <BackToGifts />
        <Card>
          <CardContent className="space-y-3 pt-5 sm:pt-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-status-green" />
              <h1 className="text-lg font-semibold">{result.total} Empfänger importiert</h1>
            </div>
            <ul className="space-y-1 text-sm">
              {result.occasions.map((o) => (
                <li key={o.id}>
                  <Link to={`/gifts?anlass=${o.id}`} className="text-primary hover:underline">
                    {o.name}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    )
  }

  const includedCount = drafts.reduce((n, d) => n + d.drafts.length, 0)
  // Was noch fehlt, bevor importiert werden kann — der Knopf bleibt klickbar.
  const importMissing =
    includedCount === 0
      ? 'Wähle mindestens eine Liste mit Empfängern.'
      : settings.some((st) => st.include && !st.occasionId && !st.newName.trim())
        ? 'Gib jedem neuen Anlass einen Namen.'
        : undefined

  return (
    <div className="space-y-4">
      <BackToGifts />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Liste importieren</h1>
        <p className="text-sm text-muted-foreground">
          Die bisherigen Geschenklisten ins Tool holen, damit nichts doppelt gepflegt wird.
        </p>
      </div>
      {q.error && <QueryError error={q.error} retry={q.retry} />}

      <Card>
        <CardContent className="space-y-2 pt-5 sm:pt-5">
          <h2 className="text-sm font-semibold">1 · Liste einfügen</h2>
          <p className="text-xs text-muted-foreground">
            In Google Sheets alles markieren (⌘A), kopieren (⌘C) und hier einfügen (⌘V). Mehrere Listen
            untereinander in einem Blatt werden einzeln erkannt. Alternativ eine CSV-Datei wählen.
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Hier einfügen …"
            aria-label="Eingefügte Liste"
            className="font-mono text-xs"
          />
          {/* Eigener Knopf statt des Browser-Dateifelds — das zeigte „Choose File“ auf Englisch. */}
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-black/[0.08] bg-card px-4 text-sm font-medium transition-colors hover:bg-secondary focus-within:ring-2 focus-within:ring-ring dark:border-white/[0.12]">
            <Upload className="size-4" /> CSV-Datei wählen
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              aria-label="CSV-Datei wählen"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const reader = new FileReader()
                reader.onload = () => setText(String(reader.result ?? ''))
                reader.readAsText(f)
              }}
            />
          </label>
        </CardContent>
      </Card>

      {blocks.map((b, i) => (
        <BlockCard
          key={i}
          block={b}
          settings={settings[i]}
          occasions={occasions.filter((o) => o.kind !== 'geburtstag')}
          existingCount={(settings[i].occasionId && recipients.filter((r) => r.occasionId === settings[i].occasionId).length) || 0}
          draftCount={drafts[i].drafts.length}
          skipped={drafts[i].skipped}
          onChange={(patch) => setBlock(i, patch)}
        />
      ))}

      {tokens.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5 sm:pt-5">
            <div>
              <h2 className="text-sm font-semibold">Absender zuordnen</h2>
              <p className="text-xs text-muted-foreground">
                Jede Schreibweise aus der Liste einmal zuordnen. Zwei Schreibweisen mit demselben Namen werden
                ein Absender — so lassen sich Tippfehler zusammenführen.
              </p>
            </div>
            <ul className="divide-y divide-border">
              {tokens.map(({ token, count }) => {
                const c = choiceFor(token)
                return (
                  <li key={token} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="w-40 truncate font-medium">{token}</span>
                    <span className="w-10 text-xs tabular-nums text-muted-foreground">{count}×</span>
                    <select
                      aria-label={`Zuordnung für ${token}`}
                      className={cn(selectCls, 'h-9 w-auto')}
                      value={c.mode === 'existing' ? c.senderId : c.mode}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === 'new') setChoice(token, { mode: 'new', name: token, cLevel: false })
                        else if (v === 'ignore') setChoice(token, { mode: 'ignore' })
                        else setChoice(token, { mode: 'existing', senderId: v })
                      }}
                    >
                      <option value="new">Neu anlegen</option>
                      {senders.map((s) => (
                        <option key={s.id} value={s.id}>
                          = {s.name}
                        </option>
                      ))}
                      <option value="ignore">Ignorieren</option>
                    </select>
                    {c.mode === 'new' && (
                      <>
                        <Input
                          value={c.name}
                          onChange={(e) => setChoice(token, { ...c, name: e.target.value })}
                          aria-label={`Name für ${token}`}
                          className="h-9 w-36"
                        />
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={c.cLevel}
                            onChange={(e) => setChoice(token, { ...c, cLevel: e.target.checked })}
                            className="size-4 accent-[var(--primary)]"
                          />
                          C-Level
                        </label>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {blocks.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5 sm:pt-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={linkContacts}
                onChange={(e) => setLinkContacts(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Gleichnamige Kontakte mit passender Firma verknüpfen ({contactMatches} Treffer)
            </label>
            <p className="text-xs text-muted-foreground">
              Verknüpft wird nur, wenn genau ein Kontakt Vor- und Nachnamen teilt. Dann erscheint das Geschenk
              auch auf seiner Karte.
            </p>
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <span className="text-sm">
                <b>{includedCount}</b> Empfänger aus {settings.filter((s) => s.include).length} Listen
              </span>
              <Button
                type="button"
                onClick={() => {
                  if (importMissing) {
                    setImportHint(true)
                    return
                  }
                  setImportHint(false)
                  void runImport()
                }}
                disabled={running}
                className="ml-auto"
              >
                {running ? 'Importiert…' : 'Import starten'}
              </Button>
            </div>
            {importHint && importMissing && <FieldHint className="justify-end">{importMissing}</FieldHint>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function BackToGifts() {
  return (
    <Link to="/gifts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Geschenke
    </Link>
  )
}

function BlockCard({
  block,
  settings,
  occasions,
  existingCount,
  draftCount,
  skipped,
  onChange,
}: {
  block: ImportBlock
  settings: BlockSettings
  occasions: GiftOccasion[]
  existingCount: number
  draftCount: number
  skipped: number
  onChange: (patch: Partial<BlockSettings>) => void
}) {
  const sample = block.rows.slice(0, 3)
  return (
    <Card className={cn(!settings.include && 'bg-secondary/50 shadow-none')}>
      <CardContent className="space-y-3 pt-5 sm:pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={settings.include}
              onChange={(e) => onChange({ include: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
            Liste {block.index + 1}
          </label>
          <span className="text-xs text-muted-foreground">
            {block.rows.length} Zeilen
            {block.footer ? ` · „${block.footer}“` : ''}
            {block.mappingSource === 'guessed' ? ' · ohne Kopfzeile, Spalten geraten' : ''}
          </span>
        </div>

        {settings.include && (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Anlass
                <select
                  className={selectCls}
                  value={settings.occasionId}
                  onChange={(e) => onChange({ occasionId: e.target.value })}
                >
                  <option value="">Neuer Anlass …</option>
                  {occasions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              {!settings.occasionId && (
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Name des neuen Anlasses
                  <Input value={settings.newName} onChange={(e) => onChange({ newName: e.target.value })} />
                </label>
              )}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Status für alle
                <select
                  className={selectCls}
                  value={settings.status}
                  onChange={(e) => onChange({ status: e.target.value as GiftStatus })}
                >
                  {GIFT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {GIFT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {existingCount > 0 && (
              <Notice tone="warning">
                Dieser Anlass hat schon {existingCount} Empfänger. Der Import legt zusätzlich an — wer die Liste ein
                zweites Mal einliest, hat die Zeilen danach doppelt.
              </Notice>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-xs">
                <thead>
                  {block.header && (
                    <tr className="text-muted-foreground">
                      {settings.mapping.map((_, j) => (
                        <th key={j} className="px-1 pb-1 text-left font-normal">
                          {block.header?.[j] || '—'}
                        </th>
                      ))}
                    </tr>
                  )}
                  <tr>
                    {settings.mapping.map((f, j) => (
                      <th key={j} className="px-1 pb-2 text-left">
                        <select
                          aria-label={`Spalte ${j + 1}`}
                          className={cn(selectCls, 'h-9 min-w-24 text-xs', f === 'ignore' && 'text-muted-foreground')}
                          value={f}
                          onChange={(e) =>
                            onChange({
                              mapping: settings.mapping.map((m, k) => (k === j ? (e.target.value as GiftImportField) : m)),
                            })
                          }
                        >
                          {FIELDS.map((field) => (
                            <option key={field} value={field}>
                              {GIFT_IMPORT_FIELD_LABEL[field]}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sample.map((row, r) => (
                    <tr key={r} className="border-t border-border">
                      {settings.mapping.map((_, j) => (
                        <td key={j} className="max-w-40 truncate px-1 py-1">
                          {row[j]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {draftCount} Empfänger
              {skipped > 0 ? ` · ${skipped} Zeilen ohne Name und Firma werden übersprungen` : ''}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
