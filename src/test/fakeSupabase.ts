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
  /** auth.users — nur die Spalten, die pending_accounts() liest (0040). */
  auth_users?: Row[]
  regions?: Row[]
  everphone_accounts?: Row[]
  org_units?: Row[]
}

const TABLES = [
  'regions',
  'profiles',
  'contacts',
  'contact_regions',
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
  'gift_occasions',
  'gift_products',
  'gift_senders',
  'gift_recipients',
  'gift_recipient_senders',
] as const

/**
 * Zusammengesetzte Primärschlüssel, die der Fake wie Postgres durchsetzt: ein
 * zweites INSERT auf dasselbe Paar liefert 23505 statt einer zweiten Zeile.
 * Ohne das prüfte die Contract-Suite die Idempotenz von addFavorite nur im
 * Mock — im Supabase-Zweig sähe der Adapter den Fehler nie (Fallstrick 4).
 */
const UNIQUE_KEYS: Record<string, string[]> = {
  favorites: ['profile_id', 'contact_id'],
  contact_regions: ['contact_id', 'region_id'],
  gift_recipient_senders: ['recipient_id', 'sender_id'],
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
  const authUsers = (seed.auth_users ?? []).map((r) => ({ ...r }))
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
      // Spalte der View contact_cards (0035): alle Gebiete, fuehrendes zuerst.
      // Kein Embed, sondern ein Unterselect — deshalb haengt sie nicht an einer
      // Klammer im select, sondern am blossen Spaltennamen.
      if (select.includes('region_ids')) {
        const own = tables.contact_regions.filter((cr) => cr.contact_id === row.id)
        out.region_ids = own.length
          ? own
              .map((cr) => String(cr.region_id))
              .sort((a, b) => (a === row.region_id ? -1 : b === row.region_id ? 1 : 0))
          : [row.region_id]
      }
    }
    return out
  }

  function giftRecipientDefaults(row: Row): Row {
    return { shipping: 'direkt', status: 'geplant', status_at: null, ...row }
  }

  function contactDefaults(row: Row): Row {
    return {
      hierarchy_level: null,
      additional_companies: [],
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
    // Rollenwechsel sind sicherheitsrelevant und werden protokolliert
    // (Trigger profiles_audit, Migration 0033) — wie überall nur die
    // Feldnamen, nie die Werte.
    profiles: 'profile',
  }
  let auditSeq = 1
  const AUDIT_AT = '2026-07-01T00:00:00.000Z'
  /** now() des Triggers aus 0034 — fest, damit Tests vergleichbar bleiben. */
  const FAKE_EDITED_AT = '2026-07-02T00:00:00.000Z'

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
   * Trigger `profiles_guard_change` (Migration 0033). RLS prüft Zeilen, nicht
   * Übergänge — deshalb hängen diese beiden Sperren an einem Trigger und
   * kommen als ganz normaler Fehler mit Code 42501 beim Adapter an:
   *   1. Die Konto-ID bleibt unveränderlich (gemeinsamer Schlüssel mit
   *      auth.users).
   *   2. Der LETZTE Administrator lässt sich nicht herabstufen.
   *
   * Die dritte Sperre des Triggers — „niemand ändert die EIGENE Rolle" —
   * braucht `auth.uid()`. Der Fake kennt keine Sitzung und kann sie nicht
   * nachbilden; sie wird von Hand gegen die echte Datenbank geprüft, und die
   * Oberfläche deaktiviert das eigene Rollenfeld.
   */
  /**
   * Trigger `activities_guard_change` (Migration 0034). Aenderbar ist nur der
   * Inhalt: Kontakt, Verfasser, Zeitpunkt und Art bleiben stehen, sonst liesse
   * sich per UPDATE die Regionspruefung aus `activities_insert` umgehen und ein
   * Eintrag in einen fremden Kontakt schieben.
   *
   * `edited_at` setzt die Datenbank selbst — und nur, wenn sich am Text wirklich
   * etwas geaendert hat. Der Fake muss das nachbilden, sonst behauptet der
   * Mock-Zweig eine Korrektur-Markierung, die der Supabase-Zweig nicht liefert.
   */
  /**
   * Riegel der Geschenk-Tabellen (Migration 0036), wie Postgres sie durchsetzt:
   * eindeutige Absendernamen ohne Rücksicht auf Groß/Klein, genau ein
   * Geburtstags-Anlass, jede Empfängerzeile nennt jemanden, und ein Produkt
   * muss zum Anlass der Zeile gehören. `candidates` sind die Zeilen, wie sie
   * NACH dem Schreiben aussähen; `others` der übrige Bestand.
   */
  function checkGiftConstraints(table: string, candidates: Row[], others: Row[]): Result | null {
    const fail = (message: string, code: string): Result => ({ data: null, error: { message, code } })
    const blank = (v: unknown) => typeof v !== 'string' || v.trim() === ''
    if (table === 'gift_senders') {
      const key = (r: Row) => String(r.name ?? '').trim().toLowerCase()
      const seen = new Set(others.map(key))
      for (const c of candidates) {
        if (blank(c.name)) return fail('new row violates check constraint "gift_senders_name_check"', '23514')
        if (seen.has(key(c))) return fail('duplicate key value violates unique constraint "gift_senders_name_key"', '23505')
        seen.add(key(c))
      }
    }
    if (table === 'gift_occasions') {
      let birthdays = others.filter((r) => r.kind === 'geburtstag').length
      for (const c of candidates) {
        if (blank(c.name)) return fail('new row violates check constraint "gift_occasions_name_check"', '23514')
        if (c.kind === 'geburtstag' && ++birthdays > 1) {
          return fail('duplicate key value violates unique constraint "gift_occasions_one_birthday"', '23505')
        }
      }
    }
    if (table === 'gift_recipients') {
      for (const c of candidates) {
        if (blank(c.first_name) && blank(c.last_name) && blank(c.company)) {
          return fail('new row violates check constraint "gift_recipients_names_someone"', '23514')
        }
        if (
          c.product_id &&
          !tables.gift_products.some((p) => p.id === c.product_id && p.occasion_id === c.occasion_id)
        ) {
          return fail('Das Produkt gehört zu einem anderen Anlass', '23514')
        }
      }
    }
    return null
  }

  const ACTIVITY_FROZEN = ['id', 'contact_id', 'author_id', 'occurred_at', 'type']
  function guardActivityUpdate(patch: Row, matched: Row[]): Result | null {
    for (const row of matched) {
      for (const col of ACTIVITY_FROZEN) {
        if (patch[col] !== undefined && patch[col] !== row[col]) {
          return {
            data: null,
            error: { message: `${col} kann nicht geaendert werden`, code: '42501' },
          }
        }
      }
      const changed =
        (patch.body !== undefined && patch.body !== row.body) ||
        (patch.ai_summary !== undefined && patch.ai_summary !== row.ai_summary)
      if (changed) patch.edited_at = FAKE_EDITED_AT
    }
    return null
  }

  function guardProfileUpdate(patch: Row, matched: Row[]): Result | null {
    for (const row of matched) {
      if (patch.id !== undefined && patch.id !== row.id) {
        return {
          data: null,
          error: { message: 'Die Konto-ID kann nicht geaendert werden', code: '42501' },
        }
      }
      if (patch.role !== undefined && patch.role !== row.role) {
        const admins = tables.profiles.filter((p) => p.role === 'overall_admin').length
        if (row.role === 'overall_admin' && admins <= 1) {
          return {
            data: null,
            error: {
              message: 'Der letzte Administrator kann nicht herabgestuft werden',
              code: '42501',
            },
          }
        }
      }
    }
    return null
  }

  /**
   * Datenbankfunktionen (PostgREST `rpc`). Bis Migration 0032 kam die App ohne
   * aus; seitdem geht das Kontaktfoto über `set_contact_photo`, weil es jede
   * Rolle pflegen darf, `contacts_update` aber bei RM+ bleibt. Ohne Nachbildung
   * prüfte der Supabase-Zweig der Contract-Suite den Adapter gar nicht mehr
   * (Fallstrick 4).
   */
  /**
   * merge_contacts() aus 0038 auf den Rohtabellen: umhängen, vereinen, den
   * Verlierer löschen. Die Rechteprüfung (nur Leitung) und die Ausnahme im
   * Aktivitäts-Riegel prüft die Trockenprobe — der Fake kennt keine Rollen.
   */
  function mergeContactsRpc(args: Row): Result {
    const w = String(args.p_winner)
    const l = String(args.p_loser)
    const refMap = (args.p_ref_map ?? {}) as Record<string, string>
    if (w === l) return { data: null, error: { message: 'Ein Kontakt lässt sich nicht mit sich selbst zusammenführen', code: '22023' } }
    if (!tables.contacts.some((c) => c.id === w) || !tables.contacts.some((c) => c.id === l)) {
      return { data: null, error: { message: 'Kontakt nicht gefunden', code: 'P0002' } }
    }
    for (const t of ['activities', 'reminders', 'event_notes', 'gift_recipients'] as const) {
      for (const r of tables[t]) if (r.contact_id === l) r.contact_id = w
    }
    for (const g of tables.event_guests) if (g.promoted_contact_id === l) g.promoted_contact_id = w
    for (const ph of tables.contact_photos) {
      if (ph.contact_id === l) {
        ph.contact_id = w
        ph.url = refMap[String(ph.url)] ?? ph.url
      }
    }
    for (const f of tables.side_facts) if (f.contact_id === l) f.contact_id = w
    const labels = new Set<string>()
    tables.side_facts = tables.side_facts.filter((f) => {
      if (f.contact_id !== w) return true
      const key = String(f.label ?? '').trim().toLowerCase()
      if (labels.has(key)) return false
      labels.add(key)
      return true
    })
    const union = (table: 'contact_customers' | 'contact_regions' | 'event_attendees' | 'favorites', keyCol: string) => {
      const winnerKeys = new Set(tables[table].filter((r) => r.contact_id === w).map((r) => r[keyCol]))
      tables[table] = tables[table]
        .filter((r) => !(r.contact_id === l && winnerKeys.has(r[keyCol])))
        .map((r) => (r.contact_id === l ? { ...r, contact_id: w } : r))
    }
    union('contact_customers', 'customer_id')
    union('contact_regions', 'region_id')
    union('event_attendees', 'event_id')
    union('favorites', 'profile_id')
    const pair = new Set([w, l])
    const seen = new Set<string>()
    tables.contact_links = tables.contact_links
      .filter((x) => !(pair.has(String(x.from_contact_id)) && pair.has(String(x.to_contact_id))))
      .map(
        (x): Row => ({
          ...x,
          from_contact_id: x.from_contact_id === l ? w : x.from_contact_id,
          to_contact_id: x.to_contact_id === l ? w : x.to_contact_id,
        }),
      )
      .filter((x) => {
        const key = `${x.from_contact_id}|${x.to_contact_id}|${x.kind}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    const loser = tables.contacts.find((c) => c.id === l)!
    tables.contacts = tables.contacts.filter((c) => c.id !== l)
    writeAudit('contacts', 'delete', loser)
    return { data: null, error: null }
  }

  /** Name wie in 0040: von Google, sonst aus der Adresse (initcap). */
  function accountName(u: Row): string {
    const meta = (u.raw_user_meta_data ?? {}) as Row
    const fromMeta = [meta.full_name, meta.name].map((v) => String(v ?? '').trim()).find(Boolean)
    if (fromMeta) return fromMeta
    return String(u.email ?? '')
      .split('@')[0]
      .split('.')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
  }

  /**
   * pending_accounts() und approve_account() aus 0040 auf den Rohtabellen. Die
   * Rollenprüfung darin prüft die Trockenprobe — der Fake kennt keine Rollen.
   */
  function accountRpc(fn: string, args: Row): Result {
    const hasProfile = (id: unknown) => tables.profiles.some((p) => p.id === id)
    if (fn === 'pending_accounts') {
      const data = authUsers
        .filter((u) => !hasProfile(u.id))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .map((u) => ({
          id: u.id,
          email: u.email,
          full_name: accountName(u),
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        }))
      return { data, error: null }
    }
    const user = authUsers.find((u) => u.id === args.p_user)
    if (!user) return { data: null, error: { message: 'Konto nicht gefunden' } }
    if (hasProfile(user.id)) return { data: null, error: { message: 'Das Konto ist bereits freigeschaltet' } }
    if (args.p_role === 'account_manager' && !args.p_region) {
      return { data: null, error: { message: 'Account Manager brauchen eine Region' } }
    }
    const row = { id: user.id, full_name: accountName(user), role: args.p_role, region_id: args.p_region ?? null }
    tables.profiles.push(row)
    writeAudit('profiles', 'insert', row)
    return { data: null, error: null }
  }

  function callRpc(fn: string, args: Row): Result {
    if (fn === 'merge_contacts') return mergeContactsRpc(args)
    if (fn === 'pending_accounts' || fn === 'approve_account') return accountRpc(fn, args)
    // org_unit_names() (0037): nur die Namen der Struktur, ohne Doppel. Die
    // Rollenprüfung darin prüft die Trockenprobe, der Fake kennt keine Rollen.
    if (fn === 'org_unit_names') {
      const seen = new Set<string>()
      const data = tables.org_units
        .map((u) => ({ company: u.company, department: u.department, team: u.team ?? null }))
        .filter((u) => {
          const key = `${u.company}|${u.department}|${u.team ?? ''}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      return { data, error: null }
    }
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
    private rangeFrom?: number
    private rangeTo?: number
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
    /**
     * Seitenweises Lesen wie PostgREST (`range(0, 999)` = die ersten 1000). Der
     * Adapter lädt größere Listen so, weil der Server pro Abfrage deckeln kann
     * und den Rest dann stillschweigend weglässt.
     */
    range(from: number, to: number) {
      this.rangeFrom = from
      this.rangeTo = to
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
        if (this.op === 'insert') {
          const giftError = checkGiftConstraints(this.table, items, rows)
          if (giftError) return giftError
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
          const base =
            this.table === 'contacts'
              ? contactDefaults(item)
              : this.table === 'gift_recipients'
                ? giftRecipientDefaults(item)
                : { ...item }
          if (base.id === undefined) base.id = `${this.table}-${seq++}`
          if (base.created_at === undefined && this.table.startsWith('gift_')) base.created_at = AUDIT_AT
          rows.push(base)
          writeAudit(this.table, 'insert', base)
          // Trigger contacts_region_membership (0035): ohne ihn haette ein neu
          // angelegter Kontakt keine Gebietszuordnung und waere fuer jeden
          // Account Manager unsichtbar.
          if (this.table === 'contacts' && base.region_id) {
            const has = tables.contact_regions.some(
              (cr) => cr.contact_id === base.id && cr.region_id === base.region_id,
            )
            if (!has) {
              tables.contact_regions.push({
                contact_id: base.id,
                region_id: base.region_id,
                created_at: AUDIT_AT,
              })
            }
          }
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
        if (this.table === 'profiles') {
          // Trigger vor dem Schreiben: schlägt er an, bleibt die Zeile stehen.
          const blocked = guardProfileUpdate(patch, matched)
          if (blocked) return blocked
        }
        if (this.table === 'activities') {
          const blocked = guardActivityUpdate(patch, matched)
          if (blocked) return blocked
        }
        if (this.table.startsWith('gift_')) {
          const after = matched.map((r) => ({ ...r, ...patch }))
          const giftError = checkGiftConstraints(
            this.table,
            after,
            rows.filter((r) => !matched.includes(r)),
          )
          if (giftError) return giftError
        }
        for (const r of matched) {
          const before = { ...r }
          Object.assign(r, patch)
          // Trigger gift_recipients_status_at (0036): den Zeitpunkt des Status
          // führt die Datenbank, nur bei einem echten Wechsel.
          if (this.table === 'gift_recipients' && patch.status !== undefined && patch.status !== before.status) {
            r.status_at = FAKE_EDITED_AT
          }
          writeAudit(this.table, 'update', { ...patch, id: r.id }, before)
          // Trigger contacts_region_membership_update (0035): wer das fuehrende
          // Gebiet umsetzt, ist danach auch Mitglied darin. Ohne diese
          // Nachbildung liefe „Region ersetzen" im Fake in die Regel
          // „mindestens ein Gebiet" — in Postgres passiert das nicht.
          if (
            this.table === 'contacts' &&
            patch.region_id !== undefined &&
            patch.region_id !== before.region_id &&
            !tables.contact_regions.some(
              (cr) => cr.contact_id === r.id && cr.region_id === patch.region_id,
            )
          ) {
            tables.contact_regions.push({
              contact_id: r.id,
              region_id: patch.region_id,
              created_at: AUDIT_AT,
            })
          }
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
        if (this.table === 'contact_regions') {
          // Trigger promote_leading_region (0035): das letzte Gebiet bleibt, und
          // faellt das fuehrende weg, rueckt ein verbliebenes nach.
          for (const r of removed) {
            const contact = tables.contacts.find((c) => c.id === r.contact_id)
            if (!contact) continue // Kaskade beim Loeschen des Kontakts
            const rest = tables.contact_regions.filter(
              (cr) => cr.contact_id === r.contact_id && !removed.includes(cr),
            )
            if (rest.length === 0) {
              return {
                data: null,
                error: {
                  message: 'Ein Kontakt braucht mindestens ein Gebiet',
                  code: '23502',
                },
              }
            }
            if (contact.region_id === r.region_id) contact.region_id = rest[0].region_id
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
        // Kaskaden der Geschenke (0036).
        const dropRecipients = (pred: (r: Row) => boolean) => {
          const gone = new Set(tables.gift_recipients.filter(pred).map((r) => r.id))
          tables.gift_recipients = tables.gift_recipients.filter((r) => !gone.has(r.id))
          tables.gift_recipient_senders = tables.gift_recipient_senders.filter(
            (l) => !gone.has(l.recipient_id),
          )
        }
        if (this.table === 'contacts') {
          const ids = new Set(removed.map((r) => r.id))
          // contact_id ON DELETE CASCADE: Recht auf Vergessenwerden.
          dropRecipients((r) => ids.has(r.contact_id))
          tables.contact_regions = tables.contact_regions.filter((cr) => !ids.has(cr.contact_id))
        }
        if (this.table === 'gift_occasions') {
          const ids = new Set(removed.map((r) => r.id))
          tables.gift_products = tables.gift_products.filter((p) => !ids.has(p.occasion_id))
          dropRecipients((r) => ids.has(r.occasion_id))
        }
        if (this.table === 'gift_recipients') {
          const ids = new Set(removed.map((r) => r.id))
          tables.gift_recipient_senders = tables.gift_recipient_senders.filter(
            (l) => !ids.has(l.recipient_id),
          )
        }
        if (this.table === 'gift_senders') {
          const ids = new Set(removed.map((r) => r.id))
          tables.gift_recipient_senders = tables.gift_recipient_senders.filter(
            (l) => !ids.has(l.sender_id),
          )
        }
        if (this.table === 'gift_products') {
          // product_id ON DELETE SET NULL: der Empfänger bleibt, ohne Produkt.
          const ids = new Set(removed.map((r) => r.id))
          for (const r of tables.gift_recipients) if (ids.has(r.product_id)) r.product_id = null
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
      if (this.rangeFrom !== undefined) matched = matched.slice(this.rangeFrom, (this.rangeTo ?? matched.length) + 1)
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
