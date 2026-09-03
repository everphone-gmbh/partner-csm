import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { IdentityCard } from './IdentityCard'
import type { Contact } from '@/domain/types'

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
      regionName="Nord"
      managerName="Alex"
      viewerId="u1"
      viewerName="Alex"
      onSave={vi.fn().mockResolvedValue(undefined)}
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
