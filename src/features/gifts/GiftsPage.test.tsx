vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderPage } from '@/test/pageHarness'
import { GiftsPage } from './GiftsPage'
import { GiftImportPage } from './GiftImportPage'
import { GeschenkeCard } from '@/features/contacts/profile/GeschenkeCard'

/**
 * Die Demo-Daten bauen das Sheet im Kleinen nach (erfundene Namen): Weihnachten
 * 2026/27 mit fünf Geschenken in zwei Produkten, 2025/26 mit zwei, Jonas und
 * Mira als C-Level, Anke Richter als verknüpfter Demo-Kontakt.
 */

async function openPage(as: 'sub_admin' | 'account_manager' | 'overall_admin' = 'sub_admin') {
  const utils = renderPage(<GiftsPage />, { route: '/gifts', as })
  if (as !== 'account_manager') await screen.findByRole('tab', { name: /Weihnachten 2026\/27/ })
  return utils
}

describe('Geschenke — Sichtbarkeit', () => {
  it('ist für Account Manager gesperrt', async () => {
    renderPage(<GiftsPage />, { route: '/gifts', as: 'account_manager' })
    expect(await screen.findByText(/für Relationship Manager und die Leitung/)).toBeInTheDocument()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})

describe('Geschenke — Anlass und Liste wie im Mockup', () => {
  it('zeigt die Anlässe als Reiter mit Anzahl, Geburtstage zuletzt', async () => {
    await openPage()
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs[0]).toMatch(/Weihnachten 2026\/27\s*5/)
    expect(tabs[1]).toMatch(/Weihnachten 2025\/26\s*2/)
    expect(tabs[tabs.length - 1]).toMatch(/Geburtstage/)
  })

  it('zählt den Trichter kumulativ und die Produkte je Stück', async () => {
    await openPage()
    const funnel = screen.getByLabelText('Stand der Geschenke')
    // 5 geplant · 4 mindestens bestellt · 2 mindestens versandt · 1 zugestellt
    expect(within(funnel).getAllByText(/^\d+$/).map((n) => n.textContent)).toEqual(['5', '4', '2', '1'])
    expect(screen.getByText('Versand bis 12.12.2026')).toBeInTheDocument()
    expect(screen.getByText('5 Geschenke · 5 Firmen')).toBeInTheDocument()
  })

  it('kennzeichnet verknüpfte Empfänger, reine Listeneinträge und fehlende Adressen', async () => {
    await openPage()
    const anke = screen.getByRole('button', { name: 'Anke Richter' }).closest('tr')!
    expect(within(anke).getByRole('link', { name: /Kontakt verknüpft/ })).toHaveAttribute('href', '/contacts/c-anke')
    const paul = screen.getByRole('button', { name: 'Paul Linde' }).closest('tr')!
    expect(within(paul).getByText('nur in dieser Liste')).toBeInTheDocument()
    expect(within(paul).getByText('Adresse fehlt')).toBeInTheDocument()
  })

  it('filtert nach Produkt', async () => {
    const user = userEvent.setup()
    await openPage()
    await user.selectOptions(screen.getByLabelText('Nach Produkt filtern'), 'gp-gin')
    expect(screen.getByText('2 von 5 · nach Firma sortiert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anke Richter' })).toBeNull()
  })

  it('stellt den Status direkt in der Zeile um', async () => {
    const user = userEvent.setup()
    const { repo } = await openPage()
    await user.selectOptions(screen.getByLabelText('Status von Paul Linde'), 'bestellt')
    await waitFor(async () =>
      expect((await repo.listGiftRecipients()).find((r) => r.id === 'gr-5')?.status).toBe('bestellt'),
    )
  })

  it('setzt den Status für mehrere Ausgewählte auf einmal', async () => {
    const user = userEvent.setup()
    const { repo } = await openPage()
    await user.click(screen.getByLabelText('Paul Linde auswählen'))
    await user.click(screen.getByLabelText('Tilo Brenner auswählen'))
    await user.selectOptions(screen.getByLabelText('Neuer Status für die Auswahl'), 'versandt')
    await user.click(screen.getByRole('button', { name: 'Übernehmen' }))
    await waitFor(async () => {
      const all = await repo.listGiftRecipients()
      expect(all.filter((r) => r.id === 'gr-3' || r.id === 'gr-5').map((r) => r.status)).toEqual([
        'versandt',
        'versandt',
      ])
    })
  })
})

describe('Geschenke — Empfänger anlegen', () => {
  it('startet mit den C-Level-Absendern und legt die Zeile an', async () => {
    const user = userEvent.setup()
    const { repo } = await openPage()
    await user.click(screen.getByRole('button', { name: 'Empfänger' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neuer Empfänger' })
    // Jonas und Mira sind C-Level → vorbelegt.
    expect(within(dialog).getByRole('button', { name: 'Jonas als Absender entfernen' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Mira als Absender entfernen' })).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Vorname'), 'Greta')
    await user.type(within(dialog).getByLabelText('Nachname'), 'Probe')
    await user.type(within(dialog).getByLabelText('Firma'), 'Probe AG')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(async () => {
      const created = (await repo.listGiftRecipients()).find((r) => r.lastName === 'Probe')
      expect(created).toMatchObject({ occasionId: 'go-2026', company: 'Probe AG' })
      expect([...(created?.senderIds ?? [])].sort()).toEqual(['gs-jonas', 'gs-mira'])
    })
  })

  it('verlangt Name oder Firma', async () => {
    const user = userEvent.setup()
    await openPage()
    await user.click(screen.getByRole('button', { name: 'Empfänger' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neuer Empfänger' })
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })

  it('verknüpft einen Kontakt über die Suche und übernimmt Name und Firma', async () => {
    const user = userEvent.setup()
    await openPage()
    await user.click(screen.getByRole('button', { name: 'Empfänger' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neuer Empfänger' })
    await user.type(within(dialog).getByLabelText('Kontakt suchen'), 'Julia')
    await user.click(await within(dialog).findByRole('button', { name: /Julia/ }))
    expect(within(dialog).getByText(/Verknüpft mit/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Nachname')).not.toHaveValue('')
  })
})

describe('Geschenke — Geburtstage', () => {
  it('listet anstehende Geburtstage und plant ein Geschenk mit verknüpftem Kontakt', async () => {
    // Nur das Datum festhalten, Timer bleiben echt (userEvent, waitFor). Anke
    // Richter hat im Demo am 3. Juli Geburtstag — am 28. Juni also in fünf Tagen.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 5, 28, 9, 0))
    try {
      const user = userEvent.setup()
      const { repo } = renderPage(<GiftsPage />, { route: '/gifts?anlass=geburtstage', as: 'sub_admin' })

      const row = (await screen.findByText('in 5 Tagen')).closest('li')!
      expect(within(row).getByText('Anke Richter')).toBeInTheDocument()
      await user.click(within(row).getByRole('button', { name: /Geschenk planen/ }))
      const dialog = await screen.findByRole('dialog', { name: 'Neuer Empfänger' })
      expect(within(dialog).getByText(/Verknüpft mit/)).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

      await waitFor(async () => {
        const birthday = (await repo.listGiftOccasions()).find((o) => o.kind === 'geburtstag')
        expect(birthday).toBeDefined()
        const gift = (await repo.listGiftRecipients()).find(
          (r) => r.contactId === 'c-anke' && r.occasionId === birthday?.id,
        )
        expect(gift).toBeDefined()
      })
      // Danach steht statt des Knopfs der Status in der Zeile.
      await waitFor(() => expect(within(row).queryByRole('button', { name: /Geschenk planen/ })).toBeNull())
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Kontaktkarte „Geschenke"', () => {
  it('zeigt die Historie eines verknüpften Kontakts, neueste zuerst', async () => {
    renderPage(<GeschenkeCard contact={{ id: 'c-anke' } as never} />, { as: 'sub_admin' })
    expect(await screen.findByText('Geschenke')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items[0]).toMatch(/Schokolade.*Weihnachten 2026\/27.*zugestellt 05\.12\..*von Jonas, Tim/)
    expect(items[1]).toMatch(/Geschenkbox.*Weihnachten 2025\/26/)
  })

  it('erscheint nicht, wenn es keine Geschenke gibt', async () => {
    const { container } = renderPage(<GeschenkeCard contact={{ id: 'c-peter' } as never} />, { as: 'sub_admin' })
    await new Promise((r) => setTimeout(r, 50))
    expect(container.textContent).not.toMatch(/Geschenke/)
  })
})

describe('Import einer Liste', () => {
  // Struktur wie das echte Sheet, erfundene Namen. „Anke Richter" ist ein
  // Demo-Kontakt und soll automatisch verknüpft werden.
  const PASTE = [
    ['Vorname', 'Nachname', 'All', 'Street', 'PLZ', 'City', 'Country Code', 'EP Ansprechpartner', 'Geschenk'],
    ['Anke', 'Richter', 'Deutsche Telekom', 'Allee 1', '53113', 'Bonn', 'DE', 'Jonas / Neu Person', 'Geschenkbox'],
    ['Ole', 'Import', 'Import GmbH', 'Weg 2', '10115', 'Berlin', 'DE', 'Jonas', 'Geschenkbox'],
    ['in 2024/25', '', '', '', '', '', '', '', ''],
    ['Weber Consulting', 'Anna', 'Weber', 'Parkweg 2', '60311', 'Frankfurt', 'DE', 'Mira', 'Schokolade'],
    ['Hofmann IT', 'Ben', 'Hofmann', 'Lindenstraße 9', '70173', 'Stuttgart', 'DE', 'Mira / Jonas', 'Schokolade'],
    ['2 x Schoki in 2026/27', '', '', '', '', '', '', '', ''],
  ]
    .map((r) => r.join('\t'))
    .join('\n')

  it('erkennt die Listen, ordnet Absender zu und legt alles an', async () => {
    const user = userEvent.setup()
    const { repo } = renderPage(<GiftImportPage />, { route: '/gifts/import', as: 'sub_admin' })
    const area = await screen.findByLabelText('Eingefügte Liste')
    await user.click(area)
    await user.paste(PASTE)

    expect(await screen.findByText(/Liste 1/)).toBeInTheDocument()
    expect(screen.getByText(/Liste 2/)).toBeInTheDocument()
    // Absender: Jonas und Mira gibt es schon, „Neu Person" wird neu angelegt.
    expect(screen.getByLabelText('Zuordnung für Jonas')).toHaveValue('gs-jonas')
    expect(screen.getByLabelText('Zuordnung für Neu Person')).toHaveValue('new')
    expect(screen.getByText(/Gleichnamige Kontakte verknüpfen \(1 Treffer\)/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Import starten' }))
    expect(await screen.findByText('4 Empfänger importiert')).toBeInTheDocument()

    const occasions = await repo.listGiftOccasions()
    const past = occasions.find((o) => o.name === 'Weihnachten 2024/25')
    expect(past).toBeDefined()
    const all = await repo.listGiftRecipients()
    const anke = all.find((r) => r.occasionId === past?.id && r.lastName === 'Richter')
    // Vorjahr → zugestellt; gleichnamiger Kontakt verknüpft; zwei Absender.
    expect(anke).toMatchObject({ status: 'zugestellt', contactId: 'c-anke' })
    expect(anke?.senderIds).toHaveLength(2)
    // Die Liste ohne Kopfzeile landet im bestehenden Anlass 2026/27 mit neuem Produkt.
    const weber = all.find((r) => r.lastName === 'Weber')
    expect(weber?.occasionId).toBe('go-2026')
    expect(weber?.status).toBe('geplant')
    const product = (await repo.listGiftProducts()).find((p) => p.id === weber?.productId)
    expect(product?.name).toBe('Schokolade')
    expect((await repo.listGiftSenders()).some((s) => s.name === 'Neu Person')).toBe(true)
  })
})
