import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { IdentityCard } from './IdentityCard'
import { fileStore } from '@/lib/fileStore'
import type { Contact } from '@/domain/types'

// jsdom kann kein Canvas — das Verkleinern wird ersetzt, damit der Upload-Pfad
// der Karte überhaupt testbar ist.
vi.mock('@/lib/image', () => ({
  fileToResizedBlob: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' })),
  fileToResizedDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,zz'),
}))

const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

const contact: Contact = {
  id: 'c1',
  fullName: 'Test Person',
  position: 'CIO',
  company: 'Deutsche Telekom',
  team: 'Partner Management',
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

function renderCard(overrides: Partial<Parameters<typeof IdentityCard>[0]> = {}) {
  return render(
    <IdentityCard
      contact={contact}
      canEdit
      canEditPhoto
      regionName="Nord"
      managerName="Alex"
      viewerId="u1"
      viewerName="Alex"
      onSave={vi.fn().mockResolvedValue(undefined)}
      onSavePhoto={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />,
  )
}

describe('IdentityCard — 4-Zeilen-Kopf', () => {
  it('zeigt Position · Firma · Team als eine Zeile und Region/RM/Status zusammen', () => {
    renderCard()

    // Zeile 2: die drei Angaben verbunden, nicht auf mehrere Zeilen verteilt.
    expect(screen.getByText('CIO · Deutsche Telekom · Partner Management')).toBeInTheDocument()
    // Zeile 3: Region, Betreuer und Beziehungs-Ampel (RM+ = anklickbarer Wähler).
    expect(screen.getByText('Nord')).toBeInTheDocument()
    expect(screen.getByText('RM: Alex')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Positiv' })).toBeInTheDocument()
  })

  it('lässt leere Angaben in Zeile 2 aus statt leere Trenner zu zeigen', () => {
    renderCard({ contact: { ...contact, company: '', team: undefined } })
    expect(screen.getByText('CIO')).toBeInTheDocument()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })

  it('zeigt für Rollen ohne Bearbeitungsrecht den Status als Badge statt Wähler', () => {
    renderCard({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Positiv' })).not.toBeInTheDocument()
    expect(screen.getByText('Positiv')).toBeInTheDocument()
  })
})

describe('IdentityCard — Foto-Lightbox (Tier 3)', () => {
  it('bietet keinen Foto-Zoom an, wenn kein Foto vorhanden ist', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: /Foto von .* vergrößern/ })).not.toBeInTheDocument()
  })

  it('öffnet die Lightbox per Klick und schließt sie über den Button', () => {
    renderCard({ contact: { ...contact, photoUrl: PHOTO } })

    fireEvent.click(screen.getByRole('button', { name: 'Foto von Test Person vergrößern' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('button', { name: 'Schließen' })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('schließt die Lightbox mit Escape', () => {
    renderCard({ contact: { ...contact, photoUrl: PHOTO } })
    fireEvent.click(screen.getByRole('button', { name: 'Foto von Test Person vergrößern' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

/*
 * Ein einmal hinterlegtes Kontaktfoto ließ sich nicht mehr entfernen, nur
 * überschreiben — und die überschriebene Datei blieb im Bucket liegen. Beides
 * ist hier festgenagelt: der Knopf existiert, und die alte Datei verschwindet.
 *
 * Gespeichert wird seit 2026-09-17 über `onSavePhoto`, nicht über `onSave`:
 * das Foto darf jede Rolle pflegen, der Rest der Karte bleibt bei RM+.
 */
describe('IdentityCard — Kontaktfoto entfernen und ersetzen', () => {
  const STORED = 'storage:contact-avatars/c1/alt.jpg'
  const REMOVE_LABEL = 'Foto von Test Person entfernen'
  const CAMERA_LABEL = 'Foto aufnehmen oder hochladen'

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('bietet keinen Entfernen-Knopf an, wenn kein Foto hinterlegt ist', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: /Foto von .* entfernen/ })).not.toBeInTheDocument()
  })

  it('bietet ohne Fotorecht weder Kamera noch Entfernen-Knopf an', () => {
    // canEditPhoto ist die Schranke fürs Foto — nicht mehr canEdit.
    renderCard({ contact: { ...contact, photoUrl: PHOTO }, canEditPhoto: false })
    expect(screen.queryByRole('button', { name: CAMERA_LABEL })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Foto von .* entfernen/ })).not.toBeInTheDocument()
  })

  /*
   * Der Kern der Änderung: ein Account Manager darf das Foto pflegen, obwohl er
   * am Kontakt sonst nichts bearbeiten darf. Ginge das Foto weiter über canEdit,
   * fiele genau dieser Fall wieder hinten runter.
   */
  it('zeigt Kamera und Entfernen auch ohne canEdit, den Rest der Karte aber nicht', () => {
    renderCard({
      contact: { ...contact, photoUrl: PHOTO, linkedin: { status: 'has_account', url: 'https://x' } },
      canEdit: false,
      canEditPhoto: true,
    })

    expect(screen.getByRole('button', { name: CAMERA_LABEL })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REMOVE_LABEL })).toBeInTheDocument()

    // Alles andere bleibt zu: keine Beziehungs-Ampel zum Klicken, kein
    // LinkedIn-Stift — die stehen weiter hinter canEdit.
    expect(screen.queryByRole('button', { name: 'Positiv' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'LinkedIn bearbeiten' })).not.toBeInTheDocument()
  })

  it('löscht nach Rückfrage den Eintrag und die Bilddatei', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const removeFile = vi.spyOn(fileStore, 'remove').mockResolvedValue(undefined)
    const onSavePhoto = vi.fn().mockResolvedValue(undefined)
    renderCard({ contact: { ...contact, photoUrl: STORED }, onSavePhoto })

    fireEvent.click(screen.getByRole('button', { name: REMOVE_LABEL }))

    await waitFor(() => expect(onSavePhoto).toHaveBeenCalledWith(null))
    await waitFor(() => expect(removeFile).toHaveBeenCalledWith(STORED))
  })

  it('lässt das Foto stehen, wenn die Rückfrage abgelehnt wird', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const removeFile = vi.spyOn(fileStore, 'remove').mockResolvedValue(undefined)
    const onSavePhoto = vi.fn().mockResolvedValue(undefined)
    renderCard({ contact: { ...contact, photoUrl: STORED }, onSavePhoto })

    fireEvent.click(screen.getByRole('button', { name: REMOVE_LABEL }))

    expect(onSavePhoto).not.toHaveBeenCalled()
    expect(removeFile).not.toHaveBeenCalled()
  })

  it('räumt beim Ersetzen die alte Bilddatei weg', async () => {
    const NEU = 'storage:contact-avatars/c1/neu.jpg'
    vi.spyOn(fileStore, 'upload').mockResolvedValue(NEU)
    const removeFile = vi.spyOn(fileStore, 'remove').mockResolvedValue(undefined)
    const onSavePhoto = vi.fn().mockResolvedValue(undefined)
    const { container } = renderCard({ contact: { ...contact, photoUrl: STORED }, onSavePhoto })

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] },
    })

    await waitFor(() => expect(onSavePhoto).toHaveBeenCalledWith(NEU))
    await waitFor(() => expect(removeFile).toHaveBeenCalledWith(STORED))
  })
})
