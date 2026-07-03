import type { ContactLink, ContactLinkKind } from './types'

/** German labels per link kind, from the source (forward) and target (inverse) viewpoint. */
export const LINK_KIND_LABEL: Record<ContactLinkKind, { forward: string; inverse: string }> = {
  reports_to: { forward: 'berichtet an', inverse: 'führt' },
  knows: { forward: 'kennt', inverse: 'kennt' },
  influences: { forward: 'beeinflusst', inverse: 'wird beeinflusst von' },
}

export const LINK_KIND_OPTIONS: { value: ContactLinkKind; label: string }[] = [
  { value: 'reports_to', label: 'berichtet an' },
  { value: 'knows', label: 'kennt' },
  { value: 'influences', label: 'beeinflusst' },
]

/**
 * Renders a link from one contact's viewpoint: who is the other person, and
 * what does the relationship read as from here ("berichtet an" vs "führt").
 */
export function describeLink(
  link: ContactLink,
  viewpointContactId: string,
): { otherContactId: string; label: string } | undefined {
  if (link.fromContactId === viewpointContactId) {
    return { otherContactId: link.toContactId, label: LINK_KIND_LABEL[link.kind].forward }
  }
  if (link.toContactId === viewpointContactId) {
    return { otherContactId: link.fromContactId, label: LINK_KIND_LABEL[link.kind].inverse }
  }
  return undefined
}
