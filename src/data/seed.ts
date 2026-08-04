import type { EverphoneAccount } from '@/domain/everphoneAccounts'
import type { OrgUnit } from '@/domain/types'
import type {
  Activity,
  AppUser,
  Contact,
  ContactLink,
  EventAttendee,
  EventItem,
  EventNote,
  IntroRequest,
  Region,
  Reminder,
} from '@/domain/types'

// Seed data for the first draft. Fictional Telekom partner contacts — no real
// personal data. Today (demo) is 2026-06-30.

export const seedRegions: Region[] = [
  { id: 'r-nord', name: 'Nord', isPlaceholder: false },
  { id: 'r-sued', name: 'Süd', isPlaceholder: false },
  { id: 'r-ost', name: 'Ost', isPlaceholder: false },
  { id: 'r-west', name: 'West', isPlaceholder: false },
  { id: 'r-mitte', name: 'Mitte', isPlaceholder: false },
  // Spiegelt die Produktionslage: dort liegen 446 der 671 Kontakte in einem
  // Platzhalter, weil der Import keine verlässliche Region hergab.
  { id: 'r-unbekannt', name: 'Unbekannt', isPlaceholder: true },
]

export const seedUsers: AppUser[] = [
  { id: 'u-lennart', name: 'Lennart Bernhard', role: 'overall_admin' },
  { id: 'u-alex', name: 'Alexandra v. Königsmarck', role: 'sub_admin', regionId: 'r-nord' },
  { id: 'u-olaf', name: 'Olaf Gründel', role: 'sub_admin', regionId: 'r-sued' },
  { id: 'u-mehmet', name: 'Mehmet Yıldız', role: 'account_manager', regionId: 'r-west' },
  { id: 'u-tomira', name: 'Tomira Falk', role: 'account_manager', regionId: 'r-nord' },
]

export const seedContacts: Contact[] = [
  {
    id: 'c-anke',
    fullName: 'Anke Richter',
    position: 'Leiterin Partner Management',
    regionId: 'r-nord',
    relationshipManagerId: 'u-alex',
    company: 'Deutsche Telekom',
    team: 'Partner Management',
    email: 'anke.richter@example-telekom.de',
    birthday: '1979-07-03',
    location: 'Hamburg',
    familyStatus: 'verheiratet',
    children: '2 (8 und 11 Jahre)',
    pets: '—',
    linkedin: {
      status: 'has_account',
      url: 'https://www.linkedin.com/in/example-anke-richter',
      verifiedByName: 'Alexandra v. Königsmarck',
      verifiedAt: '2026-05-20',
    },
    sentiment: 'green',
    activeDevices: '2× iPhone, 1× iPad',
    wonCustomersCount: 4,
    freeText: 'Sehr verbindlich, antwortet schnell. Reagiert gut auf persönliche Ansprache.',
    sideFacts: [
      { id: 'sf-anke-1', label: 'Segeln', category: 'sport' },
      { id: 'sf-anke-2', label: 'Italien-Fan', category: 'interest' },
    ],
    customers: [
      { id: 'cu-1', name: 'Nordmetall AG', withUs: true, salesforceUrl: 'https://example.salesforce.com/acc/nordmetall' },
      { id: 'cu-2', name: 'Hanse Logistik', withUs: false },
    ],
    createdAt: '2026-04-01T09:00:00.000Z',
    updatedAt: '2026-06-25T14:30:00.000Z',
  },
  {
    id: 'c-thomas',
    fullName: 'Thomas Berger',
    position: 'Head of Procurement',
    regionId: 'r-sued',
    relationshipManagerId: 'u-olaf',
    company: 'Deutsche Telekom',
    email: 'thomas.berger@example-telekom.de',
    birthday: '1985-06-30',
    location: 'München',
    familyStatus: 'verheiratet',
    children: '1',
    pets: 'Hund (Labrador, "Emma")',
    linkedin: {
      status: 'no_account',
      verifiedByName: 'Olaf Gründel',
      verifiedAt: '2026-06-10',
    },
    sentiment: 'amber',
    activeDevices: '1× Samsung Galaxy',
    wonCustomersCount: 1,
    freeText: 'Eher zurückhaltend. Fußball (Bayern) ist ein guter Türöffner.',
    sideFacts: [
      { id: 'sf-thomas-1', label: 'FC Bayern', category: 'sport' },
      { id: 'sf-thomas-2', label: 'Hund', category: 'family' },
    ],
    customers: [{ id: 'cu-3', name: 'Alpen Maschinenbau', withUs: true }],
    createdAt: '2026-04-03T09:00:00.000Z',
    updatedAt: '2026-06-12T11:00:00.000Z',
  },
  {
    id: 'c-sandra',
    fullName: 'Sandra Vogel',
    position: 'Key Account Lead',
    regionId: 'r-west',
    relationshipManagerId: 'u-mehmet',
    company: 'Samsung',
    email: 'sandra.vogel@example-telekom.de',
    birthday: '1990-12-12',
    location: 'Köln',
    linkedin: { status: 'unknown' },
    sentiment: 'red',
    wonCustomersCount: 0,
    freeText: 'Noch wenig Kontakt. Erstes Treffen auf der Digital X geplant.',
    sideFacts: [{ id: 'sf-sandra-1', label: 'Marathon', category: 'sport' }],
    customers: [{ id: 'cu-4', name: 'RheinEnergie Services', withUs: false }],
    createdAt: '2026-05-10T09:00:00.000Z',
    updatedAt: '2026-06-20T08:15:00.000Z',
  },
  {
    id: 'c-michael',
    fullName: 'Michael Krause',
    position: 'IT Director',
    regionId: 'r-ost',
    relationshipManagerId: 'u-olaf',
    company: 'Deutsche Telekom',
    email: 'michael.krause@example-telekom.de',
    birthday: '1976-02-28',
    location: 'Leipzig',
    familyStatus: 'ledig',
    linkedin: {
      status: 'has_account',
      url: 'https://www.linkedin.com/in/example-michael-krause',
      verifiedByName: 'Olaf Gründel',
      verifiedAt: '2026-03-15',
    },
    sentiment: 'green',
    activeDevices: '1× iPhone, 1× MacBook',
    wonCustomersCount: 3,
    sideFacts: [
      { id: 'sf-michael-1', label: 'Schach', category: 'hobby' },
      { id: 'sf-michael-2', label: 'E-Bikes', category: 'interest' },
    ],
    customers: [
      { id: 'cu-5', name: 'Sachsen Digital GmbH', withUs: true },
      { id: 'cu-6', name: 'Elbe Cloud', withUs: true },
    ],
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-06-18T16:45:00.000Z',
  },
  {
    id: 'c-julia',
    fullName: 'Julia Hoffmann',
    position: 'VP Sales Telekom Business',
    regionId: 'r-mitte',
    relationshipManagerId: 'u-alex',
    company: 'Deutsche Telekom',
    team: 'Sales Leadership',
    email: 'julia.hoffmann@example-telekom.de',
    birthday: '1983-09-19',
    location: 'Frankfurt',
    familyStatus: 'verheiratet',
    children: '3',
    linkedin: {
      status: 'has_account',
      url: 'https://www.linkedin.com/in/example-julia-hoffmann',
      verifiedByName: 'Alexandra v. Königsmarck',
      verifiedAt: '2026-06-01',
    },
    sentiment: 'amber',
    activeDevices: '2× iPhone',
    wonCustomersCount: 2,
    freeText: 'Wichtige Multiplikatorin. Sehr an Nachhaltigkeitsthemen interessiert.',
    sideFacts: [
      { id: 'sf-julia-1', label: 'Nachhaltigkeit', category: 'interest' },
      { id: 'sf-julia-2', label: 'Yoga', category: 'sport' },
    ],
    customers: [{ id: 'cu-7', name: 'Main Finanz AG', withUs: true }],
    createdAt: '2026-02-15T09:00:00.000Z',
    updatedAt: '2026-06-22T10:00:00.000Z',
  },
  {
    id: 'c-stefan',
    fullName: 'Stefan Lang',
    position: 'Procurement Manager',
    regionId: 'r-nord',
    relationshipManagerId: 'u-alex',
    company: 'Deutsche Telekom',
    email: 'stefan.lang@example-telekom.de',
    birthday: '1988-11-05',
    location: 'Bremen',
    linkedin: {
      status: 'no_account',
      verifiedByName: 'Tomira Falk',
      verifiedAt: '2026-06-15',
    },
    sentiment: 'neutral',
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt: '2026-06-01T09:00:00.000Z',
    updatedAt: '2026-06-15T09:00:00.000Z',
  },
  {
    id: 'c-nicole',
    fullName: 'Nicole Wagner',
    position: 'Partner Development Manager',
    regionId: 'r-sued',
    relationshipManagerId: 'u-olaf',
    company: 'Deutsche Telekom',
    email: 'nicole.wagner@example-telekom.de',
    birthday: '1981-07-08',
    location: 'Stuttgart',
    familyStatus: 'verheiratet',
    children: '2',
    linkedin: { status: 'unknown' },
    sentiment: 'green',
    activeDevices: '1× iPhone, 1× iPad',
    wonCustomersCount: 5,
    freeText: 'Langjährige, sehr enge Beziehung. Top-Multiplikatorin im Süden.',
    sideFacts: [
      { id: 'sf-nicole-1', label: 'Wandern', category: 'sport' },
      { id: 'sf-nicole-2', label: 'Weinkennerin', category: 'interest' },
    ],
    customers: [
      { id: 'cu-8', name: 'Schwaben Tech', withUs: true },
      { id: 'cu-9', name: 'Bodensee Industrie', withUs: true },
    ],
    // Langjährige Beziehung: Jahrestag Mitte Juli → demonstriert die Jubiläen.
    createdAt: '2024-07-20T09:00:00.000Z',
    updatedAt: '2026-06-28T13:20:00.000Z',
  },
  {
    id: 'c-peter',
    fullName: 'Peter Schulz',
    position: 'Strategic Sourcing Lead',
    regionId: 'r-west',
    relationshipManagerId: 'u-mehmet',
    company: 'Lenovo',
    email: 'peter.schulz@example-telekom.de',
    birthday: '1973-04-22',
    location: 'Düsseldorf',
    familyStatus: 'geschieden',
    children: '1',
    linkedin: {
      status: 'has_account',
      url: 'https://www.linkedin.com/in/example-peter-schulz',
      verifiedByName: 'Mehmet Yıldız',
      verifiedAt: '2026-05-30',
    },
    sentiment: 'amber',
    activeDevices: '1× Samsung Galaxy, 1× Tablet',
    wonCustomersCount: 1,
    sideFacts: [{ id: 'sf-peter-1', label: 'Golf', category: 'sport' }],
    customers: [
      { id: 'cu-10', name: 'Ruhr Mobility', withUs: false },
      { id: 'cu-11', name: 'Rhein Retail', withUs: true },
    ],
    createdAt: '2026-04-12T09:00:00.000Z',
    updatedAt: '2026-06-19T15:10:00.000Z',
  },
]

export const seedActivities: Activity[] = [
  {
    id: 'act-1',
    contactId: 'c-anke',
    type: 'meeting',
    occurredAt: '2026-06-25T13:00:00.000Z',
    authorId: 'u-alex',
    authorName: 'Alexandra v. Königsmarck',
    body: 'Persönliches Treffen in Hamburg. Anke ist sehr offen für eine Ausweitung der Zusammenarbeit auf die Hanse-Logistik-Gruppe. Wir haben über die Sommerpläne gesprochen — sie segelt im August zwei Wochen in Kroatien. Nächster Schritt: Angebot für 150 Devices bis KW 28.',
    aiSummary: 'Treffen in Hamburg: offen für Ausweitung auf Hanse Logistik; Angebot über 150 Devices bis KW 28.',
    attachments: [{ id: 'at-1', name: 'Gespraechsnotiz.pdf', kind: 'document' }],
  },
  {
    id: 'act-2',
    contactId: 'c-anke',
    type: 'call',
    occurredAt: '2026-06-10T09:30:00.000Z',
    authorId: 'u-alex',
    authorName: 'Alexandra v. Königsmarck',
    body: 'Kurzes Telefonat zur Abstimmung des Digital-X-Termins. Sie kommt definitiv und bringt eine Kollegin aus dem Einkauf mit.',
    aiSummary: 'Telefonat: kommt zur Digital X, bringt Einkaufs-Kollegin mit.',
    attachments: [],
  },
  {
    id: 'act-3',
    contactId: 'c-thomas',
    type: 'email',
    occurredAt: '2026-06-12T08:00:00.000Z',
    authorId: 'u-olaf',
    authorName: 'Olaf Gründel',
    body: 'E-Mail mit Produktunterlagen geschickt. Noch keine Reaktion — in zwei Wochen nachfassen.',
    aiSummary: 'Produktunterlagen per Mail; in 2 Wochen nachfassen.',
    attachments: [],
  },
]

export const seedEvents: EventItem[] = [
  {
    id: 'ev-digitalx',
    name: 'Digital X 2026',
    date: '2026-10-15',
    location: 'Köln',
    description: 'Größte Digitalisierungs-Messe Europas — Telekom-Leitmesse.',
  },
  {
    id: 'ev-ciomove',
    name: 'CIO Move',
    date: '2026-09-05',
    location: 'Hamburg',
    description: 'Exklusives C-Level-Event; Termine vorab koordinieren.',
  },
]

export const seedEventAttendees: (EventAttendee & { eventId: string })[] = [
  { eventId: 'ev-digitalx', contactId: 'c-anke', status: 'accepted', purpose: 'Ausweitung auf Hanse Logistik besprechen' },
  { eventId: 'ev-digitalx', contactId: 'c-julia', status: 'invited', purpose: 'Multiplikatorin — Thema Nachhaltigkeit' },
  { eventId: 'ev-digitalx', contactId: 'c-sandra', status: 'invited', purpose: 'Erstkontakt vertiefen' },
  { eventId: 'ev-ciomove', contactId: 'c-michael', status: 'accepted', purpose: 'Cloud-Ausbau Sachsen Digital' },
  { eventId: 'ev-ciomove', contactId: 'c-nicole', status: 'accepted', purpose: 'Bestandsbeziehung pflegen' },
]

export const seedReminders: Reminder[] = [
  {
    id: 'rem-1',
    contactId: 'c-anke',
    dueDate: '2026-07-02',
    text: 'Angebot über 150 Devices nachfassen (bis KW 28)',
    done: false,
    createdByName: 'Alexandra v. Königsmarck',
  },
  {
    id: 'rem-2',
    contactId: 'c-thomas',
    dueDate: '2026-06-28',
    text: 'Reaktion auf Produktunterlagen einholen',
    done: false,
    createdByName: 'Olaf Gründel',
  },
  {
    id: 'rem-3',
    contactId: 'c-nicole',
    dueDate: '2026-07-06',
    text: 'Geburtstagsgruß vorbereiten',
    done: false,
    createdByName: 'Olaf Gründel',
  },
]

export const seedEventNotes: EventNote[] = [
  {
    id: 'en-1',
    eventId: 'ev-digitalx',
    text: 'Standaufbau läuft, Telekom-Lounge ist bezogen. Anke kommt gegen 14 Uhr.',
    authorName: 'Alexandra v. Königsmarck',
    createdAt: '2026-06-30T08:00:00.000Z',
    attachments: [],
  },
]

// Beziehungsnetz: who reports to / knows / influences whom (fictional).
export const seedContactLinks: ContactLink[] = [
  { id: 'link-1', fromContactId: 'c-stefan', toContactId: 'c-anke', kind: 'reports_to' },
  { id: 'link-2', fromContactId: 'c-anke', toContactId: 'c-julia', kind: 'knows', note: 'kennen sich von der Digital X 2025' },
  { id: 'link-3', fromContactId: 'c-julia', toContactId: 'c-michael', kind: 'influences', note: 'Budgetfreigaben' },
]

// "Wer kann helfen?" board — open intro requests (fictional).
export const seedIntroRequests: IntroRequest[] = [
  {
    id: 'intro-1',
    text: 'Suche einen Draht zum Cloud-Einkauf in Region Ost — wer kennt dort jemanden neben Michael Krause?',
    createdById: 'u-mehmet',
    createdByName: 'Mehmet Yıldız',
    createdAt: '2026-06-28T09:00:00.000Z',
    status: 'open',
  },
  {
    id: 'intro-2',
    text: 'Wer kann mich bei Julia Hoffmann für das Nachhaltigkeits-Panel vorstellen?',
    createdById: 'u-olaf',
    createdByName: 'Olaf Gründel',
    createdAt: '2026-06-25T10:00:00.000Z',
    status: 'resolved',
    helperName: 'Alexandra v. Königsmarck',
    resolvedAt: '2026-06-26T08:30:00.000Z',
  },
]

/**
 * Soll-Organisationsstruktur für den Demo-Modus. Deckt bewusst alle vier
 * Abdeckungs-Zustände ab: „Partner Management" und „Sales Leadership" haben
 * Kontakte aus dem Seed, „Einkauf Konzern" absichtlich keinen — so ist die
 * eigentliche Lücke auch ohne Backend sichtbar.
 */
export const seedOrgUnits: OrgUnit[] = [
  { id: 'ou-1', company: 'Deutsche Telekom', department: 'Partner Management', team: null },
  { id: 'ou-2', company: 'Deutsche Telekom', department: 'Sales Leadership', team: null },
  { id: 'ou-3', company: 'Deutsche Telekom', department: 'Einkauf Konzern', team: null },
  { id: 'ou-4', company: 'Deutsche Telekom', department: 'Einkauf Konzern', team: 'Mobilfunk' },
]

/**
 * Everphone-Bestandskunden-Referenz für den Demo-Modus. In der echten
 * Installation kommt die Liste aus Salesforce (Tabelle `everphone_accounts`,
 * Migration 0015); hier decken die Einträge bewusst alle Status-Fälle der
 * Seed-Kunden ab: Treffer als Kunde, Offboarding, ehemaliger Kunde, Funnel
 * und Nicht-Treffer.
 */
export const seedEverphoneAccounts: EverphoneAccount[] = [
  { salesforceId: 'sf-demo-1', name: 'Nordmetall AG', status: 'customer', activeRentals: 412 },
  { salesforceId: 'sf-demo-2', name: 'Sachsen Digital GmbH', status: 'customer', activeRentals: 87 },
  { salesforceId: 'sf-demo-3', name: 'Main Finanz AG', status: 'offboarding', activeRentals: 15 },
  { salesforceId: 'sf-demo-4', name: 'Schwaben Tech GmbH', status: 'inactive' },
  { salesforceId: 'sf-demo-5', name: 'Hanse Logistik GmbH', status: 'prospect' },
  { salesforceId: 'sf-demo-6', name: 'Ruhr Mobility SE', status: 'prospect' },
]
