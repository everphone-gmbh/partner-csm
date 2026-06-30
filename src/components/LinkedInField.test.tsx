import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LinkedInField } from './LinkedInField'

describe('LinkedInField tri-state', () => {
  it('shows "vorhanden" with a profile link when an account exists', () => {
    render(<LinkedInField info={{ status: 'has_account', url: 'https://linkedin.com/in/x' }} />)
    expect(screen.getByText('LinkedIn vorhanden')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Profil/i })).toBeInTheDocument()
  })

  it('shows "Kein LinkedIn-Account" with who confirmed it', () => {
    render(<LinkedInField info={{ status: 'no_account', verifiedByName: 'Olaf Gründel' }} />)
    expect(screen.getByText('Kein LinkedIn-Account')).toBeInTheDocument()
    expect(screen.getByText(/bestätigt von Olaf Gründel/)).toBeInTheDocument()
  })

  it('shows "Nicht geprüft" for the unknown state', () => {
    render(<LinkedInField info={{ status: 'unknown' }} />)
    expect(screen.getByText('Nicht geprüft')).toBeInTheDocument()
  })
})
