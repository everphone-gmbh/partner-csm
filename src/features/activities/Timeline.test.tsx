vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

// Steuerbarer Ersatz für den KI-Weg (wie in TranscriptImportCard.test):
// Standard ist „nicht verfügbar" — so wie im Mock-Backend.
const autoMock = vi.hoisted(() => ({
  available: false,
  extract: vi.fn<(transcript: string, contactName: string) => Promise<unknown>>(),
  transcribe: vi.fn<(audio: Blob) => Promise<unknown>>(),
}))
vi.mock('@/features/contacts/transcript/autoExtract', () => ({
  autoExtractAvailable: () => autoMock.available,
  extractViaServer: (transcript: string, contactName: string) =>
    autoMock.extract(transcript, contactName),
  transcribeViaServer: (audio: Blob) => autoMock.transcribe(audio),
}))

// MediaRecorder existiert in jsdom nicht — der Recorder wird durch einen Knopf
// ersetzt, der sofort einen kleinen webm-Blob „aufnimmt".
vi.mock('@/components/VoiceRecorder', () => ({
  VoiceRecorder: ({
    onRecorded,
    label = 'Sprachmemo',
  }: {
    onRecorded: (audio: Blob) => void
    label?: string
  }) => (
    <button type="button" onClick={() => onRecorded(new Blob(['x'], { type: 'audio/webm' }))}>
      {label}
    </button>
  ),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderPage } from '@/test/pageHarness'
import { Timeline } from './Timeline'
import { buildHistory } from './timelineHistory'
import { parseSuggestions, planApply } from '@/features/contacts/transcript/extraction'
import type { Activity, Contact } from '@/domain/types'

const contact: Contact = {
  id: 'c1',
  fullName: 'Test Person',
  position: 'CIO',
  regionId: 'r1',
  relationshipManagerId: 'u1',
  linkedin: { status: 'unknown' },
  sentiment: 'green',
  wonCustomersCount: 0,
  sideFacts: [],
  customers: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

/** A note whose confidential body has no AI summary — the redaction edge case. */
function noteWithBody(): Activity {
  return {
    id: 'a1',
    contactId: 'c1',
    type: 'note',
    occurredAt: new Date().toISOString(), // today → "Heute" bucket
    authorId: 'u',
    authorName: 'Max Berger',
    body: 'GEHEIMER VOLLTEXT',
    attachments: [],
  }
}

beforeEach(() => {
  autoMock.available = false
  autoMock.extract.mockReset()
  autoMock.transcribe.mockReset()
})

describe('Timeline — redaction invariant', () => {
  it('never shows the raw body to account managers when there is no AI summary', () => {
    renderPage(
      <Timeline contact={contact} entries={buildHistory([noteWithBody()])} onReload={vi.fn()} />,
      { as: 'account_manager' },
    )
    expect(screen.queryByText('GEHEIMER VOLLTEXT')).not.toBeInTheDocument()
    expect(screen.getByText(/nur als KI-Zusammenfassung sichtbar/)).toBeInTheDocument()
  })

  it('shows the body to relationship managers (RM+)', () => {
    renderPage(
      <Timeline contact={contact} entries={buildHistory([noteWithBody()])} onReload={vi.fn()} />,
      { as: 'sub_admin' },
    )
    expect(screen.getByText('GEHEIMER VOLLTEXT')).toBeInTheDocument()
  })
})

describe('Timeline — rail & grouping', () => {
  it('renders a date-group header and the author mini-avatar', () => {
    renderPage(
      <Timeline contact={contact} entries={buildHistory([noteWithBody()])} onReload={vi.fn()} />,
      { as: 'sub_admin' },
    )
    expect(screen.getByText('Heute')).toBeInTheDocument()
    expect(screen.getByText('MB')).toBeInTheDocument() // Max Berger → initials
  })

  it('shows a friendly empty state when there is no history', () => {
    renderPage(<Timeline contact={contact} entries={[]} onReload={vi.fn()} />, { as: 'sub_admin' })
    expect(screen.getByText(/Noch keine Aktivitäten/)).toBeInTheDocument()
  })
})

// --- Sprachmemo → Notiz + Fakten-Vorschlag (Feedback #7) -------------------

const RAW = JSON.stringify([
  { target: 'birthday', value: '1980-05-04', evidence: 'am 4. Mai 1980 geboren' },
  { target: 'sideFact', value: 'Segeln', evidence: 'segelt gern', category: 'hobby' },
  // Art. 9: „Diagnose" löst den Gesundheits-Filter aus — darf nie übernehmbar sein.
  { target: 'sideFact', value: 'Diabetes', evidence: 'seit der Diagnose Diabetes' },
])
const NOTE = 'Am 4. Mai 1980 geboren, segelt gern, seit der Diagnose Diabetes.'

function renderComposer(as: 'sub_admin' | 'account_manager', onApply = vi.fn()) {
  const view = renderPage(
    <Timeline contact={contact} entries={[]} onReload={vi.fn()} onApplyFacts={onApply} />,
    { as },
  )
  return { ...view, onApply }
}

describe('Timeline — Sprachmemo im Composer', () => {
  it('hängt das Transkript an den vorhandenen Text an', async () => {
    autoMock.available = true
    autoMock.transcribe.mockResolvedValue({ ok: true, transcript: 'Sie segelt gern.' })
    const user = userEvent.setup()
    renderComposer('sub_admin')

    const area = screen.getByPlaceholderText(/Was ist passiert/)
    fireEvent.change(area, { target: { value: 'Kurzes Telefonat.' } })

    await user.click(screen.getByRole('button', { name: 'Sprachmemo' }))

    // Vorhandener Text bleibt, Absatz dazwischen; die Art bleibt „Notiz".
    await waitFor(() => expect(area).toHaveValue('Kurzes Telefonat.\n\nSie segelt gern.'))
    expect(autoMock.transcribe).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Notiz' })).toHaveAttribute('aria-pressed', 'true')

    // Leeres Feld: Transkript ohne Trenner.
    fireEvent.change(area, { target: { value: '' } })
    autoMock.transcribe.mockResolvedValue({ ok: true, transcript: 'Nachtrag.' })
    await user.click(screen.getByRole('button', { name: 'Sprachmemo' }))
    await waitFor(() => expect(area).toHaveValue('Nachtrag.'))
  })

  it('schlägt Fakten vor, sperrt Art.-9-Treffer und übernimmt nur Bestätigtes auf die Karte', async () => {
    autoMock.available = true
    autoMock.extract.mockResolvedValue({ ok: true, raw: RAW })
    const onApply = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderComposer('sub_admin', onApply)

    const facts = screen.getByRole('button', { name: 'Fakten für die Karte vorschlagen' })
    // Zu kurz für eine Extraktion → Knopf bleibt aus.
    fireEvent.change(screen.getByPlaceholderText(/Was ist passiert/), { target: { value: 'kurz' } })
    expect(facts).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/Was ist passiert/), { target: { value: NOTE } })
    expect(facts).toBeEnabled()
    await user.click(facts)

    expect(await screen.findByText('1980-05-04')).toBeInTheDocument()
    expect(autoMock.extract).toHaveBeenCalledWith(NOTE, 'Test Person')
    expect(screen.getByText('Segeln')).toBeInTheDocument()
    expect(screen.getByLabelText('Diabetes übernehmen')).toBeDisabled()
    expect(screen.getByText(/Art\. 9 \(Gesundheit\) — nicht übernehmbar/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Übernehmen (2)' }))

    // Genau der Patch, den planApply aus den zwei freigegebenen Vorschlägen baut.
    const approved = parseSuggestions(RAW).suggestions.filter((s) => !s.blocked)
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0][0]).toEqual(planApply(contact, approved).patch)
    expect(onApply.mock.calls[0][0].birthday).toBe('1980-05-04')
    expect(onApply.mock.calls[0][0].sideFacts.map((f: { label: string }) => f.label)).toEqual(['Segeln'])

    expect(await screen.findByText(/2 Fakt\(en\) übernommen/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(screen.queryByText(/Fakt\(en\) übernommen/)).toBeNull()
  })

  it('behält die Vorschlagsliste, wenn die Notiz gespeichert wird', async () => {
    autoMock.available = true
    autoMock.extract.mockResolvedValue({ ok: true, raw: RAW })
    const user = userEvent.setup()
    const { repo } = renderComposer('sub_admin')

    const area = screen.getByPlaceholderText(/Was ist passiert/)
    fireEvent.change(area, { target: { value: NOTE } })
    await user.click(screen.getByRole('button', { name: 'Fakten für die Karte vorschlagen' }))
    await screen.findByText('Segeln')

    await user.click(screen.getByRole('button', { name: 'Eintrag speichern' }))

    // Feld leer, Notiz gespeichert — die Liste zur Karte steht noch.
    await waitFor(() => expect(area).toHaveValue(''))
    expect((await repo.listActivities('c1')).map((a) => a.body)).toEqual([NOTE])
    expect(screen.getByText('Segeln')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Übernehmen (2)' })).toBeInTheDocument()
  })

  it('zeigt Account Managern weder Recorder noch Vorschlags-Knopf', () => {
    // Die Edge Functions verlangen RM+ — die Oberfläche bietet nichts an, was
    // serverseitig mit 403 endet.
    autoMock.available = true
    renderComposer('account_manager')
    expect(screen.getByPlaceholderText(/Was ist passiert/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sprachmemo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Fakten für die Karte vorschlagen' })).toBeNull()
  })

  it('bietet ohne KI-Endpoint (Demo-Modus) keine Memo-Funktionen an', () => {
    renderComposer('sub_admin')
    expect(screen.queryByRole('button', { name: 'Sprachmemo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Fakten für die Karte vorschlagen' })).toBeNull()
  })

  it('blendet die Memo-Funktionen aus und meldet es, wenn der Endpoint nicht freigeschaltet ist', async () => {
    autoMock.available = true
    autoMock.transcribe.mockResolvedValue({ ok: false, notConfigured: true, error: 'nicht konfiguriert' })
    const user = userEvent.setup()
    renderComposer('sub_admin')

    await user.click(screen.getByRole('button', { name: 'Sprachmemo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'KI-Endpoint ist noch nicht freigeschaltet.',
    )
    expect(screen.queryByRole('button', { name: 'Sprachmemo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Fakten für die Karte vorschlagen' })).toBeNull()
    // Der normale Composer bleibt benutzbar.
    expect(screen.getByRole('button', { name: 'Eintrag speichern' })).toBeInTheDocument()
  })

  it('meldet Transkriptionsfehler per Toast und lässt das Feld unangetastet', async () => {
    autoMock.available = true
    autoMock.transcribe.mockResolvedValue({ ok: false, error: 'Aufnahme ist zu groß.' })
    const user = userEvent.setup()
    renderComposer('sub_admin')

    await user.click(screen.getByRole('button', { name: 'Sprachmemo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Aufnahme ist zu groß.')
    expect(screen.getByPlaceholderText(/Was ist passiert/)).toHaveValue('')
    // Kein not_configured → die Knöpfe bleiben.
    expect(screen.getByRole('button', { name: 'Sprachmemo' })).toBeInTheDocument()
  })
})
