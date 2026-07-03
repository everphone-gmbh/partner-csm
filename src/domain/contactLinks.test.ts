import { describe, it, expect } from 'vitest'
import { describeLink } from './contactLinks'
import type { ContactLink } from './types'

const link: ContactLink = {
  id: 'l1',
  fromContactId: 'c-anke',
  toContactId: 'c-julia',
  kind: 'reports_to',
}

describe('describeLink', () => {
  it('describes the link from the source contact viewpoint', () => {
    expect(describeLink(link, 'c-anke')).toEqual({
      otherContactId: 'c-julia',
      label: 'berichtet an',
    })
  })

  it('describes the inverse from the target contact viewpoint', () => {
    expect(describeLink(link, 'c-julia')).toEqual({
      otherContactId: 'c-anke',
      label: 'führt',
    })
  })

  it('is symmetric for "knows"', () => {
    const knows: ContactLink = { ...link, kind: 'knows' }
    expect(describeLink(knows, 'c-anke')?.label).toBe('kennt')
    expect(describeLink(knows, 'c-julia')?.label).toBe('kennt')
  })

  it('inverts "influences"', () => {
    const infl: ContactLink = { ...link, kind: 'influences' }
    expect(describeLink(infl, 'c-anke')?.label).toBe('beeinflusst')
    expect(describeLink(infl, 'c-julia')?.label).toBe('wird beeinflusst von')
  })

  it('returns undefined for an unrelated viewpoint', () => {
    expect(describeLink(link, 'c-other')).toBeUndefined()
  })
})
