import { describe, expect, it } from 'vitest'
import {
  buildStorageRef,
  extensionFor,
  isStorageRef,
  parseStorageRef,
} from './fileStore'

describe('Referenz-Format', () => {
  it('baut und zerlegt eine Referenz verlustfrei', () => {
    const ref = buildStorageRef('contact-gallery', 'c-1/abc.jpg')
    expect(ref).toBe('storage:contact-gallery/c-1/abc.jpg')
    expect(parseStorageRef(ref)).toEqual({ bucket: 'contact-gallery', path: 'c-1/abc.jpg' })
  })

  it('erkennt Data-URLs und externe Links NICHT als Referenz', () => {
    // Wichtig für den Altbestand: schon gespeicherte Data-URLs müssen
    // unverändert durchgelassen werden.
    expect(isStorageRef('data:image/png;base64,AAA')).toBe(false)
    expect(parseStorageRef('data:image/png;base64,AAA')).toBeUndefined()
    expect(parseStorageRef('https://example.com/bild.jpg')).toBeUndefined()
  })

  it('weist unvollständige Referenzen ab', () => {
    expect(parseStorageRef('storage:')).toBeUndefined()
    expect(parseStorageRef('storage:nurbucket')).toBeUndefined()
    expect(parseStorageRef('storage:/pfad')).toBeUndefined()
    expect(parseStorageRef('storage:bucket/')).toBeUndefined()
  })

  it('behält Pfade mit mehreren Ebenen bei', () => {
    expect(parseStorageRef('storage:event-note-media/a/b/c.webm')).toEqual({
      bucket: 'event-note-media',
      path: 'a/b/c.webm',
    })
  })
})

describe('extensionFor', () => {
  it('bildet gängige Bild- und Audioformate ab', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/webp')).toBe('webp')
    expect(extensionFor('audio/webm')).toBe('webm')
    expect(extensionFor('audio/mpeg')).toBe('mp3')
  })

  it('ist unabhängig von der Groß-/Kleinschreibung', () => {
    expect(extensionFor('IMAGE/JPEG')).toBe('jpg')
  })

  it('fällt bei Unbekanntem auf .bin zurück statt zu raten', () => {
    expect(extensionFor('application/x-irgendwas')).toBe('bin')
    expect(extensionFor('')).toBe('bin')
  })
})
