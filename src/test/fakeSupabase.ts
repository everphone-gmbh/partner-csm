// Minimal in-memory stand-in for the Supabase client, covering exactly the
// PostgREST surface SupabaseRepository uses. Powers the repository contract
// tests so mock and Supabase implementations can't drift apart silently.

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }

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
  'reminders',
  'intro_requests',
  'everphone_accounts',
] as const

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
    private orderBy?: { col: string; ascending: boolean; nullsFirst: boolean }
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
    order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
      this.orderBy = {
        col,
        ascending: opts?.ascending !== false,
        // Postgres-Standard: NULLs zuletzt bei ASC. Ohne diese Nachbildung
        // würde der Fake leere Werte nach vorne sortieren.
        nullsFirst: opts?.nullsFirst ?? false,
      }
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
        for (const r of matched) Object.assign(r, patch)
        return this.finish(matched)
      }

      if (this.op === 'delete') {
        const removed = rows.filter((r) => this.matches(r))
        tables[this.table] = rows.filter((r) => !this.matches(r))
        // Emulate the schema's ON DELETE CASCADE from contacts.
        if (this.table === 'contacts') {
          const ids = new Set(removed.map((r) => r.id))
          for (const child of ['side_facts', 'contact_photos', 'contact_customers', 'reminders', 'event_attendees'] as const) {
            tables[child] = tables[child].filter((r) => !ids.has(r.contact_id))
          }
          tables.contact_links = tables.contact_links.filter(
            (l) => !ids.has(l.from_contact_id) && !ids.has(l.to_contact_id),
          )
          tables.event_notes = tables.event_notes.filter((n) => !ids.has(n.contact_id))
          const removedActivityIds = new Set(
            tables.activities.filter((a) => ids.has(a.contact_id)).map((a) => a.id),
          )
          tables.activities = tables.activities.filter((a) => !ids.has(a.contact_id))
          tables.attachments = tables.attachments.filter((a) => !removedActivityIds.has(a.activity_id))
        }
        return { data: null, error: null }
      }

      // select
      let matched = rows.filter((r) => this.matches(r))
      if (this.orderBy) {
        const { col, ascending, nullsFirst } = this.orderBy
        const isNull = (v: unknown) => v === null || v === undefined
        matched = [...matched].sort((a, b) => {
          const an = isNull(a[col])
          const bn = isNull(b[col])
          if (an !== bn) return an === nullsFirst ? -1 : 1
          if (an && bn) return 0
          const av = String(a[col])
          const bv = String(b[col])
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av)
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
    /** Test helper: peek at raw table contents. */
    _tables: tables,
  }
}
