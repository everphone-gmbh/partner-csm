import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Die App wird auf GitHub Pages unter einem Unterpfad ausgeliefert
 * (/partner-csm/). Absolute Pfade wie '/sw.js' oder start_url '/' zeigen dort
 * auf die Domain-Wurzel und laufen ins Leere — der Service Worker wurde so
 * monatelang still nie registriert (register().catch(() => {})). Dieser Test
 * hält die PWA-Pfade relativ bzw. an BASE_URL gebunden.
 * Pfade relativ zum Projektstamm — Vitest läuft von dort.
 */
describe('PWA-Pfade folgen dem Unterpfad (GitHub Pages)', () => {
  it('manifest nutzt relative start_url, scope und Icon-Pfade', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
      start_url: string
      scope: string
      icons: { src: string }[]
    }
    expect(manifest.start_url).toBe('./')
    expect(manifest.scope).toBe('./')
    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(false)
    }
  })

  it('Service Worker wird unter BASE_URL registriert, nicht unter /sw.js', () => {
    const main = readFileSync('src/main.tsx', 'utf8')
    expect(main).toContain('serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)')
    expect(main).not.toMatch(/register\(['"]\/sw\.js['"]\)/)
  })

  it('Offline-Fallback des Workers hängt am Scope, nicht an "/"', () => {
    const sw = readFileSync('public/sw.js', 'utf8')
    expect(sw).toContain('caches.match(self.registration.scope)')
    expect(sw).not.toMatch(/caches\.match\(['"]\/['"]\)/)
  })
})
