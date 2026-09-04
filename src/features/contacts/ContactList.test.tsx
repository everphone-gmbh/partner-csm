import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Muss vor den Importen stehen (vi.mock wird hochgezogen): die Seite bekommt ein
// eigenes Repository je Testfall und eine Sitzung mit gesetzter Rolle.
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { currentLocation, renderPage } from '@/test/pageHarness'
import { ContactList } from './ContactList'

describe('ContactList — Massenzuordnung', () => {
  it('hakt das Kästchen an, ohne zum Profil zu navigieren', async () => {
    // Regressionstest für einen echten Fehler: das Kästchen steckte im Link der
    // Kartenzeile, die Navigation wurde per preventDefault abgefangen — das
    // unterdrückte aber auch das native Umschalten. Die Leiste zählte richtig,
    // das Kästchen blieb optisch leer.
    renderPage(<ContactList />, { route: '/contacts' })

    const box = await screen.findByLabelText('Anke Richter auswählen')
    expect(box).not.toBeChecked()

    await userEvent.click(box)

    expect(box).toBeChecked()
    expect(currentLocation()).toBe('/contacts')
    expect(screen.getByText(/1 Kontakt ausgewählt/)).toBeInTheDocument()
  })

  it('setzt den Betreuer für die Auswahl und lässt die anderen unberührt', async () => {
    const { repo } = renderPage(<ContactList />, { route: '/contacts' })

    await userEvent.click(await screen.findByLabelText('Anke Richter auswählen'))
    await userEvent.click(screen.getByLabelText('Thomas Berger auswählen'))
    await userEvent.selectOptions(screen.getByLabelText(/Betreuer/), 'u-mehmet')
    await userEvent.click(screen.getByRole('button', { name: 'Zuordnen' }))

    await waitFor(async () => {
      const contacts = await repo.listContacts()
      const byName = (name: string) => contacts.find((c) => c.fullName === name)
      expect(byName('Anke Richter')?.relationshipManagerId).toBe('u-mehmet')
      expect(byName('Thomas Berger')?.relationshipManagerId).toBe('u-mehmet')
      // Nicht ausgewählt: darf sich nicht geändert haben.
      expect(byName('Julia Hoffmann')?.relationshipManagerId).not.toBe('u-mehmet')
    })
  })

  it('lässt die übrigen Felder beim Zuordnen unangetastet', async () => {
    // Die Oberflächen-Seite des upsert-Fallstricks: eine Massenzuordnung darf
    // Position, Firma und Notiz nicht mitschreiben.
    const { repo } = renderPage(<ContactList />, { route: '/contacts' })
    const vorher = (await repo.listContacts()).find((c) => c.fullName === 'Anke Richter')

    await userEvent.click(await screen.findByLabelText('Anke Richter auswählen'))
    await userEvent.selectOptions(screen.getByLabelText(/Betreuer/), 'u-mehmet')
    await userEvent.click(screen.getByRole('button', { name: 'Zuordnen' }))

    await waitFor(async () => {
      const nachher = (await repo.listContacts()).find((c) => c.fullName === 'Anke Richter')
      expect(nachher?.relationshipManagerId).toBe('u-mehmet')
      expect(nachher?.position).toBe(vorher?.position)
      expect(nachher?.company).toBe(vorher?.company)
      expect(nachher?.freeText).toBe(vorher?.freeText)
      expect(nachher?.email).toBe(vorher?.email)
    })
  })

  it('kennzeichnet die Platzhalter-Region und zählt sie als unzugeordnet', async () => {
    renderPage(<ContactList />, { route: '/contacts' })

    // Die Beispieldaten haben keine Lücken — erst eine erzeugen.
    expect(
      await screen.findByRole('button', { name: /Nur unzugeordnete \(0\)/ }),
    ).toBeInTheDocument()

    await userEvent.click(await screen.findByLabelText('Anke Richter auswählen'))
    await userEvent.selectOptions(screen.getByLabelText(/^Region/), 'r-unbekannt')
    await userEvent.click(screen.getByRole('button', { name: 'Zuordnen' }))

    const chip = await screen.findByRole('button', { name: /Nur unzugeordnete \(1\)/ })
    await userEvent.click(chip)
    expect(await screen.findByText(/1 von 8 Kontakten/)).toBeInTheDocument()

    // Gezielt in der Zeile prüfen: „Unbekannt (Platzhalter)" steht bewusst auch
    // im Filter-Chip und in der Auswahlliste, ein globales getByText wäre
    // mehrdeutig.
    const zeile = screen.getByRole('link', { name: /Anke Richter/ })
    expect(zeile).toHaveTextContent('Unbekannt (Platzhalter)')
    expect(zeile).toHaveTextContent('Region fehlt')
  })

  it('wählt mit einem Klick alle sichtbaren Kontakte', async () => {
    renderPage(<ContactList />, { route: '/contacts' })

    await userEvent.click(await screen.findByRole('button', { name: 'Alle 8 sichtbaren wählen' }))

    expect(screen.getByText(/8 Kontakte ausgewählt/)).toBeInTheDocument()
    expect(await screen.findByLabelText('Anke Richter auswählen')).toBeChecked()
  })

  it('zeigt Account Managern keine Massenzuordnung', async () => {
    // Die Oberfläche verbirgt sie; verbindlich ist ohnehin die Rechteprüfung in
    // der Datenbank — die prüft dieses Gerüst NICHT (siehe pageHarness).
    renderPage(<ContactList />, { route: '/contacts', as: 'account_manager' })

    await screen.findByRole('heading', { name: 'Kontakte' })
    expect(screen.queryByRole('button', { name: /Nur unzugeordnete/ })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('ContactList — Filter über die Adresse (Region/Team)', () => {
  it('?region= filtert vor, zeigt einen Chip, und ✕ entfernt den Parameter', async () => {
    renderPage(<ContactList />, { route: '/contacts?region=r-nord' })

    // Anke Richter und Stefan Lang sitzen im Seed in Nord.
    expect(await screen.findByText(/2 von 8 Kontakten/)).toBeInTheDocument()
    const chip = screen.getByRole('button', { name: 'Filter „Region: Nord“ entfernen' })

    await userEvent.click(chip)
    expect(await screen.findByText(/8 von 8 Kontakten/)).toBeInTheDocument()
    expect(currentLocation()).toBe('/contacts')
  })

  it('der Regions-Knopf schreibt die Region in die Adresse', async () => {
    renderPage(<ContactList />, { route: '/contacts' })
    await screen.findByText(/8 von 8 Kontakten/)

    await userEvent.click(screen.getByRole('button', { name: 'Süd' }))
    await waitFor(() => expect(currentLocation()).toBe('/contacts?region=r-sued'))
    // Thomas Berger und Nicole Wagner.
    expect(screen.getByText(/2 von 8 Kontakten/)).toBeInTheDocument()
  })

  it('?team= filtert nach Team und zeigt das Team im Auswahlfeld', async () => {
    renderPage(<ContactList />, { route: '/contacts?team=Partner%20Management' })

    expect(await screen.findByText(/1 von 8 Kontakten/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Anke Richter/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter „Team: Partner Management“ entfernen' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Team/)).toHaveValue('Partner Management')
  })

  it('die Team-Auswahl schreibt das Team in die Adresse', async () => {
    renderPage(<ContactList />, { route: '/contacts' })
    await screen.findByText(/8 von 8 Kontakten/)

    await userEvent.selectOptions(screen.getByLabelText(/^Team/), 'Sales Leadership')
    await waitFor(() => expect(currentLocation()).toBe('/contacts?team=Sales+Leadership'))
    expect(screen.getByText(/1 von 8 Kontakten/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Julia Hoffmann/ })).toBeInTheDocument()
  })
})
