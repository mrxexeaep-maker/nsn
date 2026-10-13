import { sha1 } from '@noble/hashes/legacy.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

/**
 * A key shaped as Figma's asset keys, 40 hex digits, derived from `seed` so the same seed always
 * gives the same key. The Figma clipboard names variables and collections by key; one made in
 * OpenPencil has none, so copying it gives it this one, and copying it again gives the same.
 */
export function derivedAssetKey(seed: string): string {
  return bytesToHex(sha1(utf8ToBytes(seed)))
}
