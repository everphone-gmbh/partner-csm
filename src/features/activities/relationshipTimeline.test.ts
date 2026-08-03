import { describe, expect, it } from 'vitest'
import type { Activity } from '@/domain/types'
import { buildHistory } from './timelineHistory'
import { buildRelationshipTimeline } from './relationshipTimeline'

function activity(id: string, occurredAt: string, type: Activity['type'] = 'note'): Activity {
  return {
    id,
    contactId: 'c-1',
    type,
    occurredAt,
    authorId: 'u-1',
    authorName: 'Alexandra',
    body: 'Text',
    attachments: [],
  }
}

const CREATED = '2026-01-15T09:00:00.000Z'
const TODAY = new Date('2026-07-16T12:00:00.000Z')

describe('buildRelationshipTimeline', () => {
  it('spannt die Achse von der Partnerschaft bis heute', () => {
    const t = buildRelationshipTimeline([], CREATED, TODAY)
    expect(t.startAt).toBe(CREATED)
    expect(Date.parse(t.endAt)).toBe(TODAY.getTime())
    expect(t.spanDays).toBe(182)
  })

  it('setzt die Startmarke an den Achsenanfang', () => {
    const t = buildRelationshipTimeline([], CREATED, TODAY)
    expect(t.markers).toHaveLength(1)
    expect(t.markers[0].kind).toBe('start')
    expect(t.markers[0].x).toBe(0)
  })

  it('positioniert Marken zeitproportional zwischen 0 und 1', () => {
    const mid = '2026-04-16T12:00:00.000Z' // etwa Mitte des Zeitraums
    const history = buildHistory([activity('a1', mid)], [])
    const t = buildRelationshipTimeline(history, CREATED, TODAY)
    const marker = t.markers.find((m) => m.activityId === 'a1')
    expect(marker).toBeDefined()
    expect(marker!.x).toBeGreaterThan(0.45)
    expect(marker!.x).toBeLessThan(0.55)
    for (const m of t.markers) {
      expect(m.x).toBeGreaterThanOrEqual(0)
      expect(m.x).toBeLessThanOrEqual(1)
    }
  })

  it('sortiert Marken aufsteigend, unabhängig von der Eingabereihenfolge', () => {
    const history = buildHistory(
      [
        activity('spaet', '2026-06-01T10:00:00.000Z'),
        activity('frueh', '2026-02-01T10:00:00.000Z'),
      ],
      [{ at: '2026-04-01T10:00:00.000Z', value: 'green', byName: 'Alexandra' }],
    )
    const t = buildRelationshipTimeline(history, CREATED, TODAY)
    expect(t.markers.map((m) => m.key)).toEqual([
      'start',
      'a-frueh',
      's-2026-04-01T10:00:00.000Z-green',
      'a-spaet',
    ])
  })

  it('übernimmt Bewertung und Aktivitätsart in die Marke', () => {
    const history = buildHistory(
      [activity('a1', '2026-03-01T10:00:00.000Z', 'meeting')],
      [{ at: '2026-05-01T10:00:00.000Z', value: 'red', byName: 'Olaf' }],
    )
    const t = buildRelationshipTimeline(history, CREATED, TODAY)
    const act = t.markers.find((m) => m.activityId === 'a1')!
    expect(act.activityType).toBe('meeting')
    expect(act.label).toBe('Treffen')
    const sent = t.markers.find((m) => m.kind === 'sentiment')!
    expect(sent.sentiment).toBe('red')
    expect(sent.label).toBe('Bewertung: Kritisch')
  })

  it('zieht den Anfang vor, wenn eine Aktivität älter als createdAt ist', () => {
    const older = '2025-11-01T10:00:00.000Z'
    const t = buildRelationshipTimeline(buildHistory([activity('a1', older)], []), CREATED, TODAY)
    expect(Date.parse(t.startAt)).toBe(Date.parse(older))
    // Die Startmarke sitzt dann nicht mehr bei 0, sondern später.
    expect(t.markers.find((m) => m.kind === 'start')!.x).toBeGreaterThan(0)
    expect(t.markers.find((m) => m.activityId === 'a1')!.x).toBe(0)
  })

  it('verlängert das Ende bei künftig datierten Einträgen', () => {
    const future = '2026-09-01T10:00:00.000Z'
    const t = buildRelationshipTimeline(buildHistory([activity('a1', future)], []), CREATED, TODAY)
    expect(Date.parse(t.endAt)).toBe(Date.parse(future))
    expect(t.markers.find((m) => m.activityId === 'a1')!.x).toBe(1)
  })

  it('kommt ohne Division durch Null aus, wenn alles am selben Moment liegt', () => {
    const t = buildRelationshipTimeline(
      buildHistory([activity('a1', CREATED)], []),
      CREATED,
      new Date(CREATED),
    )
    expect(t.spanDays).toBe(0)
    expect(t.markers.every((m) => m.x === 0.5)).toBe(true)
    expect(t.ticks).toEqual([])
  })

  it('ignoriert unlesbare Zeitstempel statt NaN-Positionen zu erzeugen', () => {
    const t = buildRelationshipTimeline(
      buildHistory([activity('kaputt', 'kein-datum'), activity('ok', '2026-03-01T10:00:00.000Z')], []),
      CREATED,
      TODAY,
    )
    expect(t.markers.map((m) => m.key)).not.toContain('a-kaputt')
    expect(t.markers.every((m) => Number.isFinite(m.x))).toBe(true)
  })

  describe('Achsenmarken', () => {
    it('nutzt Monate bei kurzer Spanne', () => {
      const t = buildRelationshipTimeline([], '2026-01-15T00:00:00.000Z', TODAY)
      expect(t.ticks.map((k) => k.label)).toEqual(['Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul'])
    })

    it('nutzt Quartale bei mittlerer Spanne', () => {
      const t = buildRelationshipTimeline([], '2024-02-01T00:00:00.000Z', TODAY)
      const labels = t.ticks.map((k) => k.label)
      expect(labels[0]).toBe('Q2/24')
      expect(labels).toContain('Q1/26')
      expect(labels.every((l) => /^Q[1-4]\/\d{2}$/.test(l))).toBe(true)
    })

    it('nutzt Jahre bei langer Spanne', () => {
      const t = buildRelationshipTimeline([], '2018-06-01T00:00:00.000Z', TODAY)
      expect(t.ticks.map((k) => k.label)).toEqual(
        ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'],
      )
    })

    it('hält alle Achsenmarken innerhalb der Achse', () => {
      const t = buildRelationshipTimeline([], '2024-02-01T00:00:00.000Z', TODAY)
      for (const k of t.ticks) {
        expect(k.x).toBeGreaterThanOrEqual(0)
        expect(k.x).toBeLessThanOrEqual(1)
      }
    })
  })
})
