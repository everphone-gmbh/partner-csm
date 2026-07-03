import type { LinkedInInfo, LinkedInStatus } from './types'
import { safeLinkedInUrl } from './urls'

export interface Verifier {
  id: string
  name: string
}

/**
 * Business rule for the LinkedIn tri-state: the verifier attribution documents
 * who actually checked the account state, and when. It is only (re)stamped
 * when the checked state (status or URL) changes — an unrelated edit passes
 * the original attribution through untouched.
 *
 * `today` is injected (YYYY-MM-DD) to keep this pure and testable.
 */
export function buildLinkedInInfo(
  status: LinkedInStatus,
  url: string,
  prev: LinkedInInfo | undefined,
  verifier: Verifier,
  today: string,
): LinkedInInfo {
  const info: LinkedInInfo = { status }
  if (status === 'has_account') {
    // Only a valid https linkedin.com URL is stored (audit F-13).
    const safe = safeLinkedInUrl(url)
    if (safe) info.url = safe
  }
  if (status === 'unknown') return info

  const unchanged =
    prev !== undefined && prev.status === info.status && (prev.url ?? '') === (info.url ?? '')
  if (unchanged) {
    info.verifiedById = prev.verifiedById
    info.verifiedByName = prev.verifiedByName
    info.verifiedAt = prev.verifiedAt
  } else {
    info.verifiedById = verifier.id
    info.verifiedByName = verifier.name
    info.verifiedAt = today
  }
  return info
}
