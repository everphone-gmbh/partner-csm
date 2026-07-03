/**
 * URL guards for user-entered links (audit F-13): free-text URL fields are a
 * stored-XSS/phishing vector when rendered as anchors. Validated on save AND
 * defensively at render — never rely on React's javascript:-warning alone.
 */

/** Returns the normalized URL if it parses and uses https, else undefined. */
export function safeHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:') return undefined
  return url.toString()
}

/** safeHttpsUrl, additionally pinned to linkedin.com (incl. subdomains). */
export function safeLinkedInUrl(value: string | undefined): string | undefined {
  const safe = safeHttpsUrl(value)
  if (!safe) return undefined
  const host = new URL(safe).hostname.toLowerCase()
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return safe
  return undefined
}
