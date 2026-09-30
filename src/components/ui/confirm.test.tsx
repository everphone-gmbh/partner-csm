import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmProvider } from './confirm'
import { useConfirm } from './useConfirm'

function Harness() {
  const confirm = useConfirm()
  const [answer, setAnswer] = useState('offen')
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: 'Anke Richter endgültig löschen?',
            message: 'Das lässt sich nicht rückgängig machen.',
            confirmLabel: 'Endgültig löschen',
            cancelLabel: 'Behalten',
            tone: 'danger',
          })
          setAnswer(ok ? 'gelöscht' : 'behalten')
        }}
      >
        Löschen
      </button>
      <p>Antwort: {answer}</p>
    </>
  )
}

function renderHarness() {
  return render(
    <ConfirmProvider>
      <Harness />
    </ConfirmProvider>,
  )
}

describe('ConfirmProvider — Rückfrage im Stil der App statt window.confirm', () => {
  it('nennt die Handlung auf dem Knopf und sagt, was danach passiert', async () => {
    const user = userEvent.setup()
    renderHarness()
    await user.click(screen.getByRole('button', { name: 'Löschen' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Anke Richter endgültig löschen?' })
    expect(dialog).toHaveAccessibleDescription('Das lässt sich nicht rückgängig machen.')
    // Beim Löschen liegt der Fokus auf der sicheren Wahl.
    expect(screen.getByRole('button', { name: 'Behalten' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    expect(screen.getByText('Antwort: gelöscht')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('bricht mit „Behalten", Escape oder Klick daneben ab', async () => {
    const user = userEvent.setup()
    renderHarness()

    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    await user.click(screen.getByRole('button', { name: 'Behalten' }))
    expect(screen.getByText('Antwort: behalten')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('Antwort: behalten')).toBeInTheDocument()
  })
})
