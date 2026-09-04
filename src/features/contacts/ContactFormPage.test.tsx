import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'

// Muss vor den Importen stehen (vi.mock wird hochgezogen): die Seite bekommt ein
// eigenes Repository je Testfall und eine Sitzung mit gesetzter Rolle.
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))
vi.mock('@/app/SessionContext', () => import('@/test/pageHarness'))

import { currentLocation, renderPage } from '@/test/pageHarness'
import { ContactFormPage } from './ContactFormPage'

// Echt über die Routen rendern: die Seite liest :id für den Bearbeiten-Modus,
// und die Nachbarseiten belegen, wohin navigiert wurde.
function renderForm(route: string) {
  return renderPage(
    <Routes>
      <Route path="/contacts" element={<p>Kontaktliste</p>} />
      <Route path="/contacts/new" element={<ContactFormPage />} />
      <Route path="/contacts/:id" element={<p>Kontaktkarte</p>} />
      <Route path="/contacts/:id/edit" element={<ContactFormPage />} />
    </Routes>,
    { route },
  )
}

describe('ContactFormPage — Firma und Telefon im Abschnitt Basis', () => {
  it('legt einen Kontakt mit Firma, Telefon (dienstlich) und Mobil an', async () => {
    const { repo } = renderForm('/contacts/new')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Name *'), 'Max Muster')
    await user.type(screen.getByLabelText('Firma'), 'Vodafone')
    await user.type(screen.getByLabelText('Telefon (dienstlich)'), '+49 30 111')
    await user.type(screen.getByLabelText('Mobil (dienstlich)'), '+49 170 222')
    await user.click(screen.getByRole('button', { name: 'Kontakt anlegen' }))

    expect(await screen.findByText('Kontaktkarte')).toBeInTheDocument()
    const created = (await repo.listContacts()).find((c) => c.fullName === 'Max Muster')
    expect(created).toBeDefined()
    expect(created?.company).toBe('Vodafone')
    expect(created?.phoneWork).toBe('+49 30 111')
    expect(created?.phoneMobile).toBe('+49 170 222')
    expect(currentLocation()).toBe(`/contacts/${created?.id}`)
  })

  it('zeigt Firma und Telefon beim Bearbeiten vorbelegt und speichert Änderungen', async () => {
    const { repo } = renderForm('/contacts/c-anke/edit')
    const user = userEvent.setup()

    // Die Felder erscheinen einen Tick vor dem Effekt, der sie aus dem Kontakt
    // befüllt — deshalb auf den Wert warten, nicht nur auf das Feld.
    const company = await screen.findByLabelText('Firma')
    await waitFor(() => expect(company).toHaveValue('Deutsche Telekom'))
    expect(screen.getByLabelText('Team')).toHaveValue('Partner Management')

    await user.type(screen.getByLabelText('Telefon (dienstlich)'), '+49 40 555')
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

    expect(await screen.findByText('Kontaktkarte')).toBeInTheDocument()
    const saved = await repo.getContact('c-anke')
    expect(saved?.phoneWork).toBe('+49 40 555')
    expect(saved?.company).toBe('Deutsche Telekom')
    expect(currentLocation()).toBe('/contacts/c-anke')
  })

  it('schlägt Team und Firma aus Kontakten und Soll-Struktur vor', async () => {
    renderForm('/contacts/new')

    const team = await screen.findByLabelText('Team')
    const teamList = document.getElementById(team.getAttribute('list') ?? '')
    expect(teamList?.tagName).toBe('DATALIST')
    await waitFor(() => {
      const options = [...(teamList?.querySelectorAll('option') ?? [])].map((o) => o.value)
      // Soll-Struktur im Format des Team-Felds + Freitext der Kontakte, sortiert.
      expect(options).toEqual([
        'Einkauf Konzern',
        'Einkauf Konzern / Mobilfunk',
        'Partner Management',
        'Sales Leadership',
      ])
    })

    const company = screen.getByLabelText('Firma')
    const companyList = document.getElementById(company.getAttribute('list') ?? '')
    const companies = [...(companyList?.querySelectorAll('option') ?? [])].map((o) => o.value)
    expect(companies).toEqual(['Deutsche Telekom', 'Lenovo', 'Samsung'])
  })
})

describe('ContactFormPage — Speichern & weiteren anlegen', () => {
  it('speichert, meldet den Erfolg, leert das Formular und behält Region + RM', async () => {
    const { repo } = renderForm('/contacts/new')
    const user = userEvent.setup()

    await user.selectOptions(await screen.findByLabelText('Region'), 'r-sued')
    await user.selectOptions(screen.getByLabelText('Relationship Manager'), 'u-olaf')
    await user.type(screen.getByLabelText('Name *'), 'Erste Person')
    await user.type(screen.getByLabelText('Firma'), 'Vodafone')
    await user.click(screen.getByRole('button', { name: 'Speichern & weiteren anlegen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Kontakt „Erste Person“ angelegt.')
    expect(currentLocation()).toBe('/contacts/new')
    expect(screen.getByLabelText('Name *')).toHaveValue('')
    expect(screen.getByLabelText('Firma')).toHaveValue('')
    expect(screen.getByLabelText('Region')).toHaveValue('r-sued')
    expect(screen.getByLabelText('Relationship Manager')).toHaveValue('u-olaf')
    expect(screen.getByLabelText('Name *')).toHaveFocus()

    const created = (await repo.listContacts()).find((c) => c.fullName === 'Erste Person')
    expect(created?.regionId).toBe('r-sued')
    expect(created?.company).toBe('Vodafone')
  })

  it('gibt es im Bearbeiten-Modus nicht', async () => {
    renderForm('/contacts/c-anke/edit')
    await screen.findByLabelText('Firma')
    expect(screen.queryByRole('button', { name: 'Speichern & weiteren anlegen' })).toBeNull()
  })
})

describe('ContactFormPage — ungespeicherte Änderungen', () => {
  const cancelLink = () => screen.getAllByRole('link', { name: /Abbrechen/ })[0]

  it('fragt beim Abbrechen mit Eingaben nach; „Zurück“ bleibt, „Verwerfen“ geht', async () => {
    renderForm('/contacts/new')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Name *'), 'Ungespeichert')

    await user.click(cancelLink())
    const dialog = await screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' })
    expect(currentLocation()).toBe('/contacts/new')

    await user.click(within(dialog).getByRole('button', { name: 'Zurück' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Name *')).toHaveValue('Ungespeichert')

    await user.click(cancelLink())
    const again = await screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' })
    await user.click(within(again).getByRole('button', { name: 'Verwerfen' }))
    expect(await screen.findByText('Kontaktliste')).toBeInTheDocument()
    expect(currentLocation()).toBe('/contacts')
  })

  it('speichert aus der Rückfrage heraus und geht dann weiter', async () => {
    const { repo } = renderForm('/contacts/new')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Name *'), 'Aus dem Dialog')

    await user.click(cancelLink())
    const dialog = await screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' })
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText('Kontaktliste')).toBeInTheDocument()
    expect((await repo.listContacts()).some((c) => c.fullName === 'Aus dem Dialog')).toBe(true)
  })

  it('lässt ohne Änderungen durch und fragt nach dem Speichern nicht mehr', async () => {
    renderForm('/contacts/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Name *')

    await user.click(cancelLink())
    expect(await screen.findByText('Kontaktliste')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('fragt nach dem erfolgreichen Speichern nicht noch einmal nach', async () => {
    renderForm('/contacts/new')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Name *'), 'Gespeichert')

    await user.click(screen.getByRole('button', { name: 'Kontakt anlegen' }))
    expect(await screen.findByText('Kontaktkarte')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
