import { getStorageData, setStorageData } from './storage'
import { findOrPrepareRgbTaprootUtxo } from './utxoManager'

const RGB_TRANSPORT_ENDPOINT = 'https://dev-proxy.photonbolt.xyz'

export interface StoredRgbSealSecret {
  id: string
  createdAt: string
  network: string
  assetId: string
  amount: number
  txid: string
  vout: number
  secret: string
  blindedSeal: string
  source: 'existing' | 'split'
}

export interface GeneratedBlindedSeal {
  blindedSeal: string
  secret: string
}

export interface ClientRgbInvoiceResult {
  invoice: string
  blindedSeal: string
  secret: string
  txid: string
  vout: number
  source: 'existing' | 'split'
}

function normalizeAssetId(assetId: string): string {
  const normalized = assetId.trim()
  if (!normalized) {
    throw new Error('An RGB asset contract ID is required.')
  }
  return normalized.replace(/^rgb:/i, '')
}

function createSecret64BitHex(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hashBuffer)).map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function loadStoredSealSecrets(): Promise<StoredRgbSealSecret[]> {
  const result = await getStorageData(['rgbSealSecrets'])
  const raw = result.rgbSealSecrets

  if (typeof raw !== 'string' || !raw.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as StoredRgbSealSecret[] : []
  } catch {
    return []
  }
}

async function persistSealSecret(entry: StoredRgbSealSecret): Promise<void> {
  const existing = await loadStoredSealSecrets()
  const next = [entry, ...existing].slice(0, 250)
  await setStorageData({
    rgbSealSecrets: JSON.stringify(next),
  })
}

export async function generateBlindedSeal(txid: string, vout: number): Promise<GeneratedBlindedSeal> {
  const secret = createSecret64BitHex()
  const blindedSeal = await sha256Hex(`${txid}:${vout}:${secret}`)

  return {
    blindedSeal,
    secret,
  }
}

export async function createRgbInvoice(assetId: string, amount: number): Promise<ClientRgbInvoiceResult> {
  const normalizedAssetId = normalizeAssetId(assetId)
  const numericAmount = Number.isFinite(amount) && amount >= 0 ? Math.trunc(amount) : 0
  const { txid, vout, source } = await findOrPrepareRgbTaprootUtxo()
  const { blindedSeal, secret } = await generateBlindedSeal(txid, vout)
  const { selectedNetwork } = await getStorageData(['selectedNetwork'])

  await persistSealSecret({
    id: `${txid}:${vout}:${secret}`,
    createdAt: new Date().toISOString(),
    network: selectedNetwork || 'mainnet',
    assetId: `rgb:${normalizedAssetId}`,
    amount: numericAmount,
    txid,
    vout,
    secret,
    blindedSeal,
    source,
  })

  return {
    invoice: `rgb:${normalizedAssetId}/RGB20/${numericAmount}+bc:utxob:${blindedSeal}?endpoints=${encodeURIComponent(RGB_TRANSPORT_ENDPOINT)}`,
    blindedSeal,
    secret,
    txid,
    vout,
    source,
  }
}

export function isValidRgbProxyUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
