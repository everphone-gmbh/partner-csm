import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Muss vor den Importen stehen (vi.mock wird hochgezogen): die Karte bekommt ein
// eigenes Repository je Testfall und eine Sitzung mit gesetzter Rolle.
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

// MediaRecorder existiert in jsdom nicht — der Recorder wird durch einen Knopf
// ersetzt, der sofort einen kleinen webm-Blob „aufnimmt" (wie in
// TranscriptImportCard.test.tsx).
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

// Das Verkleinern läuft über <canvas>, das jsdom nicht hat. Die Datei
// unverändert durchreichen — geprüft wird hier der Anhang-Weg, nicht die
// Bildbearbeitung.
vi.mock('@/lib/image', () => ({
  fileToResizedBlob: async (file: File) => file,
  fileToResizedDataUrl: async () => 'data:image/jpeg;base64,AAA',
}))

import { renderPage } from '@/test/pageHarness'
import { EventNotes } from './EventNotes'

// Die Seed-Notiz zu diesem Event stammt von Alexandra (u-alex, sub_admin) —
// aus Sicht aller anderen Nutzer also eine fremde Notiz.
const EVENT = 'ev-digitalx'
const FREMDE_NOTIZ = /Standaufbau läuft/

const DELETE_NOTE = 'Notiz löschen'
const DELETE_ATTACHMENT = 'Anhang löschen'

afterEach(() => {
  vi.restoreAllMocks()
})

/** Schreibt eine Notiz über den Composer — sie gehört dann dem angemeldeten Nutzer. */
async function schreibeNotiz(text: string) {
  await userEvent.type(screen.getByPlaceholderText(/Was passiert gerade/), text)
  await userEvent.click(screen.getByRole('button', { name: /Speichern/ }))
  return await screen.findByText(text)
}

describe('EventNotes — Notizen nachträglich löschen', () => {
  it('lässt den Verfasser seine eigene Notiz löschen', async () => {
    const { repo } = renderPage(<EventNotes eventId={EVENT} />, { as: 'account_manager' })
    await screen.findByText(FREMDE_NOTIZ)

    await schreibeNotiz('Eigene Notiz')

    // Genau ein Löschknopf: an der eigenen Notiz, nicht an der fremden.
    const knopf = screen.getByRole('button', { name: DELETE_NOTE })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(knopf)

    expect(confirmSpy).toHaveBeenCalledWith('Diese Notiz und alle ihre Anhänge löschen?')
    await waitFor(() => expect(screen.queryByText('Eigene Notiz')).not.toBeInTheDocument())

    // Beleg, dass wirklich das Repository gerufen wurde und nicht nur die
    // Anzeige aufgeräumt hat.
    const gespeichert = await repo.listEventNotes(EVENT)
    expect(gespeichert.map((n) => n.text)).not.toContain('Eigene Notiz')
    // Die fremde Notiz bleibt stehen.
    expect(screen.getByText(FREMDE_NOTIZ)).toBeInTheDocument()
  })

  it('zeigt einem Account Manager an fremden Notizen keinen Löschknopf', async () => {
    renderPage(<EventNotes eventId={EVENT} />, { as: 'account_manager' })
    await screen.findByText(FREMDE_NOTIZ)

    // Mehmet (account_manager) ist weder Verfasser noch RM+ — die Policy
    // event_notes_delete würde ihn abweisen, also gibt es hier keinen Knopf.
    expect(screen.queryByRole('button', { name: DELETE_NOTE })).not.toBeInTheDocument()
  })

  it('lässt einen Relationship Manager auch fremde Notizen löschen', async () => {
    // Olaf ist sub_admin (= Relationship Manager), aber NICHT der Verfasser —
    // bewusst nicht die Rolle allein gewählt, sonst träfe es Alexandra selbst.
    const { user } = renderPage(<EventNotes eventId={EVENT} />, { as: 'u-olaf' })
    expect(user.role).toBe('sub_admin')
    await screen.findByText(FREMDE_NOTIZ)

    expect(screen.getByRole('button', { name: DELETE_NOTE })).toBeInTheDocument()
  })

  it('löscht nichts, wenn die Rückfrage abgelehnt wird', async () => {
    const { repo } = renderPage(<EventNotes eventId={EVENT} />, { as: 'u-olaf' })
    await screen.findByText(FREMDE_NOTIZ)

    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(screen.getByRole('button', { name: DELETE_NOTE }))

    expect(screen.getByText(FREMDE_NOTIZ)).toBeInTheDocument()
    expect(await repo.listEventNotes(EVENT)).toHaveLength(1)
  })

  it('entfernt einen einzelnen Anhang und lässt Notiz und Rest stehen', async () => {
    const { repo, container } = renderPage(<EventNotes eventId={EVENT} />, {
      as: 'account_manager',
    })
    await screen.findByText(FREMDE_NOTIZ)

    const dateiFeld = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(dateiFeld, {
      target: {
        files: [
          new File(['a'], 'eins.png', { type: 'image/png' }),
          new File(['b'], 'zwei.png', { type: 'image/png' }),
        ],
      },
    })
    await screen.findByAltText('eins.png')
    await screen.findByAltText('zwei.png')

    await schreibeNotiz('Zwei Bilder')
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: DELETE_ATTACHMENT })).toHaveLength(2),
    )

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(screen.getAllByRole('button', { name: DELETE_ATTACHMENT })[0])
    expect(confirmSpy).toHaveBeenCalledWith('Diesen Anhang löschen?')

    await waitFor(() => expect(screen.queryByAltText('eins.png')).not.toBeInTheDocument())
    // Notiz und zweiter Anhang bleiben — es wurde genau ein Anhang entfernt,
    // nicht die ganze Notiz.
    expect(screen.getByText('Zwei Bilder')).toBeInTheDocument()
    expect(screen.getByAltText('zwei.png')).toBeInTheDocument()

    const gespeichert = (await repo.listEventNotes(EVENT)).find((n) => n.text === 'Zwei Bilder')
    expect(gespeichert?.attachments.map((a) => a.name)).toEqual(['zwei.png'])
  })
})
