import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

/** Kleinstes Formular: „dirty“, sobald etwas im Feld steht. */
function Editor({ onSave }: { onSave: () => Promise<boolean | void> }) {
  const [value, setValue] = useState('')
  const { dialog } = useUnsavedChangesGuard({
    isDirty: value !== '',
    onSave,
    canSave: value !== 'ungültig',
  })
  return (
    <>
      <input aria-label="Feld" value={value} onChange={(e) => setValue(e.target.value)} />
      <Link to="/weg">Weg</Link>
      {dialog}
    </>
  )
}

function renderEditor(onSave: () => Promise<boolean | void> = async () => {}) {
  // useBlocker verlangt den Daten-Router — wie App.tsx (createBrowserRouter).
  const router = createMemoryRouter(
    [
      { path: '/', element: <Editor onSave={onSave} /> },
      { path: '/weg', element: <p>Angekommen</p> },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

/** Simuliert Tab schließen / neu laden; true = der Browser würde warnen. */
function browserWouldWarn(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useUnsavedChangesGuard — Browser-Warnung', () => {
  it('registriert beforeunload nur, solange Änderungen ungespeichert sind', async () => {
    renderEditor()
    const user = userEvent.setup()
    expect(browserWouldWarn()).toBe(false)

    await user.type(screen.getByLabelText('Feld'), 'x')
    expect(browserWouldWarn()).toBe(true)

    await user.clear(screen.getByLabelText('Feld'))
    expect(browserWouldWarn()).toBe(false)
  })
})

describe('useUnsavedChangesGuard — Navigation in der App', () => {
  it('lässt ohne Änderungen sofort durch', async () => {
    renderEditor()
    await userEvent.setup().click(screen.getByRole('link', { name: 'Weg' }))
    expect(await screen.findByText('Angekommen')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('hält an, fokussiert „Zurück“ und bleibt bei „Zurück“ mit Eingabe stehen', async () => {
    const router = renderEditor()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Feld'), 'Entwurf')

    await user.click(screen.getByRole('link', { name: 'Weg' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ungespeicherte Änderungen' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Zurück' })).toHaveFocus()
    expect(router.state.location.pathname).toBe('/')

    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByLabelText('Feld')).toHaveValue('Entwurf')
  })

  it('Escape heißt Zurück', async () => {
    const router = renderEditor()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Feld'), 'Entwurf')
    await user.click(screen.getByRole('link', { name: 'Weg' }))
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(router.state.location.pathname).toBe('/')
  })

  it('„Verwerfen“ setzt die Navigation fort', async () => {
    renderEditor()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Feld'), 'Entwurf')
    await user.click(screen.getByRole('link', { name: 'Weg' }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Verwerfen' }))
    expect(await screen.findByText('Angekommen')).toBeInTheDocument()
  })

  it('„Speichern“ ruft onSave und navigiert danach', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderEditor(onSave)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Feld'), 'Entwurf')
    await user.click(screen.getByRole('link', { name: 'Weg' }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByText('Angekommen')).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('bleibt stehen, wenn das Speichern scheitert oder abgelehnt wird', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('kaputt'))
    const router = renderEditor(failing)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Feld'), 'Entwurf')
    await user.click(screen.getByRole('link', { name: 'Weg' }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(failing).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByLabelText('Feld')).toHaveValue('Entwurf')
  })

  it('sperrt „Speichern“, wenn das Formular nicht speicherbar ist', async () => {
    renderEditor()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Feld'), 'ungültig')
    await user.click(screen.getByRole('link', { name: 'Weg' }))
    await screen.findByRole('dialog')

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Verwerfen' })).toBeEnabled()
  })
})
