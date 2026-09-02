vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderPage } from '@/test/pageHarness'
import { Timeline } from './Timeline'
import { buildHistory } from './timelineHistory'
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
