import * as bip39 from 'bip39'
import * as bitcoin from 'bitcoinjs-lib'
import BIP32Factory from 'bip32'
import * as ecc from 'tiny-secp256k1'
import type { WalletNetwork } from './backend-config'
import { deriveBitcoinAddress, getBitcoinJsNetwork } from './bitcoin-address'
import { broadcastTransaction, estimateFee, performDiscoveryScan, type UTXO } from './bitcoin-transactions'
import { getStorageData } from './storage'

bitcoin.initEccLib(ecc)

const bip32 = BIP32Factory(ecc)
const RGB_SEAL_MIN_SATS = 2000
const RGB_SEAL_MAX_SATS = 5000
const RGB_SEAL_TARGET_SATS = 3000
const DEFAULT_SPLIT_FEE_RATE = 5

export interface PreparedRgbTaprootUtxo {
  txid: string
  vout: number
  value: number
  address: string
  derivationPath: string
  account: 'vanilla' | 'colored'
  chain: 0 | 1
  index: number
  source: 'existing' | 'split'
}

interface WalletContext {
  mnemonic: string
  network: WalletNetwork
  addressIndex: number
  coloredAddress: string
}

async function loadWalletContext(): Promise<WalletContext> {
  const result = await getStorageData([
    'mnemonic',
    'selectedNetwork',
    'addressIndex',
    'coloredAddress',
    'coloredAddress_mainnet',
    'coloredAddress_testnet3',
    'coloredAddress_testnet4',
    'coloredAddress_regtest',
  ])

  const mnemonic = typeof result.mnemonic === 'string' ? result.mnemonic.trim() : ''
  if (!mnemonic) {
    throw new Error('Wallet mnemonic is not available. Unlock the wallet and try again.')
  }

  const network = (result.selectedNetwork || 'mainnet') as WalletNetwork
  const addressIndex = Number(result.addressIndex || 0)
  const networkKey = `coloredAddress_${network}` as const
  const storedColoredAddress = result[networkKey]
  const coloredAddress =
    typeof storedColoredAddress === 'string' && storedColoredAddress.trim()
      ? storedColoredAddress.trim()
      : typeof result.coloredAddress === 'string'
        ? result.coloredAddress.trim()
        : ''

  if (!coloredAddress) {
    throw new Error('Colored account address is not available. Reopen the wallet and try again.')
  }

  return {
    mnemonic,
    network,
    addressIndex,
    coloredAddress,
  }
}

function sortCandidateUtxos(utxos: UTXO[]): UTXO[] {
  return [...utxos].sort((left, right) => {
    if (left.account !== right.account) {
      return left.account === 'colored' ? -1 : 1
    }

    const leftDistance = Math.abs(left.value - RGB_SEAL_TARGET_SATS)
    const rightDistance = Math.abs(right.value - RGB_SEAL_TARGET_SATS)
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance
    }

    return left.value - right.value
  })
}

function selectExistingSealUtxo(utxos: UTXO[]): UTXO | null {
  const candidates = sortCandidateUtxos(
    utxos.filter((utxo) => utxo.value >= RGB_SEAL_MIN_SATS && utxo.value <= RGB_SEAL_MAX_SATS)
  )

  return candidates[0] || null
}

function selectSplitSourceUtxo(utxos: UTXO[], feeRate: number): UTXO | null {
  const requiredWithChange = RGB_SEAL_TARGET_SATS + estimateFee(1, 2, feeRate) + 546
  const candidates = [...utxos]
    .filter((utxo) => utxo.value > requiredWithChange)
    .sort((left, right) => {
      if (left.account !== right.account) {
        return left.account === 'colored' ? -1 : 1
      }
      return left.value - right.value
    })

  return candidates[0] || null
}

async function broadcastSealSplitTransaction(context: WalletContext, sourceUtxo: UTXO, feeRate: number): Promise<string> {
  const btcNetwork = getBitcoinJsNetwork(context.network)
  const psbt = new bitcoin.Psbt({ network: btcNetwork })
  const seed = await bip39.mnemonicToSeed(context.mnemonic)
  const root = bip32.fromSeed(seed, btcNetwork)
  const child = root.derivePath(sourceUtxo.derivationPath)
  const internalPubkey = child.publicKey.slice(1, 33)

  psbt.addInput({
    hash: sourceUtxo.txid,
    index: sourceUtxo.vout,
    witnessUtxo: {
      value: BigInt(sourceUtxo.value),
      script: bitcoin.address.toOutputScript(sourceUtxo.address, btcNetwork),
    },
    tapInternalKey: internalPubkey,
  })

  psbt.addOutput({
    address: context.coloredAddress,
    value: BigInt(RGB_SEAL_TARGET_SATS),
  })

  const fee = estimateFee(1, 2, feeRate)
  const changeValue = sourceUtxo.value - RGB_SEAL_TARGET_SATS - fee

  if (changeValue <= 546) {
    throw new Error('No local UTXO is large enough to create a 3,000 sat RGB seal output with change.')
  }

  const changeAccountIndex = sourceUtxo.account === 'colored' ? 1 : 0
  const changeAddress = await deriveBitcoinAddress(
    context.mnemonic,
    context.network,
    86,
    changeAccountIndex,
    1,
    Math.max(context.addressIndex, sourceUtxo.index)
  )

  psbt.addOutput({
    address: changeAddress,
    value: BigInt(changeValue),
  })

  const tweak = bitcoin.crypto.taggedHash('TapTweak', internalPubkey)
  const tweakedSigner = child.tweak(tweak)
  psbt.signInput(0, tweakedSigner)
  psbt.finalizeAllInputs()

  const txHex = psbt.extractTransaction().toHex()
  return broadcastTransaction(txHex, context.network)
}

export async function findOrPrepareRgbTaprootUtxo(): Promise<PreparedRgbTaprootUtxo> {
  const context = await loadWalletContext()
  const { utxos } = await performDiscoveryScan(context.mnemonic, context.network, context.addressIndex)

  if (!utxos.length) {
    throw new Error('No Taproot UTXOs were found in the local wallet.')
  }

  const existingSeal = selectExistingSealUtxo(utxos)
  if (existingSeal) {
    return {
      ...existingSeal,
      source: 'existing',
    }
  }

  const splitSource = selectSplitSourceUtxo(utxos, DEFAULT_SPLIT_FEE_RATE)
  if (!splitSource) {
    throw new Error('No Taproot UTXO is large enough to prepare a dedicated RGB seal output.')
  }

  const txid = await broadcastSealSplitTransaction(context, splitSource, DEFAULT_SPLIT_FEE_RATE)

  return {
    txid,
    vout: 0,
    value: RGB_SEAL_TARGET_SATS,
    address: context.coloredAddress,
    derivationPath: splitSource.derivationPath,
    account: 'colored',
    chain: 0,
    index: context.addressIndex,
    source: 'split',
  }
}
