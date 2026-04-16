import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as ecc from 'tiny-secp256k1'

const bip32 = BIP32Factory(ecc)

export interface PhotonKeys {
  fingerprint: string        // 8 hex chars = BIP32 master fingerprint
  xpub_vanilla: string       // m/86'/1'/0' xpub
  xpub_colored: string       // m/86'/1'/1' xpub
  auth_pubkey_hex: string    // compressed pubkey from PBKDF2 auth key
  _authPrivkey: Uint8Array   // PBKDF2-derived private key (never persisted)
}

/**
 * Derives the auth private key the same way the backend does:
 *   PBKDF2-HMAC-SHA256(password=mnemonic, salt="photonbolt/auth/v1", iterations=10000, dklen=32)
 */
async function deriveAuthKey(mnemonic: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(mnemonic),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode('photonbolt/auth/v1'),
      iterations: 10_000,
    },
    keyMaterial,
    256,  // 32 bytes
  )
  return new Uint8Array(bits)
}

export async function derivePhotonKeys(mnemonic: string): Promise<PhotonKeys> {
  const seed = await bip39.mnemonicToSeed(mnemonic)
  const root = bip32.fromSeed(Buffer.from(seed))

  const vanillaNode = root.derivePath("m/86'/1'/0'")
  const coloredNode = root.derivePath("m/86'/1'/1'")

  const authPrivkey = await deriveAuthKey(mnemonic)
  const authPubkey  = ecc.pointFromScalar(authPrivkey, true)  // compressed pubkey
  if (!authPubkey) throw new Error('Failed to derive auth pubkey')

  return {
    fingerprint:     Array.from(root.fingerprint).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8),
    xpub_vanilla:    vanillaNode.neutered().toBase58(),
    xpub_colored:    coloredNode.neutered().toBase58(),
    auth_pubkey_hex: Buffer.from(authPubkey).toString('hex'),
    _authPrivkey:    authPrivkey,
  }
}
