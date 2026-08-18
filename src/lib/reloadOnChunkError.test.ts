import { describe, it, expect, vi, beforeEach } from 'vitest'
import { installChunkReloadHandler } from './reloadOnChunkError'

describe('installChunkReloadHandler', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('lädt beim ersten Chunk-Fehler neu, verhindert aber Reload-Schleifen', () => {
    const reload = vi.fn()
    installChunkReloadHandler(reload)

    const first = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(first)
    expect(reload).toHaveBeenCalledTimes(1)
    // preventDefault: der Fehler soll nicht zusätzlich die ErrorBoundary treffen.
    expect(first.defaultPrevented).toBe(true)

    // Zweiter Fehler kurz danach (Neuladen hat nicht geholfen, z. B. offline):
    // kein weiterer Reload, der Fehler läuft normal weiter zur ErrorBoundary.
    const second = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(second)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(second.defaultPrevented).toBe(false)
  })
})
