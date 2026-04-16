import { photonFetch } from './photon-auth'
import type { PhotonKeys } from './photon-keys'

const BASE_URL = 'https://airdrop.photonbolt.xyz'

export interface PhotonAsset {
  asset_id: string
  ticker: string
  name: string
  precision: number
  settled: number
  future: number
  spendable: number
}

export interface PhotonRegistryAsset {
  asset_id: string
  ticker: string
  name: string
  precision: number
  total_supply: number
}

export interface PhotonTransfer {
  idx: number
  kind: 'send' | 'receive' | string
  status: string
  txid: string | null
  recipient_id: string | null
  asset_id: string | null
  amount: number
  created_at: string
  updated_at: string
}

export interface PhotonUtxosBeginResponse {
  psbt: string
  num_utxos_to_create: number
}

export interface PhotonAirdropStatus {
  enabled: boolean
  asset_id: string
  amount: number
  max_supply: number
  total_claimed: number
  issuer_spendable: number
  claims_remaining: number
}

// Register wallet with backend (call once, 409 = already registered = OK)
export async function registerWallet(keys: PhotonKeys): Promise<{ fingerprint: string; funding_address: string; message: string }> {
  const body = {
    fingerprint: keys.fingerprint,
    xpub_vanilla: keys.xpub_vanilla,
    xpub_colored: keys.xpub_colored,
    vanilla_keychain: 0,
    auth_pubkey_hex: keys.auth_pubkey_hex,
  }
  const res = await photonFetch(BASE_URL, 'POST', '/register', body, keys)
  if (!res.ok && res.status !== 409) throw new Error(`Register failed: ${await res.text()}`)
  return res.json()
}

// Generate witness-mode RGB receive invoice
export async function generateRgbInvoice(
  keys: PhotonKeys,
  opts: { asset_id?: string; amount?: number; expiration_seconds?: number } = {}
): Promise<{ invoice: string; recipient_id: string; expiration_timestamp: number; mode: string }> {
  const body: Record<string, unknown> = {}
  if (opts.asset_id) body.asset_id = opts.asset_id
  if (opts.amount && opts.amount > 0) body.amount = opts.amount
  if (opts.expiration_seconds) body.expiration_seconds = opts.expiration_seconds
  const res = await photonFetch(BASE_URL, 'POST', '/receive', body, keys)
  if (!res.ok) throw new Error(`Receive failed: ${await res.text()}`)
  return res.json()
}

// Step 1: Build PSBT for RGB send
export async function buildTransferPsbt(
  keys: PhotonKeys,
  opts: { asset_id: string; invoice: string; amount: number; fee_rate: number; min_confirmations?: number }
): Promise<{ psbt: string; batch_transfer_idx: number; recipient_id: string; amount: number }> {
  const body = { ...opts, min_confirmations: opts.min_confirmations ?? 1 }
  const res = await photonFetch(BASE_URL, 'POST', '/transfer', body, keys)
  if (!res.ok) throw new Error(`Transfer failed: ${await res.text()}`)
  return res.json()
}

// Step 3: Broadcast signed PSBT
export async function broadcastTransfer(
  keys: PhotonKeys,
  signed_psbt: string
): Promise<{ txid: string; batch_transfer_idx: number }> {
  const res = await photonFetch(BASE_URL, 'POST', '/broadcast', { signed_psbt }, keys)
  if (!res.ok) throw new Error(`Broadcast failed: ${await res.text()}`)
  return res.json()
}

// List all RGB assets with balances
export async function listAssets(keys: PhotonKeys): Promise<{ assets: PhotonAsset[] }> {
  const res = await photonFetch(BASE_URL, 'GET', '/assets/list', null, keys)
  if (!res.ok) throw new Error(`List assets failed: ${await res.text()}`)
  return res.json()
}

// Public registry (no auth required)
export async function getAssetRegistry(): Promise<{ assets: PhotonRegistryAsset[]; count: number }> {
  const res = await fetch(`${BASE_URL}/assets/registry`)
  if (!res.ok) throw new Error(`Registry failed: ${await res.text()}`)
  return res.json()
}

// Get balance for a specific asset
export async function getAssetBalance(
  keys: PhotonKeys,
  asset_id: string
): Promise<{ asset_id: string; settled: number; future: number; spendable: number }> {
  const res = await photonFetch(BASE_URL, 'GET', `/balance?asset_id=${encodeURIComponent(asset_id)}`, null, keys)
  if (!res.ok) throw new Error(`Balance failed: ${await res.text()}`)
  return res.json()
}

// Get pending/settled transfers
export async function listPending(
  keys: PhotonKeys
): Promise<{ refreshed: boolean; transfers: PhotonTransfer[] }> {
  const res = await photonFetch(BASE_URL, 'GET', '/pending', null, keys)
  if (!res.ok) throw new Error(`Pending failed: ${await res.text()}`)
  return res.json()
}

// Issue RGB asset
export async function issueAsset(
  keys: PhotonKeys,
  opts: { ticker: string; name: string; precision: number; amounts: number[] }
): Promise<{ asset_id: string; ticker: string; name: string; precision: number; total_supply: number }> {
  const res = await photonFetch(BASE_URL, 'POST', '/issue', opts, keys)
  if (!res.ok) throw new Error(`Issue failed: ${await res.text()}`)
  return res.json()
}

// Step 1: Begin UTXO creation
export async function createUtxosBegin(
  keys: PhotonKeys,
  opts: { up_to?: boolean; num?: number; fee_rate: number; skip_sync?: boolean }
): Promise<PhotonUtxosBeginResponse> {
  const body = { up_to: opts.up_to ?? true, num: opts.num ?? 5, fee_rate: opts.fee_rate, skip_sync: opts.skip_sync ?? false }
  const res = await photonFetch(BASE_URL, 'POST', '/utxos/begin', body, keys)
  if (res.status === 409) return { psbt: '', num_utxos_to_create: 0 } // already enough UTXOs
  if (!res.ok) throw new Error(`UTXOs begin failed: ${await res.text()}`)
  return res.json()
}

// Step 3: End UTXO creation
export async function createUtxosEnd(
  keys: PhotonKeys,
  signed_psbt: string
): Promise<{ created: number }> {
  const res = await photonFetch(BASE_URL, 'POST', '/utxos/end', { signed_psbt, skip_sync: false }, keys)
  if (!res.ok) throw new Error(`UTXOs end failed: ${await res.text()}`)
  return res.json()
}

// Airdrop status (public)
export async function getAirdropStatus(): Promise<PhotonAirdropStatus> {
  const res = await fetch(`${BASE_URL}/airdrop/status`)
  if (!res.ok) throw new Error(`Airdrop status failed: ${await res.text()}`)
  return res.json()
}

// Claim airdrop (public)
export async function claimAirdrop(fingerprint: string): Promise<{ ok: boolean; txid: string; amount: number; asset_id: string }> {
  const res = await fetch(`${BASE_URL}/airdrop/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint }),
  })
  if (!res.ok) throw new Error(`Airdrop claim failed: ${await res.text()}`)
  return res.json()
}
