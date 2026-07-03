import { describe, it, expect } from 'vitest'
import { safeHttpsUrl, safeLinkedInUrl } from './urls'

describe('safeHttpsUrl', () => {
  it('accepts https URLs and trims whitespace', () => {
    expect(safeHttpsUrl(' https://example.com/x ')).toBe('https://example.com/x')
  })
  it('rejects javascript:, data: and http: schemes', () => {
    expect(safeHttpsUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeHttpsUrl('data:text/html,<script>1</script>')).toBeUndefined()
    expect(safeHttpsUrl('http://example.com')).toBeUndefined()
  })
  it('rejects non-URLs and empties', () => {
    expect(safeHttpsUrl('kein link')).toBeUndefined()
    expect(safeHttpsUrl('')).toBeUndefined()
    expect(safeHttpsUrl(undefined)).toBeUndefined()
  })
})

describe('safeLinkedInUrl', () => {
  it('accepts linkedin.com and its subdomains over https', () => {
    expect(safeLinkedInUrl('https://www.linkedin.com/in/anke')).toBe(
      'https://www.linkedin.com/in/anke',
    )
    expect(safeLinkedInUrl('https://linkedin.com/in/anke')).toBe('https://linkedin.com/in/anke')
    expect(safeLinkedInUrl('https://de.linkedin.com/in/anke')).toBe(
      'https://de.linkedin.com/in/anke',
    )
  })
  it('rejects other hosts, lookalikes, and unsafe schemes', () => {
    expect(safeLinkedInUrl('https://evil.com/in/anke')).toBeUndefined()
    expect(safeLinkedInUrl('https://linkedin.com.evil.com/in/anke')).toBeUndefined()
    expect(safeLinkedInUrl('javascript:alert(1)')).toBeUndefined()
  })
})
