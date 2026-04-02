import * as bip39 from 'bip39'
import * as bitcoin from 'bitcoinjs-lib'
import BIP32Factory from 'bip32'
import * as ecc from 'tiny-secp256k1'
import { deriveBitcoinAddress, getBitcoinJsNetwork } from '../utils/bitcoin-address'
import {
  broadcastTransaction,
  estimateFee,
  fetchLiveFees,
  performDiscoveryScan,
  signAndSendVanilla,
  type UTXO,
} from '../utils/bitcoin-transactions'
import {
  isAllowedOrigin,
  isValidBitcoinAddress,
  satoshisToBtc,
  type Network,
  type WalletAsset,
} from '../utils/dapp-bridge'
import { getNetworkAssetsKey, getStorageData, setStorageData } from '../utils/storage'
import { PHOTON_REGTEST_API_BASE } from '../utils/backend-config'

bitcoin.initEccLib(ecc)

const CONNECTIONS_STORAGE_KEY = 'photon_connected_dapps'
const MESSAGE_SIGNATURE_TYPE = 'photon-schnorr-sha256-v1'
const MAX_MESSAGE_BYTES = 1024

export interface ApprovalRequest {
  type: 'connect' | 'signTransaction' | 'signMessage' | 'sendTransaction' | 'sendBtcFunding' | 'payRgbInvoice'
  origin: string
  tabId?: number
  data: Record<string, unknown>
}

export interface ApprovalResult {
  approved: boolean
  reason?: string
}

interface ConnectionRecord {
  approved: boolean
  timestamp: number
  network: Network
}

interface WalletContext {
  mnemonic?: string
  network: Network
  address: string
  balance: string
  addressIndex: number
  changeIndex: number
}

interface PreparedTransaction {
  txHex: string
  amountSats: bigint
  amountBtc: string
  feeRate: number
  estimatedFeeSats: number
  estimatedFeeBtc: string
  totalSpendSats: bigint
  totalSpendBtc: string
  inputCount: number
  totalInputSats: bigint
  totalInputBtc: string
  changeSats: bigint
  changeBtc: string
  hasChange: boolean
  changeAddress: string | null
  network: Network
  senderAddress: string
  recipientAddress: string
  nextChangeIndex: number
  maxDiscoveredIndex: number
}

const bip32 = BIP32Factory(ecc)

export const loadConnections = async (): Promise<Record<string, ConnectionRecord>> => {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONNECTIONS_STORAGE_KEY, (result) => {
      resolve((result[CONNECTIONS_STORAGE_KEY] || {}) as Record<string, ConnectionRecord>)
    })
  })
}

export const saveConnections = async (connections: Record<string, ConnectionRecord>): Promise<void> => {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CONNECTIONS_STORAGE_KEY]: connections }, () => resolve())
  })
}

export const isConnectedOrigin = async (origin: string): Promise<boolean> => {
  const connections = await loadConnections()
  return Boolean(connections[origin]?.approved)
}

export const removeConnection = async (origin: string): Promise<void> => {
  const connections = await loadConnections()
  delete connections[origin]
  await saveConnections(connections)
}

export const approveConnection = async (origin: string, network: Network): Promise<void> => {
  const connections = await loadConnections()
  connections[origin] = {
    approved: true,
    timestamp: Date.now(),
    network,
  }
  await saveConnections(connections)
}

export const loadWalletContext = async (): Promise<WalletContext> => {
  const result = await getStorageData([
    'mnemonic',
    'selectedNetwork',
    'walletAddress',
    'walletBalance',
    'addressIndex',
    'changeIndex_mainnet',
    'changeIndex_testnet3',
    'changeIndex_testnet4',
    'changeIndex_regtest',
  ])

  const network = ((result.selectedNetwork as Network) || 'mainnet') as Network
  const changeIndexKey = `changeIndex_${network}` as keyof typeof result
  const addressIndex = Number(result.addressIndex || 0)
  const changeIndex = Number(result[changeIndexKey] || 0)
  const mnemonic = typeof result.mnemonic === 'string' ? result.mnemonic.trim() : ''
  let address = typeof result.walletAddress === 'string' ? result.walletAddress.trim() : ''

  if (!address && mnemonic) {
    address = await deriveBitcoinAddress(mnemonic, network, 86, 0, 0, addressIndex)
  }

  return {
    mnemonic: mnemonic || undefined,
    network,
    address,
    balance: typeof result.walletBalance === 'string' ? result.walletBalance : '0.00000000',
    addressIndex,
    changeIndex,
  }
}

export const getRegtestExtensionWalletKey = async (): Promise<string> => {
  const storedIdentity = await getStorageData([
    'principalId',
    'btcAddress_regtest',
    'walletAddress_regtest',
    'coloredAddress_regtest',
    'btcAddress',
    'walletAddress',
    'coloredAddress',
  ])
  const activeRegtestAddress =
    storedIdentity.walletAddress_regtest ||
    storedIdentity.btcAddress_regtest ||
    storedIdentity.coloredAddress_regtest ||
    storedIdentity.walletAddress ||
    storedIdentity.btcAddress ||
    storedIdentity.coloredAddress
  const stableId =
    activeRegtestAddress ||
    storedIdentity.principalId ||
    'anonymous'
  return `extension-${stableId}-regtest`
}

export const requireUnlockedWallet = async (): Promise<WalletContext> => {
  const context = await loadWalletContext()
  if (!context.address) {
    throw new Error('Wallet address is not available. Open the wallet first.')
  }
  if (!context.mnemonic) {
    throw new Error('Wallet is locked. Unlock the wallet and try again.')
  }
  if (!bip39.validateMnemonic(context.mnemonic)) {
    throw new Error('Wallet mnemonic is invalid.')
  }
  return context
}

const resolveSigningAddressIndex = async (context: WalletContext): Promise<number> => {
  const fallbackIndex = Math.max(0, Number(context.addressIndex || 0))
  const currentAddress = typeof context.address === 'string' ? context.address.trim() : ''

  if (!currentAddress || !context.mnemonic) {
    return fallbackIndex
  }

  const derivedAtFallback = await deriveBitcoinAddress(context.mnemonic, context.network, 86, 0, 0, fallbackIndex)
  if (derivedAtFallback === currentAddress) {
    return fallbackIndex
  }

  for (let index = 0; index <= fallbackIndex; index += 1) {
    const candidate = await deriveBitcoinAddress(context.mnemonic, context.network, 86, 0, 0, index)
    if (candidate === currentAddress) {
      return index
    }
  }

  return fallbackIndex
}

export const getLiveBalance = async (origin: string): Promise<{ balance: string; network: Network }> => {
  if (!(await isConnectedOrigin(origin))) {
    throw new Error('Not connected. Please call connect() first.')
  }

  const context = await loadWalletContext()
  if (!context.address) {
    throw new Error('Wallet address is not available.')
  }

  if (!context.mnemonic) {
    return {
      balance: context.balance || '0.00000000',
      network: context.network,
    }
  }

  const scanIndex = Math.max(context.addressIndex, context.changeIndex)
  const { totalBalance, maxIndex } = await performDiscoveryScan(context.mnemonic, context.network, scanIndex)
  const balance = (totalBalance / 100000000).toFixed(8)

  const updates: Record<string, unknown> = {
    walletBalance: balance,
  }

  if (maxIndex > context.addressIndex) {
    updates.addressIndex = maxIndex
    updates[`addressIndex_${context.network}`] = maxIndex
  }

  await setStorageData(updates)

  return {
    balance,
    network: context.network,
  }
}

export const getStoredAssetsForOrigin = async (origin: string): Promise<{ assets: WalletAsset[]; network: Network }> => {
  if (!(await isConnectedOrigin(origin))) {
    throw new Error('Not connected. Please call connect() first.')
  }

  const context = await loadWalletContext()
  const assetsKey = getNetworkAssetsKey(context.network)
  const result = await getStorageData([assetsKey])
  const rawAssets = result[assetsKey]

  if (!rawAssets || typeof rawAssets !== 'string') {
    return { assets: [], network: context.network }
  }

  try {
    const parsed = JSON.parse(rawAssets) as WalletAsset[]
    return {
      assets: Array.isArray(parsed) ? parsed : [],
      network: context.network,
    }
  } catch {
    return { assets: [], network: context.network }
  }
}

export const getStoredAssetBalanceForOrigin = async (
  origin: string,
  assetId: string,
): Promise<{ assetId: string; balance: string; asset: WalletAsset | null; network: Network }> => {
  const normalizedAssetId = assetId.trim()
  if (!normalizedAssetId) {
    throw new Error('assetId is required.')
  }

  const { assets, network } = await getStoredAssetsForOrigin(origin)
  const matchedAsset = assets.find((asset) => {
    const candidates = [
      asset.id,
      asset.ticker,
      asset.unit,
      asset.name,
      asset.assetId,
      asset.contractId,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())

    return candidates.includes(normalizedAssetId.toLowerCase())
  }) || null

  if (!matchedAsset) {
    throw new Error(`Asset ${normalizedAssetId} is not available in the active wallet.`)
  }

  return {
    assetId: normalizedAssetId,
    balance: String(matchedAsset.amount ?? '0'),
    asset: matchedAsset,
    network,
  }
}

const buildAssetIdFromTicker = (ticker: string): string => {
  return ticker.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const pickImportedAssetColor = (ticker: string): string => {
  return ticker.trim().toUpperCase() === 'PHO' ? '#38bdf8' : '#f8fafc'
}

export const importAssetForOrigin = async (
  origin: string,
  params: Record<string, unknown>,
): Promise<{ asset: WalletAsset; network: Network; imported: boolean; alreadyImported: boolean }> => {
  if (!(await isConnectedOrigin(origin))) {
    throw new Error('Not connected. Please call connect() first.')
  }

  const context = await loadWalletContext()
  if (context.network !== 'regtest') {
    throw new Error('importAsset is currently supported only on regtest.')
  }

  const rawIdentifier =
    (typeof params.contractId === 'string' && params.contractId.trim()) ||
    (typeof params.assetId === 'string' && params.assetId.trim()) ||
    (typeof params.ticker === 'string' && params.ticker.trim()) ||
    (typeof params.name === 'string' && params.name.trim()) ||
    ''

  if (!rawIdentifier) {
    throw new Error('contractId, assetId, ticker, or name is required.')
  }

  const response = await fetch(`${PHOTON_REGTEST_API_BASE}/rgb/registry`)
  const payload = await response.json()
  if (!response.ok || !payload.ok || !Array.isArray(payload.assets)) {
    throw new Error(payload?.error || 'Failed to load the Photon RGB registry.')
  }

  const normalizedIdentifier = rawIdentifier.toLowerCase()
  const registryMatch = payload.assets.find((entry: any) => (
    String(entry.contract_id || '').toLowerCase() === normalizedIdentifier ||
    String(entry.ticker || '').toLowerCase() === normalizedIdentifier ||
    String(entry.token_name || '').toLowerCase() === normalizedIdentifier
  ))

  if (!registryMatch) {
    throw new Error(`Asset ${rawIdentifier} was not found in the Photon RGB registry.`)
  }

  const assetsKey = getNetworkAssetsKey(context.network)
  const contractsKey = `rgbContracts_${context.network}` as const
  const result = await getStorageData([assetsKey, contractsKey])
  const storedAssetsRaw = result[assetsKey]
  const storedContractsRaw = result[contractsKey]
  const storedAssets = typeof storedAssetsRaw === 'string'
    ? JSON.parse(storedAssetsRaw) as WalletAsset[]
    : []
  const storedContracts = typeof storedContractsRaw === 'string'
    ? JSON.parse(storedContractsRaw) as Record<string, string>
    : {}

  const assetId = buildAssetIdFromTicker(String(registryMatch.ticker || 'asset'))
  const importedAsset: WalletAsset = {
    id: assetId,
    name: String(registryMatch.token_name || registryMatch.ticker || assetId),
    amount: '0',
    unit: String(registryMatch.ticker || assetId),
    ticker: String(registryMatch.ticker || assetId),
    contractId: String(registryMatch.contract_id || ''),
    assetId: String(registryMatch.contract_id || ''),
    color: pickImportedAssetColor(String(registryMatch.ticker || '')),
  }

  const alreadyImported = storedAssets.some((asset) => asset.id === assetId)
  const updatedAssets = alreadyImported
    ? storedAssets.map((asset) => asset.id === assetId ? { ...asset, ...importedAsset } : asset)
    : [...storedAssets, importedAsset]
  const updatedContracts = {
    ...storedContracts,
    [assetId]: String(registryMatch.contract_id || ''),
  }

  await setStorageData({
    [assetsKey]: JSON.stringify(updatedAssets),
    [contractsKey]: JSON.stringify(updatedContracts),
  })

  return {
    asset: importedAsset,
    network: context.network,
    imported: true,
    alreadyImported,
  }
}

const parseAmountToSats = (params: Record<string, unknown>): bigint => {
  const amountSatsValue = params.amountSats
  if (amountSatsValue !== undefined && amountSatsValue !== null && String(amountSatsValue).trim() !== '') {
    const sats = BigInt(String(amountSatsValue))
    if (sats <= 0n) {
      throw new Error('Amount must be greater than zero.')
    }
    return sats
  }

  const btcValue = params.amountBtc ?? params.amount
  if (btcValue === undefined || btcValue === null || String(btcValue).trim() === '') {
    throw new Error('Amount is required.')
  }

  const parsed = Number.parseFloat(String(btcValue))
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Invalid amount.')
  }

  return BigInt(Math.floor(parsed * 100000000))
}

const parseFeeRate = async (params: Record<string, unknown>, network: Network): Promise<number> => {
  const raw = params.feeRate
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const feeRate = Number.parseFloat(String(raw))
    if (!Number.isFinite(feeRate) || feeRate <= 0) {
      throw new Error('Invalid feeRate.')
    }
    return feeRate
  }

  const fees = await fetchLiveFees(network)
  return Math.max(Number(fees.average || fees.fast || 3), 1)
}

const normalizeTransactionParams = async (
  params: Record<string, unknown>,
  context: WalletContext,
): Promise<{ recipientAddress: string; amountSats: bigint; feeRate: number }> => {
  const recipientAddress = typeof params.to === 'string' ? params.to.trim() : ''
  if (!recipientAddress) {
    throw new Error('Recipient address is required.')
  }
  if (!isValidBitcoinAddress(recipientAddress, context.network)) {
    throw new Error(`Invalid recipient address for ${context.network}.`)
  }

  const requestedNetwork = typeof params.network === 'string' ? params.network.trim() : ''
  if (requestedNetwork && requestedNetwork !== context.network) {
    throw new Error(`Requested network ${requestedNetwork} does not match active wallet network ${context.network}.`)
  }

  const amountSats = parseAmountToSats(params)
  const feeRate = await parseFeeRate(params, context.network)

  return {
    recipientAddress,
    amountSats,
    feeRate,
  }
}

const collectVanillaUtxos = (utxos: UTXO[]): UTXO[] => {
  return utxos
    .filter((utxo) => utxo.account === 'vanilla')
    .map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      address: utxo.address,
      derivationPath: utxo.derivationPath,
      account: 'vanilla',
      chain: utxo.chain,
      index: utxo.index,
    }))
}

export const prepareTransaction = async (
  origin: string,
  params: Record<string, unknown>,
): Promise<PreparedTransaction> => {
  if (!(await isConnectedOrigin(origin))) {
    throw new Error('Not connected. Please call connect() first.')
  }

  const context = await requireUnlockedWallet()
  const { recipientAddress, amountSats, feeRate } = await normalizeTransactionParams(params, context)

  const scanIndex = Math.max(context.addressIndex, context.changeIndex)
  const { utxos, maxIndex } = await performDiscoveryScan(context.mnemonic!, context.network, scanIndex)
  const vanillaUtxos = collectVanillaUtxos(utxos)

  if (vanillaUtxos.length === 0) {
    throw new Error('No spendable Vanilla UTXOs available.')
  }

  const totalInputSats = vanillaUtxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n)
  const estimatedFeeWithChangeSats = estimateFee(vanillaUtxos.length, 2, feeRate)
  const totalSpendWithChangeSats = amountSats + BigInt(estimatedFeeWithChangeSats)
  const changeWithChangeSats = totalInputSats - totalSpendWithChangeSats
  const estimatedFeeNoChangeSats = estimateFee(vanillaUtxos.length, 1, feeRate)
  const totalSpendNoChangeSats = amountSats + BigInt(estimatedFeeNoChangeSats)
  const changeNoChangeSats = totalInputSats - totalSpendNoChangeSats

  const useNoChange = changeWithChangeSats <= 546n && changeNoChangeSats >= 0n
  const estimatedFeeSats = useNoChange ? estimatedFeeNoChangeSats : estimatedFeeWithChangeSats
  const totalSpendSats = amountSats + BigInt(estimatedFeeSats)
  const changeSats = totalInputSats - totalSpendSats

  if (changeSats < 0n) {
    throw new Error(`Insufficient funds. Need ${satoshisToBtc(Number(totalSpendSats))} BTC including fees.`)
  }

  const hasChange = !useNoChange && changeSats > 546n
  const changeAddress = hasChange
    ? await deriveBitcoinAddress(context.mnemonic!, context.network, 86, 0, 1, context.changeIndex)
    : null

  const txHex = await signAndSendVanilla(
    context.mnemonic!,
    vanillaUtxos,
    recipientAddress,
    amountSats,
    feeRate,
    context.network,
    context.changeIndex,
    {
      consumeAllNoChange: useNoChange,
    }
  )

  if (maxIndex > context.addressIndex) {
    await setStorageData({
      addressIndex: maxIndex,
      [`addressIndex_${context.network}`]: maxIndex,
    })
  }

  return {
    txHex,
    amountSats,
    amountBtc: satoshisToBtc(Number(amountSats)),
    feeRate,
    estimatedFeeSats,
    estimatedFeeBtc: satoshisToBtc(estimatedFeeSats),
    totalSpendSats,
    totalSpendBtc: satoshisToBtc(Number(totalSpendSats)),
    inputCount: vanillaUtxos.length,
    totalInputSats,
    totalInputBtc: satoshisToBtc(Number(totalInputSats)),
    changeSats: changeSats > 0n ? changeSats : 0n,
    changeBtc: satoshisToBtc(Number(changeSats > 0n ? changeSats : 0n)),
    hasChange,
    changeAddress,
    network: context.network,
    senderAddress: context.address,
    recipientAddress,
    nextChangeIndex: context.changeIndex + 1,
    maxDiscoveredIndex: maxIndex,
  }
}

export const executeSendTransaction = async (prepared: PreparedTransaction): Promise<{ txId: string }> => {
  const txId = await broadcastTransaction(prepared.txHex, prepared.network)

  await setStorageData({
    [`changeIndex_${prepared.network}`]: prepared.nextChangeIndex,
    walletBalance: prepared.hasChange
      ? satoshisToBtc(Number(prepared.totalInputSats - prepared.amountSats - BigInt(prepared.estimatedFeeSats)))
      : '0.00000000',
  })

  return { txId }
}

const encodeUtf8 = (value: string): Uint8Array => new TextEncoder().encode(value)

const buildMessageDigest = async (message: string): Promise<Buffer> => {
  const payload = encodeUtf8(`Photon Signed Message:\n${message}`)
  const digestInput = new Uint8Array(payload.byteLength)
  digestInput.set(payload)
  const digest = await crypto.subtle.digest('SHA-256', digestInput)
  return Buffer.from(digest)
}

export const signMessageForOrigin = async (
  origin: string,
  params: Record<string, unknown>,
): Promise<{ signature: string; address: string; signatureType: string; network: Network }> => {
  if (!(await isConnectedOrigin(origin))) {
    throw new Error('Not connected. Please call connect() first.')
  }

  const context = await requireUnlockedWallet()
  const message = typeof params.message === 'string' ? params.message : ''
  if (!message.trim()) {
    throw new Error('Message is required.')
  }

  const bytes = encodeUtf8(message)
  if (bytes.byteLength > MAX_MESSAGE_BYTES) {
    throw new Error(`Message is too large. Maximum size is ${MAX_MESSAGE_BYTES} bytes.`)
  }

  const signingIndex = await resolveSigningAddressIndex(context)
  const signingAddress = await deriveBitcoinAddress(context.mnemonic!, context.network, 86, 0, 0, signingIndex)
  const seed = await bip39.mnemonicToSeed(context.mnemonic!)
  const root = bip32.fromSeed(seed, getBitcoinJsNetwork(context.network))
  const coinType = context.network === 'mainnet' ? 0 : 1
  const derivationPath = `m/86'/${coinType}'/0'/0/${signingIndex}`
  const child = root.derivePath(derivationPath)
  const internalPubkey = child.publicKey.slice(1, 33)
  const tweak = bitcoin.crypto.taggedHash('TapTweak', internalPubkey)
  const tweakedSigner = child.tweak(tweak) as typeof child

  if (!tweakedSigner.privateKey) {
    throw new Error('Unable to access the active account private key.')
  }

  const digest = await buildMessageDigest(message)
  const signature = ecc.signSchnorr(digest, tweakedSigner.privateKey)

  return {
    signature: Buffer.from(signature).toString('hex'),
    address: signingAddress,
    signatureType: MESSAGE_SIGNATURE_TYPE,
    network: context.network,
  }
}

export const buildConnectApproval = async (origin: string): Promise<ApprovalRequest['data']> => {
  if (!isAllowedOrigin(origin)) {
    throw new Error(`Origin ${origin} is not allowed.`)
  }

  const context = await loadWalletContext()
  if (!context.address) {
    throw new Error('Wallet address is not available. Open the wallet first.')
  }

  return {
    domain: new URL(origin).hostname,
    origin,
    address: context.address,
    network: context.network,
  }
}
