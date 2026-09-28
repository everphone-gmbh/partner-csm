vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { currentLocation, renderPage } from '@/test/pageHarness'
import { UnsavedChangesScope, useUnsavedChangesEntry } from './UnsavedChangesScope'
import { NotizCard } from '@/features/contacts/profile/NotizCard'
import { FactsCard } from '@/features/contacts/profile/FactsCard'
import { Timeline } from '@/features/activities/Timeline'
import type { Contact } from '@/domain/types'

/**
 * Anlass: der Router kennt nur EINEN Wächter pro Seite, und den hielt die
 * Stammdaten-Karte. Eingaben auf allen übrigen Karten des Profils gingen beim
 * Wegklicken still verloren — ein getippter Anknüpfungspunkt, eine Notiz, und
 * ein diktiertes Sprachmemo im Aktivitäts-Composer.
 */

const contact: Contact = {
  id: 'c1',
  fullName: 'Test Person',
  position: 'CIO',
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

/** Eine Karte, die nur ihren Eingabestand meldet — für die Mechanik der Klammer. */
function FakeCard({ name, onSave }: { name: string; onSave: () => Promise<boolean | void> }) {
  const [value, setValue] = useState('')
  useUnsavedChangesEntry(name, { isDirty: value !== '', onSave })
  return <input aria-label={name} value={value} onChange={(e) => setValue(e.target.value)} />
}

function withLeaveLink(ui: React.ReactNode) {
  return (
    <UnsavedChangesScope>
      {ui}
      <Link to="/dashboard">Übersicht</Link>
    </UnsavedChangesScope>
  )
}

async function leave() {
  // fireEvent statt userEvent: kein Fokuswechsel, also kein Blur — so wie ein
  // Tipp in der Handy-Leiste oder der Zurück-Knopf des Browsers.
  fireEvent.click(screen.getByRole('link', { name: 'Übersicht' }))
  return screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' })
}

describe('UnsavedChangesScope — ein Wächter für mehrere Karten', () => {
  it('fragt nach, sobald irgendeine Karte Ungespeichertes meldet', async () => {
    const user = userEvent.setup()
    renderPage(
      withLeaveLink(
        <>
          <FakeCard name="eins" onSave={vi.fn()} />
          <FakeCard name="zwei" onSave={vi.fn()} />
        </>,
      ),
      { route: '/contacts/c1' },
    )
    await user.type(screen.getByLabelText('zwei'), 'x')
    await leave()
    expect(currentLocation()).toBe('/contacts/c1')
  })

  it('speichert nur die Karten, die etwas zu speichern haben', async () => {
    const user = userEvent.setup()
    const eins = vi.fn().mockResolvedValue(true)
    const zwei = vi.fn().mockResolvedValue(true)
    renderPage(
      withLeaveLink(
        <>
          <FakeCard name="eins" onSave={eins} />
          <FakeCard name="zwei" onSave={zwei} />
        </>,
      ),
      { route: '/contacts/c1' },
    )
    await user.type(screen.getByLabelText('zwei'), 'x')
    const dialog = await leave()
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(currentLocation()).toBe('/dashboard'))
    expect(zwei).toHaveBeenCalledTimes(1)
    expect(eins).not.toHaveBeenCalled()
  })

  it('bleibt auf der Seite, wenn eine Karte nicht speichern kann', async () => {
    const user = userEvent.setup()
    renderPage(withLeaveLink(<FakeCard name="eins" onSave={() => Promise.resolve(false)} />), {
      route: '/contacts/c1',
    })
    await user.type(screen.getByLabelText('eins'), 'x')
    const dialog = await leave()
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(currentLocation()).toBe('/contacts/c1')
    expect(screen.getByLabelText('eins')).toHaveValue('x')
  })

  it('fragt nicht, wenn keine Karte etwas meldet', async () => {
    renderPage(withLeaveLink(<FakeCard name="eins" onSave={vi.fn()} />), { route: '/contacts/c1' })
    fireEvent.click(screen.getByRole('link', { name: 'Übersicht' }))
    await waitFor(() => expect(currentLocation()).toBe('/dashboard'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Karten des Kontaktprofils melden sich an', () => {
  it('Notiz: ungespeicherter Text löst die Rückfrage aus und wird gespeichert', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderPage(withLeaveLink(<NotizCard contact={contact} canEdit canSensitive onSave={onSave} />), {
      route: '/contacts/c1',
    })
    fireEvent.change(screen.getByPlaceholderText('Notiz hinzufügen…'), {
      target: { value: 'Spricht fließend Italienisch' },
    })
    const dialog = await leave()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(currentLocation()).toBe('/dashboard'))
    expect(onSave).toHaveBeenCalledWith({ freeText: 'Spricht fließend Italienisch' })
  })

  it('Anknüpfungspunkte: getippt, aber nicht hinzugefügt, geht nicht mehr verloren', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderPage(withLeaveLink(<FactsCard contact={contact} canEdit canSensitive onSave={onSave} />), {
      route: '/contacts/c1',
    })
    await user.type(screen.getByPlaceholderText(/Segeln/), 'Marathon')
    const dialog = await leave()
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(currentLocation()).toBe('/dashboard'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].sideFacts.map((f: { label: string }) => f.label)).toEqual([
      'Marathon',
    ])
  })

  it('Aktivität: ein ungespeicherter Eintrag im Composer wird aus der Rückfrage gespeichert', async () => {
    const user = userEvent.setup()
    const { repo } = renderPage(
      withLeaveLink(<Timeline contact={contact} entries={[]} onReload={vi.fn()} />),
      { route: '/contacts/c1', as: 'sub_admin' },
    )
    const spy = vi.spyOn(repo, 'addActivity')
    await user.type(screen.getByPlaceholderText(/Was ist passiert/), 'Transkript aus dem Sprachmemo')
    const dialog = await leave()
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(currentLocation()).toBe('/dashboard'))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].body).toBe('Transkript aus dem Sprachmemo')
  })

  it('Notiz ohne Bearbeitungsrecht meldet sich nicht an', async () => {
    renderPage(
      withLeaveLink(<NotizCard contact={contact} canEdit={false} canSensitive onSave={vi.fn()} />),
      { route: '/contacts/c1' },
    )
    fireEvent.click(screen.getByRole('link', { name: 'Übersicht' }))
    await waitFor(() => expect(currentLocation()).toBe('/dashboard'))
  })
})
