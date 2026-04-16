import * as ecc from 'tiny-secp256k1'
import type { PhotonKeys } from './photon-keys'

async function sha256Hex(str: string): Promise<string> {
  const data = new TextEncoder().encode(str)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}

async function sha256Bytes(str: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(str)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(buf)
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
  const bodyHash = await sha256Hex(body || '')
  // Canonical: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_HASH
  const canonical = [method.toUpperCase(), path, timestamp, nonce, bodyHash].join('\n')
  const msgHash = await sha256Bytes(canonical)
  const sig = ecc.sign(msgHash, authPrivkey)
  const sigHex = Array.from(sig).map(b => b.toString(16).padStart(2,'0')).join('')
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
