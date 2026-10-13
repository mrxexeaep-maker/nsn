import { fromUint8Array } from 'js-base64'

/** Key order and absent fields do not change a fingerprint; bytes and URLs read as text. */
function canonical(value: unknown): unknown {
  if (value instanceof Uint8Array) return { bytes: fromUint8Array(value) }
  if (value instanceof ArrayBuffer) return { bytes: fromUint8Array(new Uint8Array(value)) }
  if (value instanceof URL) return value.href
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        // Code-point order, not locale order, so every machine agrees; keys are unique.
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([key, entry]) => [key, canonical(entry)])
    )
  }
  return value
}

/** `sha256:<hex>` of a value's canonical JSON. */
export async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
