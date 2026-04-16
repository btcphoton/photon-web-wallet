import * as ecc from 'tiny-secp256k1'
import type { PhotonKeys } from './photon-keys'

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const buf = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}

async function sha256Bytes(str: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(str)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(buf)
}

/**
 * Convert a compact 64-byte secp256k1 signature to DER encoding.
 * The Python backend (coincurve) expects DER-encoded signatures.
 */
function compactToDer(sig: Uint8Array): Uint8Array {
  let r = Array.from(sig.slice(0, 32))
  let s = Array.from(sig.slice(32, 64))

  // Strip leading zero bytes (but keep at least one byte)
  while (r.length > 1 && r[0] === 0) r.shift()
  while (s.length > 1 && s[0] === 0) s.shift()

  // Prepend 0x00 if high bit set (DER integers must be positive)
  if (r[0] >= 0x80) r.unshift(0)
  if (s[0] >= 0x80) s.unshift(0)

  const totalLen = 2 + r.length + 2 + s.length
  const der = new Uint8Array(2 + totalLen)
  let i = 0
  der[i++] = 0x30             // SEQUENCE
  der[i++] = totalLen
  der[i++] = 0x02             // INTEGER (r)
  der[i++] = r.length
  r.forEach(b => { der[i++] = b })
  der[i++] = 0x02             // INTEGER (s)
  der[i++] = s.length
  s.forEach(b => { der[i++] = b })
  return der
}

export async function buildPhotonHeaders(
  method: string,
  path: string,
  body: string,
  fingerprint: string,
  authPrivkey: Uint8Array,
): Promise<Record<string, string>> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2,'0')).join('')
  const timestamp = Math.floor(Date.now() / 1000).toString()

  // Hash the raw body bytes (empty string → hash of empty)
  const bodyBytes = new TextEncoder().encode(body || '')
  const bodyHash = await sha256Hex(bodyBytes)

  // Canonical format must match the Python backend exactly:
  // METHOD\nPATH\nBODY_SHA256\nFINGERPRINT\nNONCE\nTIMESTAMP
  const canonical = [method.toUpperCase(), path, bodyHash, fingerprint, nonce, timestamp].join('\n')

  // Hash the canonical message then sign — coincurve hashes internally so
  // we pre-hash once here and the backend's sha256(canonical) matches.
  const msgHash = await sha256Bytes(canonical)
  const compactSig = ecc.sign(msgHash, authPrivkey)

  // Convert compact 64-byte sig → DER (coincurve.verify expects DER)
  const derSig = compactToDer(compactSig)
  const sigHex = Array.from(derSig).map(b => b.toString(16).padStart(2,'0')).join('')

  return {
    'X-Photon-Fingerprint': fingerprint,
    'X-Photon-Nonce': nonce,
    'X-Photon-Timestamp': timestamp,
    'X-Photon-Signature': sigHex,
    'Content-Type': 'application/json',
  }
}

export async function photonFetch(
  baseUrl: string,
  method: string,
  path: string,
  body: object | null,
  keys: Pick<PhotonKeys, 'fingerprint' | '_authPrivkey'>,
): Promise<Response> {
  const bodyStr = body ? JSON.stringify(body) : ''
  const headers = await buildPhotonHeaders(method, path, bodyStr, keys.fingerprint, keys._authPrivkey)
  return fetch(baseUrl.replace(/\/$/, '') + path, {
    method,
    headers,
    body: bodyStr || undefined,
  })
}
