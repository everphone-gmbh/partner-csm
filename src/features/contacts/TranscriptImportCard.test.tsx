import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Steuerbarer Ersatz für den Auto-Weg: Standard ist „nicht verfügbar" (wie im
// Mock-Backend), einzelne Tests schalten ihn gezielt frei.
const autoMock = vi.hoisted(() => ({
  available: false,
  extract: vi.fn<(transcript: string, contactName: string) => Promise<unknown>>(),
}))
vi.mock('./transcript/autoExtract', () => ({
  autoExtractAvailable: () => autoMock.available,
  extractViaServer: (transcript: string, contactName: string) =>
    autoMock.extract(transcript, contactName),
}))

import { TranscriptImportCard } from './TranscriptImportCard'
import type { Contact } from '@/domain/types'

const contact: Contact = {
  id: 'c1',
  fullName: 'Anke Richter',
  position: '',
  regionId: 'r1',
  relationshipManagerId: 'u1',
  linkedin: { status: 'unknown' },
  sentiment: 'neutral',
  wonCustomersCount: 0,
  sideFacts: [],
  customers: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const RESPONSE = JSON.stringify([
  { target: 'sideFact', value: 'Tennis', evidence: 'spielt Tennis', category: 'sport' },
  { target: 'sideFact', value: 'ist evangelisch', evidence: 'geht in die Kirche' },
])

beforeEach(() => {
  autoMock.available = false
  autoMock.extract.mockReset()
})

describe('TranscriptImportCard', () => {
  it('führt durch Prompt → Antwort → Freigabe und übernimmt nur Bestätigtes', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<TranscriptImportCard contact={contact} onApply={onApply} />)

    // 1. Transkript → Prompt (fireEvent, weil userEvent.type Sonderzeichen deutet)
    fireEvent.change(screen.getByPlaceholderText(/Transkript aus Jamie/), {
      target: { value: 'Spielt Tennis. Ist evangelisch.' },
    })
    await user.click(screen.getByRole('button', { name: 'Prompt für Gemini erzeugen' }))
    expect(screen.getByRole('button', { name: /Prompt kopieren/ })).toBeInTheDocument()

    // 3. Antwort von Gemini einfügen und prüfen
    fireEvent.change(screen.getByPlaceholderText(/"target": "sideFact"/), { target: { value: RESPONSE } })
    await user.click(screen.getByRole('button', { name: 'Vorschläge prüfen' }))

    // Beide Vorschläge sichtbar; der Art.-9-Treffer ist markiert und nicht wählbar.
    expect(screen.getByText('Tennis')).toBeInTheDocument()
    expect(screen.getByText(/nicht übernehmbar/)).toBeInTheDocument()
    expect(screen.getByLabelText('ist evangelisch übernehmen')).toBeDisabled()
    expect(screen.getByLabelText('Tennis übernehmen')).toBeChecked()

    // Übernehmen: nur Tennis, nicht der blockierte Vorschlag.
    await user.click(screen.getByRole('button', { name: /Übernehmen/ }))

    expect(onApply).toHaveBeenCalledTimes(1)
    const patch = onApply.mock.calls[0][0]
    expect(patch.sideFacts?.map((f: { label: string }) => f.label)).toEqual(['Tennis'])
    expect(screen.getByText(/1 Fakt\(en\) übernommen/)).toBeInTheDocument()
  })

  it('meldet einen Fehler bei unlesbarer Antwort und ruft onApply nicht', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<TranscriptImportCard contact={contact} onApply={onApply} />)

    fireEvent.change(screen.getByPlaceholderText(/Transkript aus Jamie/), { target: { value: 'irgendwas' } })
    await user.click(screen.getByRole('button', { name: 'Prompt für Gemini erzeugen' }))
    fireEvent.change(screen.getByPlaceholderText(/"target": "sideFact"/), { target: { value: 'kein json' } })
    await user.click(screen.getByRole('button', { name: 'Vorschläge prüfen' }))

    expect(screen.getByText(/kein gültiges JSON/i)).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })
})

describe('TranscriptImportCard — Auto-Extraktion (Edge Function)', () => {
  it('extrahiert automatisch und zeigt die Vorschläge ohne manuellen Umweg', async () => {
    autoMock.available = true
    autoMock.extract.mockResolvedValue({
      ok: true,
      raw: JSON.stringify([
        { target: 'sideFact', value: 'Tennis', evidence: 'spielt Tennis', category: 'sport' },
      ]),
    })
    const onApply = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<TranscriptImportCard contact={contact} onApply={onApply} />)

    fireEvent.change(screen.getByPlaceholderText(/Transkript aus Jamie/), {
      target: { value: 'Spielt Tennis.' },
    })
    await user.click(screen.getByRole('button', { name: /Vorschläge erzeugen/ }))

    // Vorschlag da, Server wurde mit Transkript + Kontaktname gerufen,
    // die manuellen Schritte (Prompt/Antwort) tauchen nie auf.
    expect(await screen.findByText('Tennis')).toBeInTheDocument()
    expect(autoMock.extract).toHaveBeenCalledWith('Spielt Tennis.', 'Anke Richter')
    expect(screen.queryByRole('button', { name: 'Prompt für Gemini erzeugen' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /Übernehmen/ }))
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('fällt auf den manuellen Weg zurück, wenn kein KI-Schlüssel gesetzt ist', async () => {
    autoMock.available = true
    autoMock.extract.mockResolvedValue({ ok: false, notConfigured: true, error: 'nicht konfiguriert' })
    const user = userEvent.setup()
    render(<TranscriptImportCard contact={contact} onApply={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/Transkript aus Jamie/), {
      target: { value: 'irgendwas' },
    })
    await user.click(screen.getByRole('button', { name: /Vorschläge erzeugen/ }))

    // Hinweis + manueller Weg; der Auto-Knopf ist weg.
    expect(await screen.findByText(/noch nicht freigeschaltet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prompt für Gemini erzeugen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Vorschläge erzeugen/ })).toBeNull()
  })

  it('zeigt im Mock-Modus weiterhin nur den manuellen Weg', () => {
    render(<TranscriptImportCard contact={contact} onApply={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Prompt für Gemini erzeugen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Vorschläge erzeugen/ })).toBeNull()
  })
})
