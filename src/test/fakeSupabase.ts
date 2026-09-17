// Minimal in-memory stand-in for the Supabase client, covering exactly the
// PostgREST surface SupabaseRepository uses. Powers the repository contract
// tests so mock and Supabase implementations can't drift apart silently.

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string; code?: string } | null }

/**
 * Übersetzt ein SQL-LIKE-Muster in einen case-insensitiven RegExp:
 * `%` → beliebig viele Zeichen, `_` → ein Zeichen, `\%`/`\_`/`\\` → literal.
 * Alles andere wird regex-escaped.
 */
function likeToRegExp(pattern: string): RegExp {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\' && i + 1 < pattern.length) {
      out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (ch === '%') {
      out += '.*'
    } else if (ch === '_') {
      out += '.'
    } else {
      out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${out}$`, 'i')
}

export interface FakeSupabaseSeed {
  profiles?: Row[]
  regions?: Row[]
  everphone_accounts?: Row[]
  org_units?: Row[]
}

const TABLES = [
  'regions',
  'profiles',
  'contacts',
  'side_facts',
  'customers',
  'contact_customers',
  'contact_photos',
  'contact_links',
  'activities',
  'attachments',
  'events',
  'event_attendees',
  'event_notes',
  'event_guests',
  'reminders',
  'intro_requests',
  'everphone_accounts',
  'audit_log',
  'org_units',
  'favorites',
] as const

/**
 * Zusammengesetzte Primärschlüssel, die der Fake wie Postgres durchsetzt: ein
 * zweites INSERT auf dasselbe Paar liefert 23505 statt einer zweiten Zeile.
 * Ohne das prüfte die Contract-Suite die Idempotenz von addFavorite nur im
 * Mock — im Supabase-Zweig sähe der Adapter den Fehler nie (Fallstrick 4).
 */
const UNIQUE_KEYS: Record<string, string[]> = {
  favorites: ['profile_id', 'contact_id'],
}

/**
 * Lese-Views (Migration 0018) auf ihre Basistabelle abbilden.
 *
 * Der Fake kennt keine Rollen und bildet damit den PRIVILEGIERTEN Fall ab —
 * genau den prüft die Contract-Suite (gleiche Felder in beiden Backends). Dass
 * die Views für den Account-Manager-Tier Felder auf NULL setzen, ist Server-
 * verhalten und wird gegen die echte Datenbank verifiziert, nicht hier.
 */
const VIEW_SOURCE: Record<string, string> = {
  contact_cards: 'contacts',
  activity_cards: 'activities',
}

export function createFakeSupabase(seed: FakeSupabaseSeed = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(TABLES.map((t) => [t, []]))
  tables.profiles = (seed.profiles ?? []).map((r) => ({ ...r }))
  tables.regions = (seed.regions ?? []).map((r) => ({ ...r }))
  tables.everphone_accounts = (seed.everphone_accounts ?? []).map((r) => ({ ...r }))
  tables.org_units = (seed.org_units ?? []).map((r) => ({ ...r }))
  let seq = 1

  function withEmbeds(table: string, row: Row, select: string): Row {
    const out = { ...row }
    if (table === 'contacts') {
      if (select.includes('side_facts(')) {
        out.side_facts = tables.side_facts.filter((f) => f.contact_id === row.id).map((f) => ({ ...f }))
      }
      if (select.includes('contact_customers(')) {
        out.contact_customers = tables.contact_customers
          .filter((cc) => cc.contact_id === row.id)
          .map((cc) => ({
            with_us: cc.with_us,
            customers: tables.customers.find((c) => c.id === cc.customer_id) ?? null,
          }))
      }
      if (select.includes('contact_photos(')) {
        out.contact_photos = tables.contact_photos
          .filter((p) => p.contact_id === row.id)
          .map((p) => ({ ...p }))
      }
    }
    return out
  }

  function contactDefaults(row: Row): Row {
    return {
      photo_url: null,
      relationship_manager_id: null,
      company: null,
      team: null,
      email: null,
      birthday: null,
      location: null,
      family_status: null,
      children: null,
      pets: null,
      linkedin_status: 'unknown',
      linkedin_url: null,
      linkedin_verified_by: null,
      linkedin_verified_at: null,
      sentiment: 'neutral',
      sentiment_history: null,
      cadence_days: null,
      buying_role: null,
      active_devices: null,
      won_customers_count: 0,
      free_text: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
      ...row,
    }
  }

  /**
   * Nachbildung der Audit-Trigger aus Migration 0019: die App verlässt sich
   * darauf, dass Änderungen protokolliert werden, ohne sie selbst zu schreiben.
   * Ohne diese Nachbildung würde die Contract-Suite ein Verhalten prüfen, das
   * im Supabase-Zweig gar nicht entstehen kann.
   *
   * `at` ist für ALLE Einträge gleich — genau wie in Postgres, wo `now()` die
   * Transaktionszeit liefert und mehrere Änderungen eines Requests denselben
   * Stempel tragen. Damit muss die Sortierung über die laufende Nummer laufen,
   * und der Contract prüft den schwierigen Fall statt des bequemen.
   */
  const AUDIT_ENTITY: Record<string, string> = {
    contacts: 'contact',
    contact_photos: 'contact_photo',
    side_facts: 'side_fact',
  }
  let auditSeq = 1
  const AUDIT_AT = '2026-07-01T00:00:00.000Z'

  function writeAudit(table: string, action: 'insert' | 'update' | 'delete', row: Row, before?: Row) {
    const entity = AUDIT_ENTITY[table]
    if (!entity) return
    let detail: Row = {}
    if (action === 'update') {
      const fields = Object.keys(row)
        .filter((k) => k !== 'updated_at' && JSON.stringify(row[k]) !== JSON.stringify(before?.[k]))
        .sort()
      if (fields.length === 0) return // nur updated_at → kein Eintrag
      detail = { fields }
    }
    tables.audit_log.push({
      id: auditSeq++,
      at: AUDIT_AT,
      action,
      entity,
      entity_id: row.id ?? before?.id ?? null,
      actor_id: null,
      detail,
    })
  }

  /**
   * Datenbankfunktionen (PostgREST `rpc`). Bis Migration 0032 kam die App ohne
   * aus; seitdem geht das Kontaktfoto über `set_contact_photo`, weil es jede
   * Rolle pflegen darf, `contacts_update` aber bei RM+ bleibt. Ohne Nachbildung
   * prüfte der Supabase-Zweig der Contract-Suite den Adapter gar nicht mehr
   * (Fallstrick 4).
   */
  function callRpc(fn: string, args: Row): Result {
    if (fn !== 'set_contact_photo') {
      return { data: null, error: { message: `fakeSupabase: unknown function ${fn}` } }
    }
    const id = String(args.p_contact_id ?? '')
    const url = (args.p_photo_url ?? null) as string | null
    const row = tables.contacts.find((r) => r.id === id)
    // Nachbildung von can_see_contact(): der Fake kennt keine Rollen, und für
    // den Aufrufer sieht „nicht sichtbar" genauso aus wie „gibt es nicht" — die
    // Funktion wirft in beiden Fällen 42501.
    if (!row) {
      return { data: null, error: { message: 'Kein Zugriff auf diesen Kontakt', code: '42501' } }
    }
    // Pfadkonvention aus Fallstrick 3, in der Funktion als LIKE formuliert.
    if (url !== null && !url.startsWith(`storage:contact-avatars/${id}/`)) {
      return {
        data: null,
        error: { message: 'Ungültige Bildreferenz für diesen Kontakt', code: '22023' },
      }
    }
    const before = { ...row }
    row.photo_url = url
    // Der Audit-Trigger (0019) feuert auch in einer SECURITY-DEFINER-Funktion.
    writeAudit('contacts', 'update', { photo_url: url, id }, before)
    return { data: null, error: null } // returns void
  }

  class Builder implements PromiseLike<Result> {
    private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
    private selectCols = '*'
    private payload: Row | Row[] | null = null
    private eqFilters: [string, unknown][] = []
    private inFilters: [string, unknown[]][] = []
    private orFilters: [string, string][][] = []
    private ilikeFilters: [string, string][] = []
    private limitRows?: number
    private conflictCols: string[] = []
    private orderBys: { col: string; ascending: boolean; nullsFirst: boolean }[] = []
    private mode: 'many' | 'single' | 'maybeSingle' = 'many'
    private returning = false

    private table: string

    constructor(table: string) {
      // Views verhalten sich hier wie ihre Basistabelle (siehe VIEW_SOURCE).
      this.table = VIEW_SOURCE[table] ?? table
    }

    select(cols = '*') {
      if (this.op === 'select') this.selectCols = cols
      else {
        this.returning = true
        this.selectCols = cols
      }
      return this
    }
    insert(payload: Row | Row[]) {
      this.op = 'insert'
      this.payload = payload
      return this
    }
    update(payload: Row) {
      this.op = 'update'
      this.payload = payload
      return this
    }
    upsert(payload: Row, opts?: { onConflict?: string }) {
      this.op = 'upsert'
      this.payload = payload
      // Konfliktspalten wie bei PostgREST: "event_id,contact_id".
      this.conflictCols = opts?.onConflict
        ? opts.onConflict.split(',').map((c) => c.trim()).filter(Boolean)
        : []
      return this
    }
    delete() {
      this.op = 'delete'
      return this
    }
    eq(col: string, value: unknown) {
      this.eqFilters.push([col, value])
      return this
    }
    in(col: string, values: unknown[]) {
      this.inFilters.push([col, values])
      return this
    }
    /** `%`/`_` als Wildcards, `\` als Escape — wie PostgREST/SQL LIKE. */
    ilike(col: string, pattern: string) {
      this.ilikeFilters.push([col, pattern])
      return this
    }
    limit(n: number) {
      this.limitRows = n
      return this
    }
    /** Supports the PostgREST `or` syntax subset: "col.eq.value,col2.eq.value2". */
    or(expr: string) {
      const clauses = expr.split(',').map((part) => {
        const [col, op, ...rest] = part.split('.')
        if (op !== 'eq') throw new Error(`fakeSupabase: unsupported or-operator in "${part}"`)
        return [col, rest.join('.')] as [string, string]
      })
      this.orFilters.push(clauses)
      return this
    }
    /**
     * Mehrfach aufrufbar wie bei PostgREST: die Reihenfolge der Aufrufe ist die
     * Sortierpriorität. (Vorher überschrieb jeder Aufruf den vorigen — der
     * Adapter sortiert Reminder nach Datum UND Uhrzeit.)
     */
    order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
      this.orderBys.push({
        col,
        ascending: opts?.ascending !== false,
        // Postgres-Standard: NULLs zuletzt bei ASC.
        nullsFirst: opts?.nullsFirst ?? false,
      })
      return this
    }
    single() {
      this.mode = 'single'
      return this
    }
    maybeSingle() {
      this.mode = 'maybeSingle'
      return this
    }

    private matches(row: Row): boolean {
      return (
        this.eqFilters.every(([col, v]) => row[col] === v) &&
        this.inFilters.every(([col, vs]) => vs.includes(row[col])) &&
        this.orFilters.every((clauses) => clauses.some(([col, v]) => row[col] === v)) &&
        this.ilikeFilters.every(([col, pattern]) =>
          likeToRegExp(pattern).test(String(row[col] ?? '')),
        )
      )
    }

    private exec(): Result {
      const rows = tables[this.table]
      if (!rows) return { data: null, error: { message: `unknown table ${this.table}` } }

      if (this.op === 'insert' || this.op === 'upsert') {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
        // Primärschlüssel-Verletzung wie in Postgres: die ganze Anweisung
        // scheitert, keine Zeile wird geschrieben.
        const unique = this.op === 'insert' ? UNIQUE_KEYS[this.table] : undefined
        if (unique && items.some((item) => rows.some((r) => unique.every((c) => r[c] === item[c])))) {
          return {
            data: null,
            error: {
              message: `duplicate key value violates unique constraint "${this.table}_pkey"`,
              code: '23505',
            },
          }
        }
        const written = items.map((item) => {
          // Upsert mit Konfliktspalten: vorhandene Zeile ergänzen statt eine
          // zweite anzulegen — sonst prüft die Contract-Suite Upsert-Methoden
          // gegen ein Verhalten, das Postgres nie zeigt.
          if (this.op === 'upsert' && this.conflictCols.length > 0) {
            const existing = rows.find((r) =>
              this.conflictCols.every((col) => r[col] === item[col]),
            )
            if (existing) {
              Object.assign(existing, item)
              return existing
            }
          }
          const base = this.table === 'contacts' ? contactDefaults(item) : { ...item }
          if (base.id === undefined) base.id = `${this.table}-${seq++}`
          rows.push(base)
          writeAudit(this.table, 'insert', base)
          return base
        })
        return this.finish(written)
      }

      if (this.op === 'update') {
        const patch = this.payload as Row
        if (Object.keys(patch).length === 0) {
          // PostgREST rejects an empty PATCH body — mirror that so the
          // repository can't get away with update({}).
          return { data: null, error: { message: 'empty patch body' } }
        }
        const matched = rows.filter((r) => this.matches(r))
        for (const r of matched) {
          const before = { ...r }
          Object.assign(r, patch)
          writeAudit(this.table, 'update', { ...patch, id: r.id }, before)
        }
        return this.finish(matched)
      }

      if (this.op === 'delete') {
        let removed = rows.filter((r) => this.matches(r))
        if (this.table === 'regions') {
          // Delete-Policy regions_delete (0030): Platzhalter-Zeilen matcht die
          // Policy nie — sie bleiben ohne Fehler stehen (0 Zeilen gelöscht).
          removed = removed.filter((r) => !r.is_placeholder)
          // FK-Schutz wie in Postgres: contacts.region_id / profiles.region_id
          // haben keine ON DELETE-Klausel — benutzte Gebiete lösen 23503 aus.
          const ids = new Set(removed.map((r) => r.id))
          const used =
            tables.contacts.some((c) => ids.has(c.region_id)) ||
            tables.profiles.some((p) => ids.has(p.region_id))
          if (used) {
            return {
              data: null,
              error: {
                message:
                  'update or delete on table "regions" violates foreign key constraint',
              },
            }
          }
        }
        for (const r of removed) writeAudit(this.table, 'delete', r)
        tables[this.table] = rows.filter((r) => !removed.includes(r))
        // Emulate the schema's ON DELETE CASCADE from contacts.
        if (this.table === 'contacts') {
          const ids = new Set(removed.map((r) => r.id))
          // favorites.contact_id ON DELETE CASCADE (0031) — die Sterne aller Nutzer gehen mit.
          for (const child of ['side_facts', 'contact_photos', 'contact_customers', 'reminders', 'event_attendees', 'favorites'] as const) {
            tables[child] = tables[child].filter((r) => !ids.has(r.contact_id))
          }
          tables.contact_links = tables.contact_links.filter(
            (l) => !ids.has(l.from_contact_id) && !ids.has(l.to_contact_id),
          )
          tables.event_notes = tables.event_notes.filter((n) => !ids.has(n.contact_id))
          // event_guests.promoted_contact_id ON DELETE SET NULL (0028): der Gast
          // bleibt, verliert aber den Verweis auf den gelöschten Kontakt.
          tables.event_guests = tables.event_guests.map((g) =>
            ids.has(g.promoted_contact_id) ? { ...g, promoted_contact_id: null } : g,
          )
          const removedActivityIds = new Set(
            tables.activities.filter((a) => ids.has(a.contact_id)).map((a) => a.id),
          )
          tables.activities = tables.activities.filter((a) => !ids.has(a.contact_id))
          tables.attachments = tables.attachments.filter((a) => !removedActivityIds.has(a.activity_id))
        }
        // event_notes.guest_id ON DELETE CASCADE (0028): Notizen über den Gast
        // verschwinden mit ihm.
        if (this.table === 'event_guests') {
          const gids = new Set(removed.map((r) => r.id))
          tables.event_notes = tables.event_notes.filter((n) => !gids.has(n.guest_id))
        }
        return { data: null, error: null }
      }

      // select
      let matched = rows.filter((r) => this.matches(r))
      if (this.orderBys.length > 0) {
        const isNull = (v: unknown) => v === null || v === undefined
        matched = [...matched].sort((a, b) => {
          for (const { col, ascending, nullsFirst } of this.orderBys) {
            const an = isNull(a[col])
            const bn = isNull(b[col])
            if (an !== bn) return an === nullsFirst ? -1 : 1
            if (an && bn) continue
            const av = a[col]
            const bv = b[col]
            // Zahlen numerisch vergleichen (audit_log.id), sonst lexikalisch.
            const cmp =
              typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av).localeCompare(String(bv))
            if (cmp !== 0) return ascending ? cmp : -cmp
          }
          return 0
        })
      }
      if (this.limitRows !== undefined) matched = matched.slice(0, this.limitRows)
      return this.finish(matched)
    }

    private finish(matched: Row[]): Result {
      if ((this.op !== 'select' && !this.returning) || this.op === 'delete') {
        return { data: null, error: null }
      }
      const projected = matched.map((r) => withEmbeds(this.table, r, this.selectCols))
      if (this.mode === 'single') {
        if (projected.length !== 1) {
          return { data: null, error: { message: `expected exactly one row, got ${projected.length}` } }
        }
        return { data: projected[0], error: null }
      }
      if (this.mode === 'maybeSingle') {
        return { data: projected[0] ?? null, error: null }
      }
      return { data: projected, error: null }
    }

    then<R1 = Result, R2 = never>(
      onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): PromiseLike<R1 | R2> {
      return Promise.resolve(this.exec()).then(onfulfilled, onrejected)
    }
  }

  return {
    from(table: string) {
      return new Builder(table)
    },
    async rpc(fn: string, args: Row = {}): Promise<Result> {
      return callRpc(fn, args)
    },
    /** Test helper: peek at raw table contents. */
    _tables: tables,
  }
}
