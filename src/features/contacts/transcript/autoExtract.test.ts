import { describe, it, expect } from 'vitest'
import { transcribeViaServer } from './autoExtract'

describe('transcribeViaServer — Größen-Sperre', () => {
  it('lehnt zu große Aufnahmen mit lesbarer Meldung ab, ohne den Server zu rufen', async () => {
    // Größer als das 15-MB-Limit — der Worker (150 MB Speicher) würde an so
    // einer Aufnahme sterben und der Browser nur „Failed to fetch" zeigen.
    // Die Sperre sitzt bewusst VOR jedem Netz-/Session-Zugriff.
    const big = new Blob([new ArrayBuffer(16 * 1024 * 1024)], { type: 'audio/webm' })
    const r = await transcribeViaServer(big)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/zu groß/)
    expect(r.notConfigured).toBeUndefined()
  })
})
