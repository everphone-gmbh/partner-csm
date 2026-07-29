import { activeBackend } from '@/data/repositoryProvider'

/**
 * Ablage für Bilder und Sprachmemos.
 *
 * Gespeichert wird in der Datenbank nur eine REFERENZ, keine Bilddaten:
 *   `storage:<bucket>/<pfad>`  → Supabase Storage (Produktion)
 *   `data:…`                   → Data-URL (Demo-Modus, und Altbestand)
 *
 * Dass `resolve()` beide Formen versteht, ist Absicht: schon gespeicherte
 * Data-URLs bleiben ohne Datenmigration nutzbar.
 */

export type StorageBucket = 'contact-avatars' | 'contact-gallery' | 'event-note-media'

const REF_PREFIX = 'storage:'

/** Signierte Links laufen ab; etwas früher erneuern als der Server verfällt. */
const SIGNED_TTL_SECONDS = 60 * 60
const CACHE_TTL_MS = 55 * 60 * 1000

export function isStorageRef(value: string): boolean {
  return value.startsWith(REF_PREFIX)
}

export function buildStorageRef(bucket: StorageBucket, path: string): string {
  return `${REF_PREFIX}${bucket}/${path}`
}

/** Zerlegt `storage:<bucket>/<pfad>`; undefined, wenn es keine Referenz ist. */
export function parseStorageRef(
  ref: string,
): { bucket: StorageBucket; path: string } | undefined {
  if (!isStorageRef(ref)) return undefined
  const rest = ref.slice(REF_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return undefined
  return { bucket: rest.slice(0, slash) as StorageBucket, path: rest.slice(slash + 1) }
}

/** Dateiendung aus dem MIME-Typ; konservativ, damit nichts Exotisches entsteht. */
export function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
  }
  return map[mimeType.toLowerCase()] ?? 'bin'
}

export interface FileStore {
  /**
   * Legt eine Datei ab und gibt die zu speichernde Referenz zurück.
   * `folder` bestimmt den Zugriff (siehe Migration 0020): bei Kontaktbildern
   * MUSS es die Kontakt-ID sein, sonst greift die Policy nicht.
   */
  upload(bucket: StorageBucket, folder: string, file: Blob): Promise<string>
  /** Anzeigbare URL zu einer Referenz (oder die Eingabe, wenn schon eine URL). */
  resolve(ref: string): Promise<string | undefined>
  /** Best effort: löscht die Datei hinter einer Referenz. */
  remove(ref: string): Promise<void>
  /** Alle Dateien eines Kontakts entfernen (Recht auf Vergessenwerden). */
  removeContactFiles(contactId: string): Promise<void>
}

// Aufgelöste signierte Links zwischenspeichern — sonst erzeugt jede
// Listendarstellung pro Bild einen neuen Aufruf.
const urlCache = new Map<string, { url: string; expiresAt: number }>()

/** Nur für Tests: Cache leeren. */
export function clearFileUrlCache(): void {
  urlCache.clear()
}

class SupabaseFileStore implements FileStore {
  private async client() {
    const { supabase } = await import('@/lib/supabase')
    if (!supabase) throw new Error('Storage nicht konfiguriert')
    return supabase
  }

  async upload(bucket: StorageBucket, folder: string, file: Blob): Promise<string> {
    const client = await this.client()
    const ext = extensionFor(file.type || 'application/octet-stream')
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error } = await client.storage.from(bucket).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    })
    if (error) throw new Error(error.message)
    return buildStorageRef(bucket, path)
  }

  async resolve(ref: string): Promise<string | undefined> {
    if (!ref) return undefined
    const parsed = parseStorageRef(ref)
    // Data-URL oder externer Link: unverändert durchlassen.
    if (!parsed) return ref

    const cached = urlCache.get(ref)
    if (cached && cached.expiresAt > Date.now()) return cached.url

    const client = await this.client()
    const { data, error } = await client.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, SIGNED_TTL_SECONDS)
    // Kein Zugriff (Policy) oder Datei fehlt: kein Link, kein Absturz —
    // die Komponenten fallen dann auf Initialen bzw. Platzhalter zurück.
    if (error || !data?.signedUrl) return undefined
    urlCache.set(ref, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS })
    return data.signedUrl
  }

  async remove(ref: string): Promise<void> {
    const parsed = parseStorageRef(ref)
    if (!parsed) return
    const client = await this.client()
    await client.storage.from(parsed.bucket).remove([parsed.path])
    urlCache.delete(ref)
  }

  async removeContactFiles(contactId: string): Promise<void> {
    const client = await this.client()
    for (const bucket of ['contact-avatars', 'contact-gallery'] as StorageBucket[]) {
      const { data } = await client.storage.from(bucket).list(contactId)
      const paths = (data ?? []).map((entry) => `${contactId}/${entry.name}`)
      if (paths.length > 0) await client.storage.from(bucket).remove(paths)
    }
  }
}

/** Demo-Modus: Data-URLs wie bisher, damit die App ohne Backend läuft. */
class DataUrlFileStore implements FileStore {
  async upload(_bucket: StorageBucket, _folder: string, file: Blob): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
      reader.readAsDataURL(file)
    })
  }
  async resolve(ref: string): Promise<string | undefined> {
    return ref || undefined
  }
  async remove(): Promise<void> {}
  async removeContactFiles(): Promise<void> {}
}

export const fileStore: FileStore =
  activeBackend === 'supabase' ? new SupabaseFileStore() : new DataUrlFileStore()
