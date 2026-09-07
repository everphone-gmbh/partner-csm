import type { ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ExtractionSuggestion, ExtractionTarget } from './extraction'

const TARGET_LABEL: Record<ExtractionTarget, string> = {
  birthday: 'Geburtstag',
  location: 'Wohnort',
  familyStatus: 'Familienstand',
  children: 'Kinder',
  pets: 'Haustiere',
  sideFact: 'Anknüpfungspunkt',
  customer: 'Kunde',
}

/** Was `planApply` zurückmeldet, nachdem der Nutzer übernommen hat. */
export interface ApplyResult {
  applied: number
  skipped: string[]
}

/**
 * Prüfliste für extrahierte Fakten: jeder Vorschlag einzeln abhakbar, Art.-9-
 * Treffer sichtbar, aber gesperrt, dazu „Übernehmen (N)". Nach dem Übernehmen
 * zeigt dieselbe Komponente das Ergebnis (übernommen / übersprungen).
 *
 * Ursprünglich Schritt 4 der Transkript-Import-Karte; herausgezogen, als das
 * Sprachmemo im Aktivitäts-Composer dieselbe Freigabe brauchte. Die Regel
 * dahinter gilt an beiden Stellen: nichts landet auf der Karte, was der Nutzer
 * nicht einzeln bestätigt hat (siehe extraction.ts).
 *
 * `children` steht unter der Liste bzw. unter dem Ergebnis — der Aufrufer legt
 * dort seine Aktion ab („Weiteres Transkript", „Schließen").
 */
export function SuggestionReview({
  suggestions,
  approved,
  onToggle,
  onApply,
  applying,
  result,
  children,
}: {
  suggestions: ExtractionSuggestion[]
  approved: Set<string>
  onToggle: (id: string) => void
  onApply: () => void
  applying: boolean
  /** Gesetzt nach dem Übernehmen: Ergebnis statt Liste. */
  result?: ApplyResult | null
  children?: ReactNode
}) {
  if (result) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium text-status-green">{result.applied} Fakt(en) übernommen.</p>
        {result.skipped.length > 0 && (
          <div className="text-muted-foreground">
            <p>Übersprungen:</p>
            <ul className="list-disc pl-5">
              {result.skipped.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {children}
      </div>
    )
  }

  const approvedCount = suggestions.filter((s) => approved.has(s.id) && !s.blocked).length

  return (
    <div className="space-y-2">
      {/*
        Transparenz statt stillem Weglassen: der RM soll wissen, WARUM
        z. B. eine erwähnte Krankheit nicht auftaucht — sonst wirkt die
        Extraktion lückenhaft. Der Ausschluss selbst passiert zweistufig
        (Prompt-Verbot + Client-Filter, siehe extraction.ts).
      */}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Besondere Kategorien nach Art. 9 DSGVO (Gesundheit, Religion, politische
          Meinung, Gewerkschaft, Sexualleben, Herkunft) werden bewusst nicht
          extrahiert und nie übernommen — auch wenn das Transkript sie erwähnt.
        </span>
      </p>
      {suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine belegbaren Fakten gefunden.</p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s) => (
            <li key={s.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={approved.has(s.id) && !s.blocked}
                disabled={s.blocked}
                onChange={() => onToggle(s.id)}
                aria-label={`${s.value} übernehmen`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{TARGET_LABEL[s.target]}</Badge>
                  <span className="text-sm font-medium">{s.value}</span>
                  {s.target === 'customer' && (
                    <span className="text-xs text-muted-foreground">
                      {s.withUs ? 'mit uns' : 'Potenzial'}
                    </span>
                  )}
                </div>
                {s.evidence && (
                  <p className="text-xs italic text-muted-foreground">„{s.evidence}"</p>
                )}
                {s.blocked && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <ShieldAlert className="size-3.5" /> Art. 9 ({s.blockReason}) — nicht übernehmbar
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {(suggestions.length > 0 || children) && (
        <div className="flex flex-wrap items-center gap-3">
          {suggestions.length > 0 && (
            <Button size="sm" onClick={onApply} disabled={applying || approvedCount === 0}>
              {applying ? 'Übernehme…' : `Übernehmen (${approvedCount})`}
            </Button>
          )}
          {children}
        </div>
      )}
    </div>
  )
}
