import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as ecc from 'tiny-secp256k1'

const bip32 = BIP32Factory(ecc)

export interface PhotonKeys {
  fingerprint: string        // 8 hex chars = first 4 bytes of BIP32 master fingerprint
  xpub_vanilla: string       // m/86'/1'/0' xpub
  xpub_colored: string       // m/86'/1'/1' xpub
  auth_pubkey_hex: string    // compressed pubkey at m/86'/1'/0'/0/0
  _authPrivkey: Uint8Array   // private key bytes (never persisted)
}

export async function derivePhotonKeys(mnemonic: string): Promise<PhotonKeys> {
  const seed = await bip39.mnemonicToSeed(mnemonic)
  const root = bip32.fromSeed(Buffer.from(seed))
  // vanilla and colored use BIP86 paths with coin_type=1 (regtest/testnet)
  const vanillaNode = root.derivePath("m/86'/1'/0'")
  const coloredNode = root.derivePath("m/86'/1'/1'")
  const authNode = root.derivePath("m/86'/1'/0'/0/0")
  return {
    fingerprint: Array.from(root.fingerprint).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8),
    xpub_vanilla: vanillaNode.neutered().toBase58(),
    xpub_colored: coloredNode.neutered().toBase58(),
    auth_pubkey_hex: Buffer.from(authNode.publicKey).toString('hex'),
    _authPrivkey: authNode.privateKey!,
  }
}
