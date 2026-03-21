import { useState, useEffect, useRef, type ReactNode } from 'react'
import './App.css'
import { generateMnemonic, deriveIdentity, validateMnemonic } from './utils/crypto'
import { getBtcAddress, getWalletAddress, updateBalance, mapNetworkToCanister, getUtxos, getEstimatedBitcoinFees, sendBitcoin } from './utils/icp'
import { deriveBitcoinAddress, isLikelyRegtestAddress } from './utils/bitcoin-address'
import { signAndSendVanilla, signAndUnlockUtxo, broadcastTransaction, fetchUTXOsFromBlockchain, performDiscoveryScan, fetchLiveFees, estimateFee, type UTXO } from './utils/bitcoin-transactions'
import type { UtxoWithRgbStatus } from './utils/rgb'
import { fetchRgbOccupiedUtxos } from './utils/rgb-fetcher'
import { getCkBTCBalance } from './utils/icrc1'
import { convertLBTCtoBTC } from './utils/ckbtc-withdrawal'
import { getErrorLogs, clearErrorLogs, type ErrorLog } from './utils/error-logger'
import { getStorageData, setStorageData, removeStorageData, getNetworkAddressKey, getNetworkAssetsKey, getNetworkContractsKey, testnet3DefaultAssets, mainnetDefaultAssets, type StorageData } from './utils/storage'
import type { Asset } from './utils/storage'
import { BACKEND_PROFILES, DEFAULT_BACKEND_PROFILE_ID, getBackendProfileById, getDefaultElectrumServer, getDefaultRgbProxy, type BackendProfileId } from './utils/backend-config'
import { QRCodeSVG } from 'qrcode.react'
import { createRgbInvoice } from './utils/rgb-invoice'
import { createRegtestLightningInvoice, createRegtestRgbInvoice, decodeRegtestLightningInvoice, decodeRegtestRgbInvoice, fetchRegtestRgbBalance, fetchRegtestRgbRegistry, fetchRegtestRgbTransfers, mineRegtestBlocks, payRegtestLightningInvoice, registerRgbInvoiceSecret, sendRegtestRgbInvoice } from './utils/rgb-wallet'
import { LightningAnimation } from './components/LightningAnimation'
import { fetchBtcActivities, type BitcoinActivity } from './utils/bitcoin-activities'


type View = 'welcome' | 'unlock' | 'lock' | 'forgot' | 'create' | 'verify' | 'password' | 'restore' | 'dashboard' | 'receive' | 'receive-btc' | 'receive-rgb' | 'receive-lightning' | 'convert-lightning' | 'add-assets' | 'settings' | 'user-settings' | 'auto-lock-settings' | 'network-settings' | 'swap' | 'send' | 'send-amount' | 'send-confirm' | 'send-success' | 'utxos' | 'create-rgb-utxo' | 'create-utxo-confirm' | 'unlock-rgb-utxo' | 'unlock-utxo-confirm' | 'utxo-action-success' | 'faucet' | 'error-logs'
type Tab = 'assets' | 'activities'
type Network = 'mainnet' | 'testnet3' | 'testnet4' | 'regtest'

interface NetworkInfo {
  id: Network
  name: string
  color: string
  enabled: boolean
}

const networks: NetworkInfo[] = [
  { id: 'mainnet', name: 'Bitcoin mainnet', color: '#f7931a', enabled: true },
  { id: 'testnet3', name: 'Bitcoin testnet 3', color: '#22c55e', enabled: true },
  { id: 'testnet4', name: 'Bitcoin Testnet 4', color: '#8b5cf6', enabled: true }, // ENABLED
  { id: 'regtest', name: 'Bitcoin regtest', color: '#3b82f6', enabled: true },
]

interface VerifyWord {
  position: number
  word: string
  userInput: string
}

interface ImportableAsset {
  asset: Asset
  aliases: string[]
  contracts?: Partial<Record<Network, string>>
}

const buildAssetIdFromTicker = (ticker: string) => {
  return ticker.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const formatBtcAmount = (sats: number | string | bigint, decimals = 6) => {
  const btc = Number(sats) / 100000000
  if (Number.isNaN(btc)) return '0'
  const fixed = btc.toFixed(decimals)
  return fixed.replace(/\.0+$|0+$/g, '').replace(/\.$/, '')
}

const formatBtcValue = (btcAmount: number | string, decimals = 8) => {
  const btc = Number(btcAmount)
  if (Number.isNaN(btc)) return '0'
  const fixed = btc.toFixed(decimals)
  return fixed.replace(/\.0+$|0+$/g, '').replace(/\.$/, '')
}

const isLightningInvoice = (value: string) => /^ln/i.test(value.trim())
const isRgbInvoice = (value: string) => /^rgb:/i.test(value.trim())
const isBlindSealReference = (value: string) => /^bcrt:utxob:/i.test(value.trim())

// Generate 5 random unique positions from 1-12
const getRandomPositions = (): number[] => {
  const positions: number[] = []
  while (positions.length < 5) {
    const rand = Math.floor(Math.random() * 12)
    if (!positions.includes(rand)) {
      positions.push(rand)
    }
  }
  return positions.sort((a, b) => a - b)
}

const REGTEST_PHO_CONTRACT_ID = 'rgb:2Mhfmuc0-BqWCUwP-kkJKF_V-F1~L4j6-A1_W6Yy-hK6Z~rA'
const REGTEST_LIGHT_CONTRACT_ID = 'rgb:WDJM8Vmw-Gnipws~-5i7T1Hh-~v028f1-FUW_OqC-1ClqyPk'
const PHOTON_PRICE_API = 'https://faucet.photonbolt.xyz/api/market/btc-usd'

const importableAssets: ImportableAsset[] = [
  {
    asset: {
      id: 'pho',
      name: 'Photon Token',
      amount: '0',
      unit: 'PHO',
      color: '#38bdf8',
    },
    aliases: [
      'pho',
      'photon',
      'photon token',
      REGTEST_PHO_CONTRACT_ID.toLowerCase(),
    ],
    contracts: {
      regtest: REGTEST_PHO_CONTRACT_ID,
    },
  },
  {
    asset: {
      id: 'light',
      name: 'LIGHT Token',
      amount: '0',
      unit: 'LIGHT',
      color: '#f8fafc',
    },
    aliases: [
      'light',
      'light token',
      REGTEST_LIGHT_CONTRACT_ID.toLowerCase(),
    ],
    contracts: {
      regtest: REGTEST_LIGHT_CONTRACT_ID,
    },
  },
]

function WalletHeaderButton({
  ariaLabel,
  onClick,
  children,
  className = '',
  title,
}: {
  ariaLabel: string
  onClick: () => void
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <button
      className={`wallet-header-btn ${className}`.trim()}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title || ariaLabel}
      type="button"
    >
      {children}
    </button>
  )
}

function WalletStatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'positive' | 'warning'
}) {
  return (
    <div className={`wallet-stat-card wallet-stat-${tone}`}>
      <span className="wallet-stat-label">{label}</span>
      <span className="wallet-stat-value">{value}</span>
    </div>
  )
}


function App() {
  const [view, setView] = useState<View>('welcome')
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([])
  const [mnemonic, setMnemonic] = useState<string>('')
  const [principalId, setPrincipalId] = useState<string>('')
  const [restoreInput, setRestoreInput] = useState<string>('gasp attitude little organ palm crime layer answer dial twelve feed meadow')
  const [error, setError] = useState<string>('')
  const [activeTab, setActiveTab] = useState<Tab>('assets')

  // Two-address system states
  const [walletAddress, setWalletAddress] = useState<string>('') // Main BTC wallet address
  const [lightningAddress, setLightningAddress] = useState<string>('') // ckBTC/Lightning address
  const [btcAddress, setBtcAddress] = useState<string>('') // Deprecated, keeping for backward compatibility

  const [loadingAddress, setLoadingAddress] = useState<boolean>(false)
  const [loadingExpand, setLoadingExpand] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)
  const [copiedPrincipal, setCopiedPrincipal] = useState<boolean>(false)
  const [mnemonicCopied, setMnemonicCopied] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Verification states
  const [verifyWords, setVerifyWords] = useState<VerifyWord[]>([])

  // Password states
  const [password, setPassword] = useState<string>('')
  const [confirmPassword, setConfirmPassword] = useState<string>('')
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false)

  // Unlock password state
  const [unlockPassword, setUnlockPassword] = useState<string>('')
  const [showUnlockPassword, setShowUnlockPassword] = useState<boolean>(false)

  // Notice modal state
  const [showNoticeModal, setShowNoticeModal] = useState<boolean>(false)

  // Menu dropdown state
  const [showMenu, setShowMenu] = useState<boolean>(false)

  // Network modal state
  const [showNetworkModal, setShowNetworkModal] = useState<boolean>(false)
  const [selectedNetwork, setSelectedNetwork] = useState<Network>('mainnet')

  // Balance info popup state
  const [showBalanceInfo, setShowBalanceInfo] = useState<boolean>(false)

  // RGB receive state
  const [rgbAsset, setRgbAsset] = useState<string>('')
  const [rgbAmount, setRgbAmount] = useState<string>('')
  const [rgbInvoiceStep, setRgbInvoiceStep] = useState<'form' | 'invoice'>('form')
  const [rgbInvoice, setRgbInvoice] = useState<string>('')
  const [rgbGenerating, setRgbGenerating] = useState<boolean>(false)
  const [rgbError, setRgbError] = useState<string>('')
  const [rgbWalletOnline, setRgbWalletOnline] = useState<boolean>(false)
  const [openAmount, setOpenAmount] = useState<boolean>(false)
  const [rgbCopied, setRgbCopied] = useState<boolean>(false)
  const [lightningReceiveAsset, setLightningReceiveAsset] = useState<string>('pho')
  const [lightningReceiveAmount, setLightningReceiveAmount] = useState<string>('1')
  const [lightningReceiveInvoice, setLightningReceiveInvoice] = useState<string>('')
  const [lightningReceiveStep, setLightningReceiveStep] = useState<'form' | 'invoice'>('form')
  const [lightningReceiveGenerating, setLightningReceiveGenerating] = useState<boolean>(false)
  const [lightningReceiveError, setLightningReceiveError] = useState<string>('')
  const [lightningReceiveCopied, setLightningReceiveCopied] = useState<boolean>(false)

  // Network-specific assets
  const [assets, setAssets] = useState<Asset[]>([])

  // Bitcoin activities state
  const [activities, setActivities] = useState<BitcoinActivity[]>([])
  const [loadingActivities, setLoadingActivities] = useState<boolean>(false)

  // Add asset state
  const [tokenInput, setTokenInput] = useState<string>('')
  const [addAssetError, setAddAssetError] = useState<string>('')
  const [addAssetSuccess, setAddAssetSuccess] = useState<string>('')
  const [importingAsset, setImportingAsset] = useState<boolean>(false)

  // Balance states for two-address system
  const [btcBalance, setBtcBalance] = useState<string>('0.00000000') // Wallet balance (main)
  const [pendingBalance, setPendingBalance] = useState<number>(0) // Pending incoming transactions
  // const [lightningBalance, setLightningBalance] = useState<string>('0.00000000') // Lightning balance - for future asset display
  const [loadingBalance, setLoadingBalance] = useState<boolean>(false)
  // const [loadingLightningBalance, setLoadingLightningBalance] = useState<boolean>(false) // For future Lightning asset
  const [balanceError, setBalanceError] = useState<string>('')

  // Settings states
  const [mainnetCanisterId, setMainnetCanisterId] = useState<string>('')
  const [testnetCanisterId, setTestnetCanisterId] = useState<string>('')
  const [settingsSaved, setSettingsSaved] = useState<boolean>(false)

  // Address generation method state (default to 'bitcoin')
  const [addressGenerationMethod, setAddressGenerationMethod] = useState<'icp' | 'bitcoin'>('bitcoin')

  // Multi-address wallet structure states
  const [mainBalanceAddress, setMainBalanceAddress] = useState<string>('')
  const [coloredAddress, setColoredAddress] = useState<string>('') // Colored Account (RGB Assets)
  const [utxoHolderAddress, setUtxoHolderAddress] = useState<string>('')
  const [dustHolderAddress, setDustHolderAddress] = useState<string>('')
  const [addressIndex, setAddressIndex] = useState<number>(0) // The 'i' value
  const [changeIndex, setChangeIndex] = useState<number>(0)
  const [fundedAddresses, setFundedAddresses] = useState<{ address: string, balance: number, account: 'vanilla' | 'colored', index: number, chain: 0 | 1 }[]>([])
  const [allDiscoveredAddresses, setAllDiscoveredAddresses] = useState<string[]>([])

  // Network settings states with defaults
  const [backendProfileId, setBackendProfileId] = useState<BackendProfileId>(DEFAULT_BACKEND_PROFILE_ID)
  const [electrumServer, setElectrumServer] = useState<string>('ssl://electrum.iriswallet.com:50013')
  const [rgbProxy, setRgbProxy] = useState<string>('http://89.117.52.115:3000/json-rpc')
  const [networkSettingsSaved, setNetworkSettingsSaved] = useState<boolean>(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  // Swap states
  const [swapFromAmount, setSwapFromAmount] = useState<string>('')
  const [swapToAmount, setSwapToAmount] = useState<string>('')
  const [swapUserBalance, setSwapUserBalance] = useState<string>('0.00000000')
  const [btcPrice, setBtcPrice] = useState<number>(0)
  const [swapIconRotated, setSwapIconRotated] = useState<boolean>(false)
  const [swapProcessing, setSwapProcessing] = useState<boolean>(false)
  const [swapError, setSwapError] = useState<string>('')
  const [swapSuccess, setSwapSuccess] = useState<string>('')
  const [sendReceiverAddress, setSendReceiverAddress] = useState<string>('')
  const [sendAmount, setSendAmount] = useState<string>('')
  const [sendMode, setSendMode] = useState<'btc' | 'rgb' | 'lightning'>('btc')
  const [sendRgbAssetId, setSendRgbAssetId] = useState<string>('')
  const [sendRgbAssetLabel, setSendRgbAssetLabel] = useState<string>('RGB Asset')
  const [sendRoute, setSendRoute] = useState<'bitcoin' | 'rgb-onchain' | 'lightning' | null>(null)
  const [sendRouteHint, setSendRouteHint] = useState<string>('')
  const [sendOffchainOutbound, setSendOffchainOutbound] = useState<string>('0')
  const [sendOffchainInbound, setSendOffchainInbound] = useState<string>('0')
  const [sendTotalSpendingPower, setSendTotalSpendingPower] = useState<string>('0')
  const [sendLightningMsats, setSendLightningMsats] = useState<number>(0)
  const [sendPaymentHash, setSendPaymentHash] = useState<string>('')
  const [maxSendableAmount, setMaxSendableAmount] = useState<string>('0.00000000')
  const [sendFeeOption, setSendFeeOption] = useState<'slow' | 'avg' | 'fast' | 'custom'>('fast')
  const [sendUserBalance, setSendUserBalance] = useState<string>('0.00000000')
  const [sendEstimatedFees, setSendEstimatedFees] = useState<bigint[]>([2n, 3n, 5n]) // Default: [slow, avg, fast]
  const [sendLoadingFees, setSendLoadingFees] = useState<boolean>(false)
  const [sendNetworkFee, setSendNetworkFee] = useState<string>('0')
  const [sendTxId, setSendTxId] = useState<string>('')
  const [utxoActionTxId, setUtxoActionTxId] = useState<string>('')
  const [utxoActionSuccessLabel, setUtxoActionSuccessLabel] = useState<string>('Transaction complete')
  const [sendProcessing, setSendProcessing] = useState<boolean>(false)
  const [sendError, setSendError] = useState<string>('')


  // UTXOs states
  const [loadingUtxos, setLoadingUtxos] = useState<boolean>(false)
  const [bitcoinUtxos, setBitcoinUtxos] = useState<UtxoWithRgbStatus[]>([])
  const [rgbUtxos, setRgbUtxos] = useState<UtxoWithRgbStatus[]>([])
  const [spendableVanillaUtxos, setSpendableVanillaUtxos] = useState<UTXO[]>([])
  const [utxoTab, setUtxoTab] = useState<'unoccupied' | 'occupied' | 'unlockable'>('unoccupied')
  const [rgbClassificationError, setRgbClassificationError] = useState<string>('')
  const [showUnlockUtxoModal, setShowUnlockUtxoModal] = useState<boolean>(false)
  const [selectedUnlockUtxo, setSelectedUnlockUtxo] = useState<UtxoWithRgbStatus | null>(null)
  const [unlockUtxoProcessing, setUnlockUtxoProcessing] = useState<boolean>(false)
  const [unlockUtxoError, setUnlockUtxoError] = useState<string>('')
  const [unlockUtxoFeeOption, setUnlockUtxoFeeOption] = useState<'slow' | 'avg' | 'fast' | 'custom'>('fast')
  const [unlockUtxoCustomFee, setUnlockUtxoCustomFee] = useState<string>('5')

  // Scroll container ref for scroll-based UX
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Create RGB UTXO states
  const [createUtxoMode, setCreateUtxoMode] = useState<'default' | 'custom'>('default')
  const [createUtxoAmount, setCreateUtxoAmount] = useState<string>('')
  const [createUtxoFeeOption, setCreateUtxoFeeOption] = useState<'slow' | 'avg' | 'fast' | 'custom'>('fast')
  const [createUtxoCustomFee, setCreateUtxoCustomFee] = useState<string>('2')
  const [createUtxoProcessing, setCreateUtxoProcessing] = useState<boolean>(false)


  // User Settings states
  const [autoLockTimer, setAutoLockTimer] = useState<string>('15 minutes')
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(15)
  const [colorMode, _setColorMode] = useState<string>('Dark Mode')

  // Inactivity tracking for auto-lock
  const [lastActivityTimestamp, setLastActivityTimestamp] = useState<number>(Date.now())
  const autoLockIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Default canisters - these can be overridden by user settings
  const DEFAULT_MAINNET_CANISTER = import.meta.env.VITE_CANISTER_ID || 'bkyz2-fmaaa-aaaaa-qaaaq-cai'
  const DEFAULT_TESTNET_CANISTER = import.meta.env.VITE_TESTNET_CANISTER_ID || 'bkyz2-fmaaa-aaaaa-qaaaq-cai'

  // Truncate address for display
  const truncateAddress = (addr: string) => {
    if (!addr || addr.length < 12) return addr
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`
  }

  const closeUnlockUtxoModal = () => {
    if (unlockUtxoProcessing) return
    setShowUnlockUtxoModal(false)
    setUnlockUtxoError('')
  }

  const getUnlockFeeRate = () => {
    if (unlockUtxoFeeOption === 'custom') {
      return Math.max(1, Number(unlockUtxoCustomFee || '5'))
    }

    const feeRateMap = {
      slow: 3,
      avg: 3,
      fast: 5,
    } as const

    return feeRateMap[unlockUtxoFeeOption]
  }

  const getUnlockFeeSats = () => {
    return estimateFee(1, 1, getUnlockFeeRate())
  }

  const getUnlockSendAmountBtc = () => {
    if (!selectedUnlockUtxo) return '0.00000000'
    const sendSats = Math.max(0, Number(selectedUnlockUtxo.value) - getUnlockFeeSats())
    return (sendSats / 100000000).toFixed(8)
  }

  const handleUnlockUtxo = async () => {
    if (!selectedUnlockUtxo) return

    setUnlockUtxoProcessing(true)
    setUnlockUtxoError('')

    try {
      const derivedMainBalanceAddress =
        addressGenerationMethod === 'bitcoin'
          ? await deriveBitcoinAddress(mnemonic, selectedNetwork, 86, 0, 0, addressIndex)
          : mainBalanceAddress

      if (!derivedMainBalanceAddress) {
        throw new Error('Main balance address is not available.')
      }

      const feeRate = getUnlockFeeRate()

      const txHex = await signAndUnlockUtxo(
        mnemonic,
        {
          txid: selectedUnlockUtxo.txid,
          vout: selectedUnlockUtxo.vout,
          value: Number(selectedUnlockUtxo.value),
          address: selectedUnlockUtxo.address,
          derivationPath: selectedUnlockUtxo.derivationPath,
          account: (selectedUnlockUtxo.account || 'vanilla') as 'vanilla' | 'colored',
          chain: (selectedUnlockUtxo.chain || 0) as 0 | 1,
          index: selectedUnlockUtxo.index || 0,
        },
        derivedMainBalanceAddress,
        feeRate,
        selectedNetwork
      )

      const txid = await broadcastTransaction(txHex, selectedNetwork)
      setUtxoActionTxId(txid)
      setUtxoActionSuccessLabel('RGB UTXO unlocked')
      setView('utxo-action-success')
      setShowUnlockUtxoModal(false)
      setSelectedUnlockUtxo(null)
      setUnlockUtxoError('')
      await handleViewUtxos()
    } catch (error: any) {
      console.error('Failed to unlock RGB UTXO:', error)
      setUnlockUtxoError(error?.message || 'Failed to unlock UTXO.')
    } finally {
      setUnlockUtxoProcessing(false)
    }
  }

  const shouldRegenerateRegtestAddress = (network: Network, address: string) => {
    return network === 'regtest' && !!address && !isLikelyRegtestAddress(address)
  }

  const syncAuxiliaryBitcoinAddresses = async (
    mnemonicPhrase: string,
    network: Network = selectedNetwork,
    nextAddressIndex: number = addressIndex
  ) => {
    if (addressGenerationMethod !== 'bitcoin' || !mnemonicPhrase) {
      return null
    }

    const derivedMainBalanceAddress = await deriveBitcoinAddress(mnemonicPhrase, network, 86, 0, 0, nextAddressIndex)
    const derivedUtxoHolderAddress = await deriveBitcoinAddress(mnemonicPhrase, network, 86, 0, 100, 0)
    const derivedDustHolderAddress = await deriveBitcoinAddress(mnemonicPhrase, network, 86, 0, 999, 0)

    const hasAddressDrift =
      mainBalanceAddress !== derivedMainBalanceAddress ||
      utxoHolderAddress !== derivedUtxoHolderAddress ||
      dustHolderAddress !== derivedDustHolderAddress

    if (hasAddressDrift) {
      setMainBalanceAddress(derivedMainBalanceAddress)
      setUtxoHolderAddress(derivedUtxoHolderAddress)
      setDustHolderAddress(derivedDustHolderAddress)

      await setStorageData({
        [`MainBalance_${network}`]: derivedMainBalanceAddress,
        [`UTXOHolder_${network}`]: derivedUtxoHolderAddress,
        [`DustHolder_${network}`]: derivedDustHolderAddress
      })
    }

    return {
      mainBalanceAddress: derivedMainBalanceAddress,
      utxoHolderAddress: derivedUtxoHolderAddress,
      dustHolderAddress: derivedDustHolderAddress
    }
  }

  const getRegtestWalletKey = async () => {
    const storedIdentity = await getStorageData(['principalId'])
    const stableId = storedIdentity.principalId || principalId || walletAddress || coloredAddress || 'anonymous'
    return `extension-${stableId}-regtest`
  }

  const getBackendWalletKey = (network: Network) => {
    const stableId = principalId || walletAddress || coloredAddress || 'anonymous'
    return `extension-${stableId}-${network}`
  }

  const resolveAssetDisplayMeta = async (contractId: string, network: Network) => {
    const contractsKey = getNetworkContractsKey(network)
    const assetsKey = getNetworkAssetsKey(network)
    const storedData = await getStorageData([contractsKey, assetsKey])
    const storedContractMapRaw = storedData[contractsKey]
    const storedAssetsRaw = storedData[assetsKey]

    const storedContractMap =
      typeof storedContractMapRaw === 'string'
        ? JSON.parse(storedContractMapRaw) as Record<string, string>
        : {}
    const storedAssets =
      typeof storedAssetsRaw === 'string'
        ? JSON.parse(storedAssetsRaw) as Asset[]
        : []

    const matchingAsset = storedAssets.find((asset) => storedContractMap[asset.id] === contractId)
    return {
      label: matchingAsset?.name || contractId,
      unit: matchingAsset?.unit || 'RGB',
    }
  }

  const syncRegtestAssetBalances = async (network: Network, sourceAssets: Asset[]) => {
    if (network !== 'regtest' || sourceAssets.length === 0) {
      return sourceAssets
    }

    const contractsKey = getNetworkContractsKey(network)
    const contractSettings = await getStorageData([contractsKey])
    const storedContractMapRaw = contractSettings[contractsKey]
    const storedContractMap =
      typeof storedContractMapRaw === 'string'
        ? JSON.parse(storedContractMapRaw) as Record<string, string>
        : {}

    const walletKey = await getRegtestWalletKey()

    const updatedAssets = await Promise.all(
      sourceAssets.map(async (asset) => {
        const contractId = storedContractMap[asset.id]
        if (!contractId) {
          return asset
        }

        try {
          const rgbBalance = await fetchRegtestRgbBalance({
            assetId: contractId,
            walletKey,
          })

          const spendable = Number(rgbBalance.balance.spendable || 0)
          const offchainOutbound = Number(rgbBalance.balance.offchain_outbound || 0)
          const totalSpendingPower = spendable + offchainOutbound

          return {
            ...asset,
            amount: String(totalSpendingPower),
            rgbLockReason:
              Number(rgbBalance.balance.locked_missing_secret || 0) > 0
                ? 'Locked (Missing Secret)'
                : Number(rgbBalance.balance.locked_unconfirmed || 0) > 0
                  ? 'Locked (Awaiting Confirmations)'
                  : undefined,
            rgbSpendabilityStatus: rgbBalance.balance.spendability_status,
            rgbOffchainOutbound: String(rgbBalance.balance.offchain_outbound || 0),
            rgbOffchainInbound: String(rgbBalance.balance.offchain_inbound || 0),
            rgbSpendingPower: String(totalSpendingPower),
          }
        } catch (error) {
          console.error(`[RGB Balance] Failed to sync ${asset.id}:`, error)
          return {
            ...asset,
            amount: '0',
            rgbLockReason: undefined,
            rgbSpendabilityStatus: undefined,
            rgbOffchainOutbound: '0',
            rgbOffchainInbound: '0',
            rgbSpendingPower: '0',
          }
        }
      })
    )

    return updatedAssets
  }

  const handleImportAsset = async () => {
    const normalizedInput = tokenInput.trim().toLowerCase()

    if (!normalizedInput) {
      setAddAssetError('Enter an asset ticker, name, or contract ID.')
      setAddAssetSuccess('')
      return
    }

    setImportingAsset(true)
    setAddAssetError('')
    setAddAssetSuccess('')

    try {
      let matchedAsset = importableAssets.find((entry) =>
        entry.aliases.includes(normalizedInput)
      )

      if (selectedNetwork === 'regtest') {
        try {
          const registryAssets = await fetchRegtestRgbRegistry()
          const registryMatch = registryAssets.find((entry) => {
            return (
              entry.contract_id.toLowerCase() === normalizedInput ||
              entry.ticker.toLowerCase() === normalizedInput ||
              entry.token_name.toLowerCase() === normalizedInput
            )
          })

          if (registryMatch) {
            matchedAsset = {
              asset: {
                id: buildAssetIdFromTicker(registryMatch.ticker),
                name: registryMatch.token_name,
                amount: '0',
                unit: registryMatch.ticker,
                color: registryMatch.ticker.toUpperCase() === 'PHO' ? '#38bdf8' : '#f8fafc',
              },
              aliases: [
                registryMatch.ticker.toLowerCase(),
                registryMatch.token_name.toLowerCase(),
                registryMatch.contract_id.toLowerCase(),
              ],
              contracts: {
                regtest: registryMatch.contract_id,
              },
            }
          }
        } catch (registryError) {
          console.error('[Add Assets] Failed to query regtest registry, falling back to local list:', registryError)
        }
      }

      if (!matchedAsset) {
        setAddAssetError('Asset not found in the Photon asset registry for this network.')
        return
      }

      const assetsKey = getNetworkAssetsKey(selectedNetwork)
      const contractsKey = getNetworkContractsKey(selectedNetwork)
      const storageResult = await getStorageData([assetsKey, contractsKey])

      const storedAssetsRaw = storageResult[assetsKey]
      const storedContractsRaw = storageResult[contractsKey]

      const storedAssets = typeof storedAssetsRaw === 'string'
        ? JSON.parse(storedAssetsRaw) as Asset[]
        : []
      const storedContracts = typeof storedContractsRaw === 'string'
        ? JSON.parse(storedContractsRaw) as Record<string, string>
        : {}

      const alreadyImported = storedAssets.some((asset) => asset.id === matchedAsset.asset.id)
      const updatedAssets = alreadyImported
        ? storedAssets
        : [...storedAssets, matchedAsset.asset]

      const nextContractId = matchedAsset.contracts?.[selectedNetwork]
      const updatedContracts = nextContractId
        ? { ...storedContracts, [matchedAsset.asset.id]: nextContractId }
        : storedContracts

      await setStorageData({
        [assetsKey]: JSON.stringify(updatedAssets),
        [contractsKey]: JSON.stringify(updatedContracts),
      })

      setAssets(updatedAssets)
      setTokenInput('')
      setAddAssetSuccess(
        alreadyImported
          ? `${matchedAsset.asset.unit} is already available in this network wallet.`
          : `${matchedAsset.asset.unit} imported successfully.`
      )
    } catch (error) {
      console.error('Failed to import asset:', error)
      setAddAssetError('Failed to import asset. Please try again.')
    } finally {
      setImportingAsset(false)
    }
  }

  const openRegtestFaucet = () => {
    const address = walletAddress || btcAddress
    const targetUrl = address
      ? `https://faucet.photonbolt.xyz/?address=${encodeURIComponent(address)}`
      : 'https://faucet.photonbolt.xyz/'
    window.open(targetUrl, '_blank')
  }

  // Copy address function removed - now using inline copy handlers

  // Copy Principal ID to clipboard
  const copyPrincipal = async () => {
    if (principalId) {
      await navigator.clipboard.writeText(principalId)
      setCopiedPrincipal(true)
      setTimeout(() => setCopiedPrincipal(false), 2000)
    }
  }

  // Copy mnemonic to clipboard
  const copyMnemonic = async () => {
    if (mnemonic) {
      await navigator.clipboard.writeText(mnemonic)
      setMnemonicCopied(true)
      setTimeout(() => setMnemonicCopied(false), 2000)
    }
  }

  // Handle expand address - fetch from canister
  const handleExpandAddress = async () => {
    // Don't allow expand in Bitcoin mode - addresses are generated locally
    if (addressGenerationMethod === 'bitcoin') {
      console.log('Expand disabled in Bitcoin mode')
      return
    }

    if (!mnemonic) return

    setLoadingExpand(true)
    try {
      const canisterNetwork = mapNetworkToCanister(selectedNetwork)
      const address = await getWalletAddress(mnemonic, canisterNetwork)
      setWalletAddress(address)
      setBtcAddress(address)

      // Save to storage
      const addressKey = getNetworkAddressKey(selectedNetwork)
      await setStorageData({
        [addressKey]: address,
        btcAddress: address,
        walletAddress: address,
        [`walletAddress_${selectedNetwork}`]: address
      })

      console.log('Expanded wallet address:', address)
    } catch (e) {
      console.error('Failed to expand wallet address:', e)
    } finally {
      setLoadingExpand(false)
    }
  }

  // Fetch BTC address and save to storage for specific network
  const fetchAndSaveBtcAddress = async (mnemonicPhrase: string, network: Network = selectedNetwork): Promise<string | null> => {
    setLoadingAddress(true)
    try {
      const canisterNetwork = mapNetworkToCanister(network)
      let vanillaAddr = ''
      let coloredAddr = ''
      let lightningAddr = ''
      let mainBalanceAddr = ''
      let utxoHolderAddr = ''
      let dustHolderAddr = ''

      // Check which address generation method to use
      if (addressGenerationMethod === 'bitcoin') {
        // Generate Bitcoin addresses locally from mnemonic using BIP86 dual-account structure
        // Vanilla Account (BTC/Fees): m/86'/n'/0'/0/i
        // Colored Account (RGB Assets): m/86'/n'/1'/0/i

        vanillaAddr = await deriveBitcoinAddress(mnemonicPhrase, network, 86, 0, 0, addressIndex)
        coloredAddr = await deriveBitcoinAddress(mnemonicPhrase, network, 86, 1, 0, addressIndex)

        mainBalanceAddr = vanillaAddr
        utxoHolderAddr = await deriveBitcoinAddress(mnemonicPhrase, network, 86, 0, 100, 0) // Keeping these for now
        dustHolderAddr = await deriveBitcoinAddress(mnemonicPhrase, network, 86, 0, 999, 0)

        // For Bitcoin method, use the same address for lightning
        lightningAddr = vanillaAddr
        console.log(`Generated BIP86 addresses locally for ${network} at index ${addressIndex}:`)
        console.log(`  Vanilla (Main): ${vanillaAddr}`)
        console.log(`  Colored (RGB):  ${coloredAddr}`)
      } else {
        // Fetch addresses from ICP canister (default/existing behavior)
        const [canisterWalletAddr, canisterLightningAddr] = await Promise.all([
          getWalletAddress(mnemonicPhrase, canisterNetwork),
          getBtcAddress(mnemonicPhrase, canisterNetwork)
        ])
        vanillaAddr = canisterWalletAddr
        coloredAddr = canisterWalletAddr // For ICP method, use the same main address for all three
        lightningAddr = canisterLightningAddr
        // For ICP method, use the same main address for all three
        mainBalanceAddr = vanillaAddr
        utxoHolderAddr = vanillaAddr
        dustHolderAddr = vanillaAddr
        console.log(`Fetched addresses from canister for ${network}:`, vanillaAddr)
      }

      // Update addresses in state
      setWalletAddress(vanillaAddr)
      setColoredAddress(coloredAddr)
      setLightningAddress(lightningAddr)
      setBtcAddress(vanillaAddr)
      setMainBalanceAddress(mainBalanceAddr)
      setUtxoHolderAddress(utxoHolderAddr)
      setDustHolderAddress(dustHolderAddr)

      console.log('Active Colored Address:', coloredAddr)

      // Save all addresses to network-specific storage
      const addressKey = getNetworkAddressKey(network)
      await setStorageData({
        [addressKey]: vanillaAddr,
        btcAddress: vanillaAddr,
        walletAddress: vanillaAddr,
        coloredAddress: coloredAddr,
        addressIndex: addressIndex, // Store the 'i' value
        lightningAddress: lightningAddr,
        [`walletAddress_${network}`]: vanillaAddr,
        [`coloredAddress_${network}`]: coloredAddr,
        [`lightningAddress_${network}`]: lightningAddr,
        // Store the three addresses for RGB wallet structure
        [`MainBalance_${network}`]: mainBalanceAddr,
        [`UTXOHolder_${network}`]: utxoHolderAddr,
        [`DustHolder_${network}`]: dustHolderAddr
      })

      console.log(`Vanilla address for ${network}:`, vanillaAddr)
      console.log(`Colored address for ${network}:`, coloredAddr)

      return vanillaAddr
    } catch (e) {
      console.error('Failed to fetch/generate addresses:', e)
      setWalletAddress('')
      setLightningAddress('')
      setBtcAddress('')
      return null
    } finally {
      setLoadingAddress(false)
    }
  }

  // Check for existing wallet on startup
  useEffect(() => {
    const checkExistingWallet = async () => {
      try {
        const result = await getStorageData([
          'mnemonic', 'walletPassword', 'principalId', 'btcAddress', 'selectedNetwork',
          'walletAddress', 'lightningAddress', 'coloredAddress', 'addressIndex',
          'btcAddress_mainnet', 'btcAddress_testnet3', 'btcAddress_testnet4', 'btcAddress_regtest',
          'walletAddress_mainnet', 'walletAddress_testnet3', 'walletAddress_testnet4', 'walletAddress_regtest',
          'coloredAddress_mainnet', 'coloredAddress_testnet3', 'coloredAddress_testnet4', 'coloredAddress_regtest',
          'lightningAddress_mainnet', 'lightningAddress_testnet3', 'lightningAddress_testnet4', 'lightningAddress_regtest',
          'addressGenerationMethod', // Load address generation method
          'AutoLockTimer', // Load auto-lock timer setting
          'LoginTime', // Load last login time
          'changeIndex_mainnet', 'changeIndex_testnet3', 'changeIndex_testnet4', 'changeIndex_regtest', // Load change indices
          'allDiscoveredAddresses_mainnet', 'allDiscoveredAddresses_testnet3', 'allDiscoveredAddresses_testnet4', 'allDiscoveredAddresses_regtest' // Load discovered addresses
        ])
        console.log('Storage check result:', result)

        // Load change index for current network
        const network = (result.selectedNetwork as Network) || 'mainnet'
        const changeIndexKey = `changeIndex_${network}` as keyof StorageData
        const changeIndexValue = (result as any)[changeIndexKey]
        if (changeIndexValue !== undefined) {
          setChangeIndex(Number(changeIndexValue))
        } else {
          setChangeIndex(0)
        }

        if (result.mnemonic && result.walletPassword && result.principalId) {
          // Wallet exists - restore network if saved
          if (result.selectedNetwork) {
            setSelectedNetwork(result.selectedNetwork as Network)
          }

          // Load addresses from storage
          if (result.walletAddress) {
            setWalletAddress(result.walletAddress)
          }
          if (result.lightningAddress) {
            setLightningAddress(result.lightningAddress)
          }
          if (result.coloredAddress) {
            setColoredAddress(result.coloredAddress as string)
          }
          if (result.addressIndex !== undefined) {
            setAddressIndex(Number(result.addressIndex))
          }

          // Load address generation method (default to 'icp' for backward compatibility)
          if (result.addressGenerationMethod) {
            setAddressGenerationMethod(result.addressGenerationMethod as 'icp' | 'bitcoin')
          }

          // Load auto-lock timer setting (default to 15 minutes)
          const autoLockMinutesValue = result.AutoLockTimer ? Number(result.AutoLockTimer) : 15
          if (result.AutoLockTimer) {
            const minutes = Number(result.AutoLockTimer)
            setAutoLockMinutes(minutes)
            setAutoLockTimer(`${minutes} minutes`)
          }

          // Check if user should be auto-logged in
          if (result.LoginTime) {
            const loginTime = Number(result.LoginTime)
            const currentTime = Date.now()
            const elapsedMinutes = (currentTime - loginTime) / (1000 * 60)

            console.log(`Time since last login: ${elapsedMinutes.toFixed(2)} minutes`)
            console.log(`Auto-lock timer: ${autoLockMinutesValue} minutes`)

            // If still within the auto-lock window, auto-login to dashboard
            if (elapsedMinutes < autoLockMinutesValue) {
              console.log('Auto-logging in to dashboard')

              // Restore wallet state
              setMnemonic(result.mnemonic)
              setPrincipalId(result.principalId)

              // Proactively move sensitive data to session storage if it was in local storage
              if (result.mnemonic || result.walletPassword) {
                await setStorageData({
                  mnemonic: result.mnemonic,
                  walletPassword: result.walletPassword
                })
              }

              // Restore network and address
              const network = (result.selectedNetwork as Network) || 'mainnet'
              setSelectedNetwork(network)
              const networkAddressKey = getNetworkAddressKey(network)
              let networkAddress = (result[networkAddressKey] || result.btcAddress || '') as string
              if (shouldRegenerateRegtestAddress(network, networkAddress) && result.mnemonic) {
                const regeneratedAddress = await fetchAndSaveBtcAddress(result.mnemonic, network)
                networkAddress = regeneratedAddress || networkAddress
              }
              setBtcAddress(networkAddress as string)

              // Load discovered addresses for change detection
              const discoveredAddressesKey = `allDiscoveredAddresses_${network}` as keyof StorageData
              setAllDiscoveredAddresses(result[discoveredAddressesKey] as string[] || [])

              setView('dashboard')
              setIsLoading(false)

              // Fetch balance after auto-login
              if (result.mnemonic && networkAddress) {
                fetchBalance(result.mnemonic, network)
              }

              // Load assets for current network
              if (result.mnemonic) {
                loadAssetsForNetwork(network, result.mnemonic)
              }

              return
            }
          }

          console.log('Wallet found, showing unlock screen')
          setView('unlock')
        } else {
          // No wallet - show welcome
          console.log('No wallet found, showing welcome')
          setView('welcome')
        }
      } catch (e) {
        console.error('Error checking storage:', e)
        setView('welcome')
      } finally {
        setIsLoading(false)
      }
    }
    checkExistingWallet()
  }, [])

  // Handle unlock with password (for initial unlock screen)
  const handleUnlock = async () => {
    if (!unlockPassword) {
      setError('Please enter your password')
      return
    }

    try {
      const result = await getStorageData([
        'mnemonic', 'walletPassword', 'principalId', 'btcAddress', 'selectedNetwork',
        'btcAddress_mainnet', 'btcAddress_testnet3', 'btcAddress_testnet4', 'btcAddress_regtest'
      ])
      console.log('Unlock check result:', result)

      if (unlockPassword === result.walletPassword) {
        // Password correct - load wallet data from storage
        setMnemonic(result.mnemonic || '')
        setPrincipalId(result.principalId || '')

        // Restore network and address
        const network = (result.selectedNetwork as Network) || 'mainnet'
        setSelectedNetwork(network)
        const networkAddressKey = getNetworkAddressKey(network)
        let networkAddress = (result[networkAddressKey] || result.btcAddress || '') as string
        if (shouldRegenerateRegtestAddress(network, networkAddress) && result.mnemonic) {
          const regeneratedAddress = await fetchAndSaveBtcAddress(result.mnemonic, network)
          networkAddress = regeneratedAddress || networkAddress
        }
        setBtcAddress(networkAddress as string)

        // Load discovered addresses for change detection
        const discoveredAddressesKey = `allDiscoveredAddresses_${network}` as keyof StorageData
        setAllDiscoveredAddresses(result[discoveredAddressesKey] as string[] || [])

        // Proactively move sensitive data to session storage if it was in local storage
        await setStorageData({
          mnemonic: result.mnemonic,
          walletPassword: result.walletPassword,
          LoginTime: Date.now()
        })
        console.log('Login time and sensitive data updated in storage')

        setError('')
        setUnlockPassword('')

        setView('dashboard')
        console.log('Unlock successful, going to dashboard')

        // Fetch balance after unlock
        if (result.mnemonic && networkAddress) {
          fetchBalance(result.mnemonic, network)
        }

        // Load assets for current network
        if (result.mnemonic) {
          loadAssetsForNetwork(network, result.mnemonic)
        }
      } else {
        setError('Incorrect password')
      }
    } catch (e) {
      console.error('Unlock error:', e)
      setError('Error accessing storage')
    }
  }

  // Handle lock from menu
  const handleLock = () => {
    setShowMenu(false)
    setUnlockPassword('')
    setError('')
    setView('lock')
  }

  // Handle unlock from lock screen
  const handleUnlockFromLock = async () => {
    if (!unlockPassword) {
      setError('Please enter your password')
      return
    }

    try {
      const result = await getStorageData([
        'walletPassword', 'mnemonic', 'principalId', 'btcAddress', 'selectedNetwork',
        'btcAddress_mainnet', 'btcAddress_testnet3', 'btcAddress_testnet4', 'btcAddress_regtest'
      ])
      console.log('Lock screen unlock check:', result)

      if (unlockPassword === result.walletPassword) {
        // Password correct - restore wallet data and go to dashboard
        const currentMnemonic = result.mnemonic || mnemonic
        setMnemonic(currentMnemonic)
        setPrincipalId(result.principalId || principalId)

        // Restore network and address
        const network = (result.selectedNetwork as Network) || selectedNetwork
        setSelectedNetwork(network)
        const networkAddressKey = getNetworkAddressKey(network)
        let networkAddress = (result[networkAddressKey] || result.btcAddress || btcAddress) as string
        if (shouldRegenerateRegtestAddress(network, networkAddress) && currentMnemonic) {
          const regeneratedAddress = await fetchAndSaveBtcAddress(currentMnemonic, network)
          networkAddress = regeneratedAddress || networkAddress
        }
        setBtcAddress(networkAddress as string)

        // Load discovered addresses for change detection
        const discoveredAddressesKey = `allDiscoveredAddresses_${network}` as keyof StorageData
        setAllDiscoveredAddresses(result[discoveredAddressesKey] as string[] || [])

        // Proactively move sensitive data to session storage if it was in local storage
        await setStorageData({
          mnemonic: currentMnemonic,
          walletPassword: result.walletPassword,
          LoginTime: Date.now()
        })
        console.log('Login time and sensitive data updated in storage (from lock)')

        setError('')
        setUnlockPassword('')

        setView('dashboard')
        console.log('Unlock from lock successful')

        // Fetch balance after unlock
        if (currentMnemonic && networkAddress) {
          fetchBalance(currentMnemonic, network)
        }

        // Load assets for current network
        if (currentMnemonic) {
          loadAssetsForNetwork(network, currentMnemonic)
        }
      } else {
        setError('Incorrect password')
      }
    } catch (e) {
      console.error('Unlock from lock error:', e)
      setError('Error accessing storage')
    }
  }

  // Handle forgot password
  const handleForgotPassword = () => {
    setView('forgot')
  }

  // Handle delete wallet
  const handleDeleteWallet = async () => {
    await removeStorageData([
      'mnemonic', 'walletPassword', 'principalId', 'btcAddress', 'selectedNetwork',
      'btcAddress_mainnet', 'btcAddress_testnet3', 'btcAddress_testnet4', 'btcAddress_regtest'
    ])
    console.log('Wallet deleted from storage')
    setMnemonic('')
    setPrincipalId('')
    setBtcAddress('')
    setPassword('')
    setConfirmPassword('')
    setUnlockPassword('')
    setVerifyWords([])
    setSelectedNetwork('mainnet')
    setView('welcome')
  }

  // Handle auto-lock timer selection
  const handleSelectAutoLockTimer = async (minutes: number) => {
    setAutoLockMinutes(minutes)
    setAutoLockTimer(`${minutes} minutes`)

    // Save to storage
    await setStorageData({ AutoLockTimer: minutes })

    // Navigate back to user settings
    setView('user-settings')
  }

  // Load assets for a specific network
  const loadAssetsForNetwork = async (network: Network, mnemonicPhrase?: string) => {
    const currentMnemonic = mnemonicPhrase || mnemonic

    // Load network-specific assets
    const assetsKey = getNetworkAssetsKey(network)
    const assetsResult = await getStorageData([assetsKey])
    const cachedAssets = assetsResult[assetsKey]

    if (cachedAssets) {
      // Use cached assets
      try {
        const parsedAssets = JSON.parse(cachedAssets as string)
        const syncedAssets = await syncRegtestAssetBalances(network, parsedAssets)
        setAssets(syncedAssets)
        console.log('Loaded cached assets for', network)

        // Update ckBTC balance for Lightning BTC asset
        if (currentMnemonic) {
          try {
            const canisterNetwork = mapNetworkToCanister(network)
            const ckBTCBalance = await getCkBTCBalance(currentMnemonic, canisterNetwork)
            // Store as user_lbtc_balance
            await setStorageData({ user_lbtc_balance: ckBTCBalance })
            const updatedAssets = syncedAssets.map((asset: Asset) =>
              asset.id === 'lightning-btc'
                ? { ...asset, amount: ckBTCBalance }
                : asset
            )
            setAssets(updatedAssets)
            await setStorageData({ [assetsKey]: JSON.stringify(updatedAssets) })
          } catch (error) {
            console.error('Error fetching ckBTC balance:', error)
          }
        }
      } catch (e) {
        console.error('Error parsing cached assets:', e)
        setAssets([])
      }
    } else if (network === 'mainnet') {
      // Initialize mainnet with default assets
      setAssets(mainnetDefaultAssets)
      await setStorageData({ [assetsKey]: JSON.stringify(mainnetDefaultAssets) })
      console.log('Initialized mainnet with default assets')

      // Fetch ckBTC balance for Lightning BTC
      if (currentMnemonic) {
        try {
          const canisterNetwork = mapNetworkToCanister(network)
          const ckBTCBalance = await getCkBTCBalance(currentMnemonic, canisterNetwork)
          // Store as user_lbtc_balance
          await setStorageData({ user_lbtc_balance: ckBTCBalance })
          const updatedAssets = mainnetDefaultAssets.map(asset =>
            asset.id === 'lightning-btc'
              ? { ...asset, amount: ckBTCBalance }
              : asset
          )
          setAssets(updatedAssets)
          await setStorageData({ [assetsKey]: JSON.stringify(updatedAssets) })
        } catch (error) {
          console.error('Error fetching ckBTC balance:', error)
        }
      }
    } else if (network === 'testnet3' || network === 'testnet4' || network === 'regtest') {
      // Initialize testnet with default assets
      const syncedDefaultAssets = await syncRegtestAssetBalances(network, testnet3DefaultAssets)
      setAssets(syncedDefaultAssets)
      await setStorageData({ [assetsKey]: JSON.stringify(syncedDefaultAssets) })
      console.log('Initialized', network, 'with default assets')

      // Fetch ckBTC balance for Lightning BTC
      if (currentMnemonic) {
        try {
          const canisterNetwork = mapNetworkToCanister(network)
          const ckBTCBalance = await getCkBTCBalance(currentMnemonic, canisterNetwork)
          // Store as user_lbtc_balance
          await setStorageData({ user_lbtc_balance: ckBTCBalance })
          const updatedAssets = syncedDefaultAssets.map(asset =>
            asset.id === 'lightning-btc'
              ? { ...asset, amount: ckBTCBalance }
              : asset
          )
          setAssets(updatedAssets)
          await setStorageData({ [assetsKey]: JSON.stringify(updatedAssets) })
        } catch (error) {
          console.error('Error fetching ckBTC balance:', error)
        }
      }
    } else {
      // Clear assets for other networks
      setAssets([])
      console.log('Cleared assets for', network)
    }
  }

  // Load activities for current address
  const loadActivities = async (overrideAddresses?: string[]) => {
    if (!walletAddress) {
      setActivities([])
      return
    }

    setLoadingActivities(true)
    try {
      console.log('Fetching activities for address:', walletAddress, 'on network:', selectedNetwork)

      // Collect all known wallet addresses to correctly identify change
      const walletAddresses = overrideAddresses || [
        mainBalanceAddress,
        utxoHolderAddress,
        dustHolderAddress,
        coloredAddress,
        ...allDiscoveredAddresses
      ].filter(Boolean);

      const btcActivities = await fetchBtcActivities(walletAddress, selectedNetwork, walletAddresses)
      let nextActivities: BitcoinActivity[] = [...btcActivities]

      if (selectedNetwork === 'regtest') {
        try {
          const contractsKey = getNetworkContractsKey(selectedNetwork)
          const contractsResult = await getStorageData([contractsKey])
          const storedContractsRaw = contractsResult[contractsKey]
          const storedContracts =
            typeof storedContractsRaw === 'string'
              ? JSON.parse(storedContractsRaw) as Record<string, string>
              : {}

          const walletKey = await getRegtestWalletKey()
          const rgbActivities = await Promise.all(
            Object.entries(storedContracts).map(async ([assetKey, contractId]) => {
              const assetMeta = assets.find((asset) => asset.id === assetKey)
              if (!contractId || !assetMeta) {
                return []
              }

              const response = await fetchRegtestRgbTransfers({ assetId: contractId, walletKey })
              return response.transfers
                .filter((transfer) => {
                  if (transfer.kind === 'Issuance') return false
                  if (transfer.kind === 'Send' || transfer.kind?.startsWith('Receive')) return true
                  return transfer.kind?.startsWith('Lightning') || transfer.txid === null
                })
                .map((transfer) => {
                  const assignmentValue = Number(
                    transfer.assignments?.[0]?.value ??
                    transfer.requested_assignment?.value ??
                    0
                  )
                  const metadataTimestamp =
                    typeof transfer.metadata?.created_at === 'number'
                      ? transfer.metadata.created_at
                      : typeof transfer.metadata?.updated_at === 'number'
                        ? transfer.metadata.updated_at
                        : null
                  const timestamp = metadataTimestamp || Math.floor(Date.now() / 1000)
                  const isReceive =
                    transfer.kind?.startsWith('Receive') ||
                    transfer.kind === 'LightningReceive'
                  const isLightning = transfer.kind?.startsWith('Lightning') || transfer.txid === null

                  return {
                    type: isReceive ? 'Receive' : 'Send',
                    txid: transfer.txid || null,
                    amount: assignmentValue,
                    status: transfer.status === 'Settled' ? 'Confirmed' : 'Pending',
                    date: timestamp
                      ? new Date(timestamp * 1000).toLocaleDateString()
                      : 'Pending',
                    timestamp,
                    unit: assetMeta.unit,
                    route: isLightning ? 'lightning' : 'onchain',
                    settlementLabel: isLightning ? 'Off-Chain Settlement' : 'On-Chain Settlement',
                    note: isLightning
                      ? `Payment ${transfer.metadata && typeof transfer.metadata.payment_hash === 'string'
                        ? `${transfer.metadata.payment_hash.slice(0, 8)}...`
                        : 'via channel'}`
                      : undefined,
                  } satisfies BitcoinActivity
                })
            })
          )

          nextActivities = [
            ...nextActivities,
            ...rgbActivities.flat(),
          ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        } catch (rgbActivityError) {
          console.error('Error loading RGB activities:', rgbActivityError)
        }
      }

      setActivities(nextActivities)
      console.log(`Loaded ${nextActivities.length} activities`)
    } catch (error) {
      console.error('Error loading activities:', error)
      setActivities([])
    } finally {
      setLoadingActivities(false)
    }
  }

  // Auto-load activities when dashboard is shown and set Activities as default tab
  useEffect(() => {
    if (view === 'dashboard' && walletAddress) {
      // Set Activities as the active tab on dashboard load
      setActiveTab('activities')
      // Load activities data
      loadActivities()
    }
  }, [view, walletAddress, selectedNetwork])

  // Calculate pending balance from activities
  useEffect(() => {
    if (activities.length > 0) {
      const pendingReceives = activities
        .filter(activity => activity.status === 'Pending' && activity.type === 'Receive')
        .reduce((sum, activity) => sum + activity.amount, 0)

      setPendingBalance(pendingReceives)
    } else {
      setPendingBalance(0)
    }
  }, [activities])


  // Handle network switch
  const handleNetworkSwitch = async (network: Network) => {
    if (network === selectedNetwork) {
      setShowNetworkModal(false)
      return
    }

    setSelectedNetwork(network)
    setShowNetworkModal(false)

    const networkSwitchUpdate: Record<string, string> = { selectedNetwork: network }
    if (network === 'regtest') {
      const nextElectrum = getDefaultElectrumServer(network, 'photon-dev-regtest')
      const nextRgbProxy = getDefaultRgbProxy(network, 'photon-dev-regtest')
      networkSwitchUpdate.backendProfileId = 'photon-dev-regtest'
      networkSwitchUpdate.electrumServer = nextElectrum
      networkSwitchUpdate.rgbProxy = nextRgbProxy
      setBackendProfileId('photon-dev-regtest')
      setElectrumServer(nextElectrum)
      setRgbProxy(nextRgbProxy)
    }

    // Save selected network to storage
    await setStorageData(networkSwitchUpdate)
    console.log('Network switched to:', network)

    // Check if we have a cached address for this network
    const networkAddressKey = getNetworkAddressKey(network)
    const result = await getStorageData([
      networkAddressKey,
      `walletAddress_${network}`,
      `lightningAddress_${network}`,
      `changeIndex_${network}` as any
    ])
    const cachedAddress = result[networkAddressKey]
    const cachedWalletAddress = result[`walletAddress_${network}`]
    const cachedLightningAddress = result[`lightningAddress_${network}`]
    const cachedChangeIndex = result[`changeIndex_${network}` as keyof typeof result]

    if (cachedChangeIndex !== undefined) {
      setChangeIndex(Number(cachedChangeIndex))
    } else {
      setChangeIndex(0)
    }

    let currentAddress = ''

    if (cachedAddress || cachedWalletAddress) {
      // Use cached wallet address
      currentAddress = (cachedWalletAddress || cachedAddress) as string
      if (shouldRegenerateRegtestAddress(network, currentAddress) && mnemonic) {
        console.log('Cached regtest address is invalid for regtest, regenerating:', currentAddress)
        const regeneratedAddress = await fetchAndSaveBtcAddress(mnemonic, network)
        if (regeneratedAddress) {
          currentAddress = regeneratedAddress
        }
      } else {
        setBtcAddress(currentAddress)
        setWalletAddress(currentAddress)
        await setStorageData({
          btcAddress: currentAddress,
          walletAddress: currentAddress
        })
        console.log('Using cached wallet address for', network, ':', currentAddress)
      }
    } else if (mnemonic) {
      // Fetch new address from canister
      console.log('Fetching new address for network:', network)
      const newAddress = await fetchAndSaveBtcAddress(mnemonic, network)
      if (newAddress) currentAddress = newAddress
    }

    // Update Lightning address
    if (cachedLightningAddress) {
      setLightningAddress(cachedLightningAddress as string)
      console.log('Using cached Lightning address for', network, ':', cachedLightningAddress)
    } else if (mnemonic) {
      // Lightning address is fetched as part of fetchAndSaveBtcAddress
      console.log('Lightning address will be fetched with wallet address')
    }

    // Fetch balance for the new network
    if (mnemonic && currentAddress) {
      fetchBalance(mnemonic, network)
    }

    // Load assets for the new network
    await loadAssetsForNetwork(network)
  }

  const handleCreateWallet = () => {
    const newMnemonic = generateMnemonic()
    setMnemonic(newMnemonic)
    setMnemonicCopied(false)
    setView('create')
  }

  const handleGoToVerify = () => {
    // Set up verification with 5 random words
    const words = mnemonic.split(' ')
    const positions = getRandomPositions()
    const wordsToVerify: VerifyWord[] = positions.map(pos => ({
      position: pos,
      word: words[pos],
      userInput: ''
    }))
    setVerifyWords(wordsToVerify)
    setError('')
    setView('verify')
  }

  const updateVerifyInput = (index: number, value: string) => {
    setVerifyWords(prev => prev.map((w, i) =>
      i === index ? { ...w, userInput: value } : w
    ))
  }

  const handleVerifyWords = () => {
    // Check all 5 words
    const allCorrect = verifyWords.every(
      w => w.userInput.toLowerCase().trim() === w.word.toLowerCase()
    )

    if (!allCorrect) {
      setError('Some words are incorrect. Please check and try again.')
      return
    }

    // All correct - go to password setup
    setPassword('')
    setConfirmPassword('')
    setError('')
    setView('password')
  }

  const handlePasswordContinue = () => {
    // Validate password before showing notice
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    // Show notice modal
    setShowNoticeModal(true)
  }

  // Placeholder for future canister-based index retrieval
  const fetchIndexFromCanister = async (network: Network): Promise<number | null> => {
    // TODO: Implement actual canister call here
    console.log(`[Canister] Placeholder: Fetching index for ${network}...`);
    return null;
  }

  const fetchBalance = async (currentMnemonic: string, networkId: Network) => {
    if (!currentMnemonic) return
    setLoadingBalance(true)
    try {
      console.log(`[Balance] Fetching balance for ${networkId}...`)

      // Get stored index and check canister (placeholder)
      const canisterIndex = await fetchIndexFromCanister(networkId);
      const effectiveIndex = Math.max(addressIndex, changeIndex, canisterIndex || 0);

      // Perform Discovery Scan with Gap Limit 20
      const { totalBalance: vanillaBalance, maxIndex, fundedAddresses: discoveredAddresses, allDiscoveredAddresses: discoveredHistoryAddresses } = await performDiscoveryScan(
        currentMnemonic,
        networkId,
        effectiveIndex
      );

      setFundedAddresses(discoveredAddresses);
      setAllDiscoveredAddresses(discoveredHistoryAddresses);

      // Save discovered addresses to storage
      const discoveredAddressesKey = `allDiscoveredAddresses_${networkId}` as any;
      await setStorageData({ [discoveredAddressesKey]: discoveredHistoryAddresses });

      if (maxIndex > addressIndex) {
        console.log(`[DiscoveryScan] Found higher index: ${maxIndex}. Updating state and storage.`);
        setAddressIndex(maxIndex);
        const indexKey = `addressIndex_${networkId}` as any;
        await setStorageData({
          addressIndex: maxIndex,
          [indexKey]: maxIndex
        });
      }

      // Refresh activities with the latest discovered addresses to ensure correct change detection
      const latestWalletAddresses = [
        mainBalanceAddress,
        utxoHolderAddress,
        dustHolderAddress,
        coloredAddress,
        ...discoveredHistoryAddresses
      ].filter(Boolean);

      if (view === 'dashboard') {
        loadActivities(latestWalletAddresses);
      }

      const formattedBalance = (vanillaBalance / 100000000).toFixed(8)
      setBtcBalance(formattedBalance)
      console.log(`[Balance] Updated Vanilla Balance: ${formattedBalance} BTC (Max Index: ${maxIndex})`)

      // Update in storage for persistence
      const balanceKey = `MainBalance_${networkId}` as any
      await setStorageData({
        [balanceKey]: formattedBalance,
        user_bitcoin_balance: formattedBalance,
        walletBalance: formattedBalance
      })

      // Also fetch LBTC balance from canister
      try {
        const canisterNetwork = mapNetworkToCanister(networkId)
        const ckBTCBalance = await getCkBTCBalance(currentMnemonic, canisterNetwork)
        await setStorageData({ user_lbtc_balance: ckBTCBalance })
        console.log('LBTC balance fetched:', ckBTCBalance)
      } catch (lbtcError) {
        console.error('Error fetching LBTC balance:', lbtcError)
      }
    } catch (e) {
      console.error('Failed to fetch balance:', e)
    } finally {
      setLoadingBalance(false)
    }
  }

  const handleRefreshBalance = async () => {
    if (!mnemonic || !walletAddress) return
    await fetchBalance(mnemonic, selectedNetwork)
    await loadAssetsForNetwork(selectedNetwork, mnemonic)
  }

  const handleConfirmNotice = async () => {
    setShowNoticeModal(false)

    try {
      // Derive identity and get Principal ID
      const id = await deriveIdentity(mnemonic)
      setPrincipalId(id)
      console.log('Derived Principal ID:', id)

      // Save everything to storage
      await setStorageData({
        mnemonic,
        walletPassword: password,
        principalId: id,
        addressGenerationMethod // Save the address generation method (default: 'bitcoin')
      })
      console.log('Wallet data saved to storage: mnemonic, password, principalId, addressGenerationMethod')

      // Fetch and save BTC address
      setView('dashboard')
      const address = await fetchAndSaveBtcAddress(mnemonic)
      if (address) {
        // Call update_balance to sync with canister
        try {
          const canisterNetwork = mapNetworkToCanister(selectedNetwork)
          await updateBalance(mnemonic, canisterNetwork)
          console.log('Balance updated on canister')
        } catch (e) {
          console.error('Error updating balance on canister:', e)
        }
        fetchBalance(mnemonic, selectedNetwork)

        // Load assets for current network
        loadAssetsForNetwork(selectedNetwork, mnemonic)
      }
    } catch (e) {
      console.error('Error creating wallet:', e)
      setError('Failed to create wallet')
    }
  }

  const handleRestoreWallet = () => {
    setView('restore')
    setRestoreInput('')
    setError('')
  }

  const handleConfirmRestore = async () => {
    if (!validateMnemonic(restoreInput.trim())) {
      setError('Invalid mnemonic')
      return
    }
    // For restore, go to password setup directly
    setMnemonic(restoreInput.trim())
    setPassword('')
    setConfirmPassword('')
    setError('')
    setView('password')
  }

  const handleSignOut = async () => {
    setShowMenu(false)
    await removeStorageData([
      'mnemonic', 'walletPassword', 'principalId', 'btcAddress', 'selectedNetwork',
      'btcAddress_mainnet', 'btcAddress_testnet3', 'btcAddress_testnet4', 'btcAddress_regtest'
    ])
    console.log('Signed out, storage cleared')
    setMnemonic('')
    setPrincipalId('')
    setBtcAddress('')
    setPassword('')
    setConfirmPassword('')
    setUnlockPassword('')
    setVerifyWords([])
    setSelectedNetwork('mainnet')
    setView('welcome')
  }

  // Load canister settings when Settings view is opened
  useEffect(() => {
    const loadCanisterSettings = async () => {
      if (view === 'settings') {
        const result = await getStorageData([
          'mainnetCanisterId',
          'testnetCanisterId',
          `MainBalance_${selectedNetwork}`,
          `UTXOHolder_${selectedNetwork}`,
          `DustHolder_${selectedNetwork}`
        ])
        setMainnetCanisterId(result.mainnetCanisterId || DEFAULT_MAINNET_CANISTER)
        setTestnetCanisterId(result.testnetCanisterId || DEFAULT_TESTNET_CANISTER)

        // Load the three addresses for current network
        const nextMainBalanceAddress = ((result[`MainBalance_${selectedNetwork}` as keyof typeof result] as string) || '').trim()
        const nextUtxoHolderAddress = ((result[`UTXOHolder_${selectedNetwork}` as keyof typeof result] as string) || '').trim()
        const nextDustHolderAddress = ((result[`DustHolder_${selectedNetwork}` as keyof typeof result] as string) || '').trim()

        const hasInvalidRegtestAuxAddress =
          selectedNetwork === 'regtest' && (
            shouldRegenerateRegtestAddress(selectedNetwork, nextMainBalanceAddress) ||
            shouldRegenerateRegtestAddress(selectedNetwork, nextUtxoHolderAddress) ||
            shouldRegenerateRegtestAddress(selectedNetwork, nextDustHolderAddress)
          )

        if (hasInvalidRegtestAuxAddress && mnemonic) {
          console.log('Cached regtest RGB wallet addresses are invalid, regenerating auxiliary addresses')
          await fetchAndSaveBtcAddress(mnemonic, selectedNetwork)
          return
        }

        setMainBalanceAddress(nextMainBalanceAddress)
        setUtxoHolderAddress(nextUtxoHolderAddress)
        setDustHolderAddress(nextDustHolderAddress)
      }
    }
    loadCanisterSettings()
  }, [view, selectedNetwork, mnemonic])

  // Inactivity tracking for auto-lock
  useEffect(() => {
    // Only track inactivity when on dashboard or other wallet screens (not on unlock/lock/welcome screens)
    const trackableViews = ['dashboard', 'receive', 'receive-btc', 'receive-rgb', 'receive-lightning', 'convert-lightning', 'send', 'send-amount', 'send-confirm', 'settings', 'user-settings', 'auto-lock-settings', 'network-settings', 'add-assets', 'swap', 'utxos']

    if (!trackableViews.includes(view)) {
      // Clean up interval if navigating away from trackable views
      if (autoLockIntervalRef.current) {
        clearInterval(autoLockIntervalRef.current)
        autoLockIntervalRef.current = null
      }
      return
    }

    // Reset activity timestamp on any user interaction
    const resetActivity = () => {
      setLastActivityTimestamp(Date.now())
    }

    // Reset activity when user returns to the tab (prevents lock on tab switch)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // User returned to the tab, reset activity timestamp
        setLastActivityTimestamp(Date.now())
        console.log('User returned to tab, activity timestamp reset')
      }
    }

    // Add event listeners for user activity
    window.addEventListener('click', resetActivity)
    window.addEventListener('mousemove', resetActivity)
    window.addEventListener('keydown', resetActivity)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Set up interval to check for inactivity (every 30 seconds)
    const checkInactivity = () => {
      // Don't check if tab is hidden (user is on another tab)
      if (document.hidden) {
        return
      }

      const now = Date.now()
      const inactiveTime = now - lastActivityTimestamp
      const inactiveMinutes = inactiveTime / (1000 * 60)

      // Lock if inactive time exceeds the configured auto-lock timer
      if (inactiveMinutes >= autoLockMinutes) {
        console.log(`Auto-locking after ${inactiveMinutes.toFixed(2)} minutes of inactivity`)
        setView('lock')
      }
    }

    // Start the interval checker
    autoLockIntervalRef.current = setInterval(checkInactivity, 30000) // Check every 30 seconds

    // Cleanup on unmount or view change
    return () => {
      window.removeEventListener('click', resetActivity)
      window.removeEventListener('mousemove', resetActivity)
      window.removeEventListener('keydown', resetActivity)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      if (autoLockIntervalRef.current) {
        clearInterval(autoLockIntervalRef.current)
        autoLockIntervalRef.current = null
      }
    }
  }, [view, lastActivityTimestamp, autoLockMinutes])

  // Keep the BTC/USD rate fresh for fiat conversions across the wallet.
  useEffect(() => {
    let cancelled = false

    const loadBtcPrice = async () => {
      try {
        const response = await fetch(PHOTON_PRICE_API)
        const data = await response.json()
        const price = Number(data?.priceUsd)

        if (!cancelled && Number.isFinite(price) && price > 0) {
          setBtcPrice(price)
        }
      } catch (error) {
        console.error('Error fetching BTC price from Photon wrapper:', error)
      }
    }

    loadBtcPrice()
    const intervalId = window.setInterval(loadBtcPrice, 60000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  // Load user balance when swap view opens
  useEffect(() => {
    const loadSwapBalance = async () => {
      if (view === 'swap') {
        const result = await getStorageData(['user_bitcoin_balance', 'user_lbtc_balance'])
        const btcBalance = result.user_bitcoin_balance || '0.00000000'
        const lbtcBalance = result.user_lbtc_balance || '0.00000000'

        // Set the balance based on swap direction
        // Default: BTC → LBTC (use BTC balance)
        // Rotated: LBTC → BTC (use LBTC balance)
        setSwapUserBalance(swapIconRotated ? lbtcBalance : btcBalance)
        console.log('Swap balances loaded - BTC:', btcBalance, 'LBTC:', lbtcBalance)
      }
    }
    loadSwapBalance()
  }, [view, swapIconRotated])

  // Check client-side RGB receive readiness when RGB receive view opens
  useEffect(() => {
    const checkRgbConnection = async () => {
      if (view === 'receive-rgb') {
        try {
          const hasWalletContext = Boolean(mnemonic && coloredAddress)
          setRgbWalletOnline(hasWalletContext)
          console.log('[RGB Receive] Client-side RGB readiness:', hasWalletContext ? 'online' : 'offline')
        } catch (error) {
          console.error('[RGB Receive] Error checking RGB connection:', error)
          setRgbWalletOnline(false)
        }
      }
    }
    checkRgbConnection()
  }, [view, selectedNetwork, backendProfileId, mnemonic, coloredAddress])

  // Auto-calculate destination amount (source - 500 satoshi) and update when source changes
  useEffect(() => {
    if (swapFromAmount && parseFloat(swapFromAmount) > 0) {
      const fromBtc = parseFloat(swapFromAmount)
      const feeInBtc = 500 / 100000000 // 500 satoshi to BTC
      const toBtc = Math.max(0, fromBtc - feeInBtc)
      setSwapToAmount(toBtc.toFixed(8))
    } else {
      setSwapToAmount('')
    }
  }, [swapFromAmount])

  // Calculate USD value
const calculateUsdValue = (btcAmount: string): string => {
  if (!btcAmount || btcAmount === '' || parseFloat(btcAmount) === 0) return '$0.00'
  if (!btcPrice || btcPrice === 0) return '$0.00'
  const usdValue = parseFloat(btcAmount) * btcPrice
  if (isNaN(usdValue)) return '$0.00'
  return `$${usdValue.toFixed(2)}`
}

const createUtxoBaseAmountBtc = (mode: 'default' | 'custom', input: string) => {
  const val = mode === 'default' ? 0.0003 : Number(input || '0.0003')
  return Number.isNaN(val) ? 0 : val
}

const deriveCreateUtxoFeeRate = (
  option: 'slow' | 'avg' | 'fast' | 'custom',
  custom: string,
  estimatedFees: Array<number | bigint> = []
) => {
  if (option === 'custom') return custom || '2'
  const feeRateMap = { slow: 0, avg: 1, fast: 2 }
  const idx = feeRateMap[option] ?? 2
  const fallback = option === 'fast' ? 2 : option === 'avg' ? 1 : 0
  const val = estimatedFees[idx] ?? estimatedFees[fallback] ?? 2
  return String(Number(val))
}

const DEFAULT_CREATE_UTXO_TX_VBYTES = 200

  // Handle percentage button clicks for swap
  const handleSwapPercentage = (percentage: number) => {
    const balance = parseFloat(swapUserBalance)
    const amount = (balance * percentage / 100).toFixed(8)
    setSwapFromAmount(amount)
  }

  // Handle swap execution
  const handleExecuteSwap = async () => {
    if (!mnemonic || !swapFromAmount || parseFloat(swapFromAmount) === 0) {
      setSwapError('Please enter a valid amount')
      return
    }

    // Clear previous messages
    setSwapError('')
    setSwapSuccess('')
    setSwapProcessing(true)

    try {
      const amount = parseFloat(swapFromAmount)
      const canisterNetwork = mapNetworkToCanister(selectedNetwork)

      if (swapIconRotated) {
        // LBTC → BTC conversion
        console.log('Converting LBTC to BTC, amount:', amount)
        const result = await convertLBTCtoBTC(mnemonic, amount, canisterNetwork)

        setSwapSuccess(result.message)
        setSwapFromAmount('')
        setSwapToAmount('')

        // Refresh balances after successful conversion
        setTimeout(async () => {
          if (btcAddress) {
            await fetchBalance(mnemonic, selectedNetwork)
          }
          // Also reload swap balances
          const balanceResult = await getStorageData(['user_bitcoin_balance', 'user_lbtc_balance'])
          const btcBal = balanceResult.user_bitcoin_balance || '0.00000000'
          const lbtcBal = balanceResult.user_lbtc_balance || '0.00000000'
          setSwapUserBalance(swapIconRotated ? lbtcBal : btcBal)
        }, 2000)
      } else {
        // BTC → LBTC conversion (not yet implemented)
        setSwapError('BTC to LBTC conversion is not yet available')
      }
    } catch (error: any) {
      console.error('Swap error:', error)
      setSwapError(error.message || 'Failed to execute swap')
    } finally {
      setSwapProcessing(false)
    }
  }

  // Calculate maximum sendable amount (balance - fee)
  const handleMaxAmount = async () => {
    if (sendMode === 'rgb') {
      return
    }

    if (!mnemonic || !walletAddress) {
      setSendAmount(btcBalance)
      return
    }

    try {
      // Get current fee rate based on selected option
      const feeRateMap = { slow: 0, avg: 1, fast: 2, custom: 2 }
      const feeIndex = feeRateMap[sendFeeOption as 'slow' | 'avg' | 'fast' | 'custom'] || 2
      const feeRate = Number(sendEstimatedFees[feeIndex])

      let numUTXOs = 0

      // Fetch UTXOs to get accurate count
      if (addressGenerationMethod === 'bitcoin') {
        // Fetch from blockchain
        const utxos = await fetchUTXOsFromBlockchain(walletAddress, selectedNetwork)
        numUTXOs = utxos?.length || 0
      } else {
        // Fetch from canister
        try {
          const canisterNetwork = mapNetworkToCanister(selectedNetwork)
          const utxos = await getUtxos(walletAddress, canisterNetwork)
          numUTXOs = utxos?.length || 0
        } catch (e) {
          // If canister fails, estimate with 1 UTXO
          numUTXOs = 1
        }
      }

      // Calculate transaction size using the user's formula
      // For Max, we have 1 output (recipient) and no change
      const estimatedFeeSats = estimateFee(numUTXOs, 1, feeRate)
      const estimatedFeeBtc = estimatedFeeSats / 100000000

      // Calculate max sendable amount
      const balanceBtc = parseFloat(btcBalance)
      const maxSendable = Math.max(0, balanceBtc - estimatedFeeBtc)

      // Set the amount
      setSendAmount(maxSendable.toFixed(8))

      console.log(`Max calculation: Balance=${balanceBtc}, Fee=${estimatedFeeBtc}, Max=${maxSendable}, UTXOs=${numUTXOs}`)
    } catch (error) {
      console.error('Error calculating max amount:', error)
      // Fallback
      const feeRateMap = { slow: 0, avg: 1, fast: 2, custom: 2 }
      const feeIndex = feeRateMap[sendFeeOption as 'slow' | 'avg' | 'fast' | 'custom'] || 2
      const feeRate = Number(sendEstimatedFees[feeIndex])
      const estimatedFeeSats = estimateFee(1, 1, feeRate)
      const estimatedFeeBtc = estimatedFeeSats / 100000000
      const balanceBtc = parseFloat(btcBalance)
      const maxSendable = Math.max(0, balanceBtc - estimatedFeeBtc)
      setSendAmount(maxSendable.toFixed(8))
    }
  }

  const applyOptimisticRgbBalance = async (assetId: string, nextBalance: {
    spendable?: number | string
    offchain_outbound?: number | string
    offchain_inbound?: number | string
  }) => {
    const spendingPower =
      Number(nextBalance.spendable || 0) + Number(nextBalance.offchain_outbound || 0)

    const updatedAssets = assets.map((asset) => {
      if (asset.id !== assetId) {
        return asset
      }

      return {
        ...asset,
        amount: String(spendingPower),
        rgbSpendingPower: String(spendingPower),
        rgbOffchainOutbound: String(nextBalance.offchain_outbound || 0),
        rgbOffchainInbound: String(nextBalance.offchain_inbound || 0),
      }
    })

    setAssets(updatedAssets)
    await setStorageData({
      [getNetworkAssetsKey(selectedNetwork)]: JSON.stringify(updatedAssets),
    })
  }

  const handleInvoicePaste = async (text: string) => {
    const trimmedInput = text.trim()
    setSendReceiverAddress(text)
    setSendRoute(null)
    setSendRouteHint('')
    setSendError('')
    setSendPaymentHash('')

    if (!trimmedInput) {
      return
    }

    if (isLightningInvoice(trimmedInput)) {
      setSendRoute('lightning')
      setSendRouteHint('Analyzing Lightning invoice...')

      if (selectedNetwork !== 'regtest') {
        setSendError('Lightning RGB pay is currently enabled for regtest only')
        return
      }

      try {
        const walletKey = await getRegtestWalletKey()
        const decoded = await decodeRegtestLightningInvoice({
          invoice: trimmedInput,
          walletKey,
        })
        const assetMeta = decoded.decoded.asset_id
          ? await resolveAssetDisplayMeta(decoded.decoded.asset_id, selectedNetwork)
          : { label: 'RGB Asset', unit: 'RGB' }
        const assetAmount = Number(decoded.decoded.asset_amount || 0)
        const amtMsat = Number(decoded.decoded.amt_msat || 0)

        setSendMode('lightning')
        setSendRgbAssetId(decoded.decoded.asset_id || '')
        setSendRgbAssetLabel(assetMeta.unit || assetMeta.label)
        setSendAmount(assetAmount > 0 ? String(assetAmount) : '')
        setSendLightningMsats(amtMsat)
        setSendNetworkFee('0.00 PHO')
        setSendRouteHint(
          assetAmount > 0
            ? `Payment for ${assetAmount} ${assetMeta.unit || 'RGB'} detected. Route: Lightning`
            : 'Lightning route detected.'
        )
      } catch (error: any) {
        console.error('Error decoding Lightning invoice:', error)
        setSendError(error.message || 'Failed to decode Lightning invoice')
      }
      return
    }

    if (isRgbInvoice(trimmedInput) || isBlindSealReference(trimmedInput)) {
      setSendRoute('rgb-onchain')
      setSendRouteHint('RGB on-chain invoice detected.')
      return
    }

    setSendRoute('bitcoin')
    setSendRouteHint('Bitcoin on-chain payment detected.')
  }

  // Load user balance and fees when send-amount view opens
  useEffect(() => {
    const loadSendBalance = async () => {
      if (view === 'send-amount') {
        const result = await getStorageData(['user_bitcoin_balance'])
        const balance = result.user_bitcoin_balance || '0.00000000'
        setSendUserBalance(balance)
        setSendOffchainOutbound('0')
        setSendOffchainInbound('0')
        setSendTotalSpendingPower('0')

        // Fetch estimated fees from mempool.space
        setSendLoadingFees(true)
        try {
          const fees = await fetchLiveFees(selectedNetwork)
          // Map to the array format [slow, average, fast]
          const feeArray = [BigInt(fees.slow), BigInt(fees.average), BigInt(fees.fast)]
          setSendEstimatedFees(feeArray)
          console.log('Live fees from mempool:', fees)
        } catch (error) {
          console.error('Error fetching live fees:', error)
          // Fallback to canister if mempool fails
          if (mnemonic) {
            try {
              const canisterNetwork = mapNetworkToCanister(selectedNetwork)
              const fees = await getEstimatedBitcoinFees(mnemonic, canisterNetwork)
              setSendEstimatedFees(fees)
            } catch (e) {
              console.error('Canister fee fetch also failed:', e)
            }
          }
        } finally {
          setSendLoadingFees(false)
        }

        if (sendMode === 'rgb') {
          setMaxSendableAmount(sendAmount || '0')
        }

        if ((sendMode === 'rgb' || sendMode === 'lightning') && selectedNetwork === 'regtest' && sendRgbAssetId) {
          try {
            const walletKey = await getRegtestWalletKey()
            const rgbBalance = await fetchRegtestRgbBalance({
              assetId: sendRgbAssetId,
              walletKey,
            })
            const spendable = Number(rgbBalance.balance.spendable || 0)
            const offchainOutbound = Number(rgbBalance.balance.offchain_outbound || 0)
            const offchainInbound = Number(rgbBalance.balance.offchain_inbound || 0)
            const totalSpendingPower = spendable + offchainOutbound

            setSendOffchainOutbound(String(offchainOutbound))
            setSendOffchainInbound(String(offchainInbound))
            setSendTotalSpendingPower(String(totalSpendingPower))
            setSendUserBalance(String(totalSpendingPower))
            setMaxSendableAmount(String(totalSpendingPower))
          } catch (rgbBalanceError) {
            console.error('Error loading RGB spending power:', rgbBalanceError)
          }
        }
      }
    }
    loadSendBalance()
  }, [view, mnemonic, selectedNetwork, sendMode, sendAmount, sendRgbAssetId])

  // Calculate max sendable amount whenever relevant state changes
  useEffect(() => {
    const calculateMax = async () => {
      if (view === 'send-amount' && (sendMode === 'rgb' || sendMode === 'lightning')) {
        setMaxSendableAmount(sendAmount || '0')
        return
      }

      if (view === 'send-amount' && mnemonic && walletAddress) {
        try {
          const feeRateMap = { slow: 0, avg: 1, fast: 2, custom: 2 }
          const feeIndex = feeRateMap[sendFeeOption as 'slow' | 'avg' | 'fast' | 'custom'] || 2
          const feeRate = Number(sendEstimatedFees[feeIndex])

          let numUTXOs = 0
          if (addressGenerationMethod === 'bitcoin') {
            const utxos = await fetchUTXOsFromBlockchain(walletAddress, selectedNetwork)
            numUTXOs = utxos?.length || 0
          } else {
            const canisterNetwork = mapNetworkToCanister(selectedNetwork)
            const utxos = await getUtxos(walletAddress, canisterNetwork)
            numUTXOs = utxos?.length || 0
          }

          const estimatedFeeSats = estimateFee(numUTXOs || 1, 1, feeRate)
          const estimatedFeeBtc = estimatedFeeSats / 100000000
          const balanceBtc = parseFloat(btcBalance)
          const max = Math.max(0, balanceBtc - estimatedFeeBtc)
          setMaxSendableAmount(max.toFixed(8))
        } catch (e) {
          console.error('Error calculating max sendable:', e)
        }
      }
    }
    calculateMax()
  }, [view, btcBalance, sendEstimatedFees, sendFeeOption, walletAddress, selectedNetwork, sendMode, sendAmount])

  // Navigate to send confirm screen
  const handleSendEntryNext = async () => {
    const trimmedInput = sendReceiverAddress.trim()
    if (!trimmedInput) {
      setSendError('Please enter a receiver address or RGB invoice')
      return
    }

    setSendError('')
    setSendTxId('')

    if (isLightningInvoice(trimmedInput)) {
      if (selectedNetwork !== 'regtest') {
        setSendError('Lightning RGB pay is currently enabled for regtest only')
        return
      }

      try {
        const walletKey = await getRegtestWalletKey()
        const decoded = await decodeRegtestLightningInvoice({
          invoice: trimmedInput,
          walletKey,
        })
        const assetId = decoded.decoded.asset_id || ''
        const amountValue = Number(decoded.decoded.asset_amount || 0)
        if (!assetId || !Number.isFinite(amountValue) || amountValue <= 0) {
          throw new Error('Lightning RGB invoice amount is missing or invalid')
        }

        const assetMeta = await resolveAssetDisplayMeta(assetId, selectedNetwork)
        setSendMode('lightning')
        setSendRoute('lightning')
        setSendRgbAssetId(assetId)
        setSendRgbAssetLabel(assetMeta.unit || assetMeta.label)
        setSendAmount(String(amountValue))
        setSendLightningMsats(Number(decoded.decoded.amt_msat || 0))
        setSendNetworkFee('0.00 PHO')
        setView('send-amount')
      } catch (error: any) {
        console.error('Error decoding Lightning invoice:', error)
        setSendError(error.message || 'Failed to decode Lightning invoice')
      }
      return
    }

    if (isBlindSealReference(trimmedInput)) {
      setSendRoute('rgb-onchain')
      setSendError('Paste the full RGB invoice, not only the blinded seal.')
      return
    }

    if (trimmedInput.toLowerCase().startsWith('rgb:')) {
      if (selectedNetwork !== 'regtest') {
        setSendError('RGB send is currently enabled for regtest only')
        return
      }

      try {
        const decoded = await decodeRegtestRgbInvoice({ invoice: trimmedInput })
        const amountValue = Number(decoded.decoded.assignment?.value || 0)
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          throw new Error('RGB invoice amount is missing or invalid')
        }

        const assetMeta = await resolveAssetDisplayMeta(decoded.decoded.asset_id, selectedNetwork)
        setSendMode('rgb')
        setSendRoute('rgb-onchain')
        setSendRgbAssetId(decoded.decoded.asset_id)
        setSendRgbAssetLabel(assetMeta.unit || assetMeta.label)
        setSendAmount(String(amountValue))
        setSendUserBalance('0.00000000')
        setSendNetworkFee('TBD')
        setView('send-amount')
      } catch (error: any) {
        console.error('Error decoding RGB invoice:', error)
        setSendError(error.message || 'Failed to decode RGB invoice')
      }
      return
    }

    setSendMode('btc')
    setSendRoute('bitcoin')
    setSendRgbAssetId('')
    setSendRgbAssetLabel('RGB Asset')
    setSendAmount('')
    setSendLightningMsats(0)
    setSendNetworkFee('0')
    setView('send-amount')
  }

  const handleSendNext = async () => {
    if (!sendAmount || parseFloat(sendAmount) === 0) {
      setSendError('Please enter a valid amount')
      return
    }

    if (sendMode === 'rgb' || sendMode === 'lightning') {
      setSendNetworkFee(sendMode === 'lightning' ? '0.00 PHO (Instant)' : 'TBD')
      setSendError('')
      setView('send-confirm')
      return
    }

    try {
      // Calculate network fee based on selected option
      const feeRate = sendFeeOption === 'slow' ? sendEstimatedFees[0] :
        sendFeeOption === 'avg' ? sendEstimatedFees[1] :
          sendEstimatedFees[2] // fast

      let numUTXOs = 1 // Default to 1 if we can't fetch

      // Fetch UTXOs to get accurate count for fee calculation
      if (mnemonic && walletAddress) {
        try {
          if (addressGenerationMethod === 'bitcoin') {
            // Fetch from blockchain
            const utxos = await fetchUTXOsFromBlockchain(walletAddress, selectedNetwork)
            numUTXOs = utxos?.length || 1
          } else {
            // Fetch from canister
            const canisterNetwork = mapNetworkToCanister(selectedNetwork)
            const utxos = await getUtxos(walletAddress, canisterNetwork)
            numUTXOs = utxos?.length || 1
          }
        } catch (e) {
          console.warn('Could not fetch UTXOs for fee estimation, using 1 UTXO estimate:', e)
        }
      }

      // Calculate actual transaction size based on UTXOs using the user's formula
      // For a standard send, we have 2 outputs (recipient + change)
      const networkFeeSats = estimateFee(numUTXOs, 2, Number(feeRate))
      const networkFeeBtc = (networkFeeSats / 100000000).toFixed(8)
      setSendNetworkFee(networkFeeBtc)

      console.log(`Fee calculation: ${numUTXOs} UTXOs, 2 outputs, ${feeRate} sat/vB = ${networkFeeSats} sats`)

      setSendError('')
      setView('send-confirm')
    } catch (error) {
      console.error('Error calculating fee:', error)
      setSendError('Failed to calculate network fee')
    }
  }

  // Execute Bitcoin send transaction
  const handleSendBitcoin = async () => {
    if (sendMode === 'lightning') {
      if (!sendReceiverAddress) {
        setSendError('Missing Lightning invoice')
        return
      }

      setSendProcessing(true)
      setSendError('')

      try {
        const walletKey = await getRegtestWalletKey()
        const result = await payRegtestLightningInvoice({
          invoice: sendReceiverAddress.trim(),
          walletKey,
        })

        const nextOffchainOutbound = Math.max(0, Number(result.balance.offchain_outbound || 0))
        const nextOffchainInbound = Math.max(0, Number(result.balance.offchain_inbound || 0))
        const nextSpendingPower = Math.max(
          0,
          Number(result.balance.spendable || 0) + nextOffchainOutbound
        )

        setSendTxId('')
        setSendPaymentHash(result.payment.payment_hash || '')
        setSendOffchainOutbound(String(nextOffchainOutbound))
        setSendOffchainInbound(String(nextOffchainInbound))
        setSendTotalSpendingPower(String(nextSpendingPower))
        setSendUserBalance(String(nextSpendingPower))
        await applyOptimisticRgbBalance(
          assets.find((asset) => asset.unit === sendRgbAssetLabel)?.id || buildAssetIdFromTicker(sendRgbAssetLabel),
          result.balance
        )
        setView('send-success')

        setTimeout(async () => {
          try {
            await handleRefreshBalance()
            await loadActivities()
          } catch (refreshError) {
            console.error('Error refreshing wallet after Lightning payment:', refreshError)
          }
        }, 1200)
      } catch (error: any) {
        console.error('Lightning payment error:', error)
        setSendError(error.message || 'Failed to pay Lightning invoice')
      } finally {
        setSendProcessing(false)
      }
      return
    }

    if (sendMode === 'rgb') {
      if (!sendReceiverAddress) {
        setSendError('Missing RGB invoice')
        return
      }

      setSendProcessing(true)
      setSendError('')

      try {
        const feeRateMap = { slow: 0, avg: 1, fast: 2, custom: 2 }
        const feeIndex = feeRateMap[sendFeeOption as 'slow' | 'avg' | 'fast' | 'custom'] || 2
        const feeRate = Number(sendEstimatedFees[feeIndex] || 5n)
        const walletKey = await getRegtestWalletKey()
        const result = await sendRegtestRgbInvoice({
          invoice: sendReceiverAddress.trim(),
          feeRate,
          minConfirmations: 1,
          walletKey,
        })

        setSendTxId(result.txid || '')
        setSendPaymentHash('')
        setView('send-success')

        setTimeout(async () => {
          try {
            await handleRefreshBalance()
            await handleViewUtxos()
          } catch (refreshError) {
            console.error('Error refreshing wallet after RGB send:', refreshError)
          }
        }, 1500)
      } catch (error: any) {
        console.error('Send RGB error:', error)
        setSendError(error.message || 'Failed to send RGB asset')
      } finally {
        setSendProcessing(false)
      }
      return
    }

    if (!mnemonic || !sendReceiverAddress || !sendAmount) {
      setSendError('Missing required information')
      return
    }

    setSendProcessing(true)
    setSendError('')

    try {
      const amountBtc = parseFloat(sendAmount)
      const amountSats = BigInt(Math.floor(amountBtc * 100000000))
      let txid: string

      // Check which signing method to use based on addressGenerationMethod
      if (addressGenerationMethod === 'bitcoin') {
        // Use local Bitcoin signing (offline signing)
        console.log('Using local Bitcoin transaction signing')

        // Fetch UTXOs on-demand if not already loaded
        let vanillaUtxos: UTXO[] = [];

        if (spendableVanillaUtxos.length === 0) {
          console.log('[Send] No UTXOs in state, fetching fresh via Discovery Scan...')
          const effectiveIndex = Math.max(addressIndex, changeIndex);
          const { utxos: discoveryUtxos } = await performDiscoveryScan(mnemonic, selectedNetwork, effectiveIndex);

          // Filter for vanilla UTXOs only
          vanillaUtxos = discoveryUtxos
            .filter(u => u.account === 'vanilla')
            .map(u => ({
              txid: u.txid,
              vout: u.vout,
              value: u.value,
              address: u.address,
              derivationPath: u.derivationPath,
              account: u.account as 'vanilla',
              chain: u.chain as 0 | 1,
              index: u.index as number
            }));
        } else {
          // Use already-loaded Vanilla UTXOs from state
          vanillaUtxos = spendableVanillaUtxos;
        }

        if (vanillaUtxos.length === 0) {
          throw new Error('No spendable Vanilla UTXOs available')
        }

        console.log(`Using ${vanillaUtxos.length} Vanilla UTXOs for transaction`)

        // Get fee rate from selected fee option
        const feeRateMap = { slow: 0, avg: 1, fast: 2 }
        const feeIndex = feeRateMap[sendFeeOption as 'slow' | 'avg' | 'fast'] || 2
        const feeRate = Number(sendEstimatedFees[feeIndex])

        // Sign transaction locally using Vanilla isolation rule
        const txHex = await signAndSendVanilla(
          mnemonic,
          vanillaUtxos,
          sendReceiverAddress,
          amountSats,
          feeRate,
          selectedNetwork,
          changeIndex
        )

        // Increment and save change index
        const nextChangeIndex = changeIndex + 1
        setChangeIndex(nextChangeIndex)
        const changeIndexKey = `changeIndex_${selectedNetwork}` as any
        await setStorageData({ [changeIndexKey]: nextChangeIndex })
        // TODO: Save the changeIndex into canister after local storage update
        console.log(`[ChangeIndex] Incremented to ${nextChangeIndex} for ${selectedNetwork}`)

        // Broadcast to network
        txid = await broadcastTransaction(txHex, selectedNetwork)
        console.log('Transaction broadcast via local signing:', txid)
      } else {
        // Use ICP canister signing (existing method)
        console.log('Using ICP canister transaction signing')
        const canisterNetwork = mapNetworkToCanister(selectedNetwork)
        txid = await sendBitcoin(mnemonic, sendReceiverAddress, amountSats, canisterNetwork)
        console.log('Transaction sent via canister:', txid)
      }

      setSendTxId(txid)
      console.log('Transaction sent successfully:', txid)

      // Immediately deduct amount from cached balance
      try {
        const currentBalance = parseFloat(btcBalance || '0')
        const sentAmount = parseFloat(sendAmount)
        const networkFee = parseFloat(sendNetworkFee)
        const newBalance = (currentBalance - sentAmount - networkFee).toFixed(8)

        console.log('=== INSTANT BALANCE DEDUCTION ===')
        console.log('Current:', currentBalance, '| Sent:', sentAmount, '| Fee:', networkFee, '| New:', newBalance)
        console.log('=================================')

        // Update UI immediately
        setBtcBalance(newBalance)

        // Update cached balance in storage
        await setStorageData({
          walletBalance: newBalance,
          user_bitcoin_balance: newBalance
        })
        console.log(`Balance updated: ${currentBalance} - ${sentAmount} - ${networkFee} = ${newBalance}`)
      } catch (balanceError) {
        console.error('Error updating balance after send:', balanceError)
      }

      // Navigate to success screen
      setView('send-success')

      // Refresh balance from blockchain after 3 seconds to get accurate balance
      setTimeout(async () => {
        if (btcAddress) {
          await fetchBalance(mnemonic, selectedNetwork)
        }
      }, 3000)
    } catch (error: any) {
      console.error('Send Bitcoin error:', error)
      setSendError(error.message || 'Failed to send Bitcoin')
    } finally {
      setSendProcessing(false)
    }
  }

  // Refresh fee estimates
  const handleRefreshFees = async () => {
    if (!mnemonic) return

    setSendLoadingFees(true)
    try {
      const canisterNetwork = mapNetworkToCanister(selectedNetwork)
      const fees = await getEstimatedBitcoinFees(mnemonic, canisterNetwork)
      setSendEstimatedFees(fees)
      console.log('Refreshed estimated fees:', fees)
    } catch (error) {
      console.error('Error refreshing fees:', error)
    } finally {
      setSendLoadingFees(false)
    }
  }


  // Save canister settings
  const handleSaveCanisterIds = async () => {
    if (!mainnetCanisterId || !testnetCanisterId) {
      setError('Both canister IDs are required')
      return
    }

    try {
      // Save to storage
      await setStorageData({
        mainnetCanisterId,
        testnetCanisterId,
        addressGenerationMethod // Save the address generation method
      })

      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)

      // Refresh wallet address with new canister or method
      if (mnemonic) {
        await fetchAndSaveBtcAddress(mnemonic, selectedNetwork)
      }

      console.log('Settings saved successfully')
    } catch (e) {
      console.error('Error saving settings:', e)
      setError('Failed to save settings')
    }
  }

  // Reset canister IDs to defaults
  const handleResetCanisterIds = () => {
    setMainnetCanisterId(DEFAULT_MAINNET_CANISTER)
    setTestnetCanisterId(DEFAULT_TESTNET_CANISTER)
  }

  // Swap mainnet and testnet canister IDs
  const handleSwapCanisterIds = () => {
    const temp = mainnetCanisterId
    setMainnetCanisterId(testnetCanisterId)
    setTestnetCanisterId(temp)
  }

  // Load network settings when view opens
  useEffect(() => {
    const loadNetworkSettings = async () => {
      if (view === 'network-settings') {
        const result = await getStorageData(['backendProfileId', 'electrumServer', 'rgbProxy'])
        const activeProfileId = (result.backendProfileId as BackendProfileId) || DEFAULT_BACKEND_PROFILE_ID
        setBackendProfileId(activeProfileId)
        // Use saved values, or keep the defaults if not saved
        setElectrumServer(result.electrumServer || getDefaultElectrumServer(selectedNetwork, activeProfileId))
        setRgbProxy(result.rgbProxy || getDefaultRgbProxy(selectedNetwork, activeProfileId))
      }
    }
    loadNetworkSettings()
  }, [view, selectedNetwork])

  const applyBackendProfileDefaults = (profileId: BackendProfileId) => {
    setBackendProfileId(profileId)
    setElectrumServer(getDefaultElectrumServer(selectedNetwork, profileId))
    setRgbProxy(getDefaultRgbProxy(selectedNetwork, profileId))
  }

  useEffect(() => {
    const ensureRegtestBackendProfile = async () => {
      if (selectedNetwork !== 'regtest' || backendProfileId === 'photon-dev-regtest') {
        return
      }

      const nextElectrum = getDefaultElectrumServer('regtest', 'photon-dev-regtest')
      const nextRgbProxy = getDefaultRgbProxy('regtest', 'photon-dev-regtest')

      setBackendProfileId('photon-dev-regtest')
      setElectrumServer(nextElectrum)
      setRgbProxy(nextRgbProxy)
      await setStorageData({
        backendProfileId: 'photon-dev-regtest',
        electrumServer: nextElectrum,
        rgbProxy: nextRgbProxy
      })
      console.log('Auto-switched backend profile to Photon Dev Regtest for regtest network')
    }

    ensureRegtestBackendProfile()
  }, [selectedNetwork, backendProfileId])

  useEffect(() => {
    if (!mnemonic) {
      return
    }

    if (selectedNetwork === 'regtest' && backendProfileId === 'photon-dev-regtest') {
      fetchBalance(mnemonic, selectedNetwork)
    }
  }, [selectedNetwork, backendProfileId, mnemonic])

  // Save network settings
  const handleSaveNetworkSettings = async () => {
    if (!electrumServer || !rgbProxy) {
      setError('Both Electrum Server and RGB Proxy are required')
      return
    }

    try {
      // Save to storage
      await setStorageData({
        backendProfileId,
        electrumServer,
        rgbProxy
      })

      setNetworkSettingsSaved(true)
      setError('')

      // Simulate connection attempt
      setConnectionStatus('connecting')
      setTimeout(() => {
        setConnectionStatus('connected')
        setNetworkSettingsSaved(false)
      }, 2000)

      console.log('Network settings saved successfully')
    } catch (e) {
      console.error('Error saving network settings:', e)
      setError('Failed to save network settings')
      setConnectionStatus('disconnected')
    }
  }

  // Reset network settings
  const handleResetNetworkSettings = () => {
    applyBackendProfileDefaults(DEFAULT_BACKEND_PROFILE_ID)
  }

  // Fetch and display UTXOs
  const handleViewUtxos = async () => {
    if (!walletAddress) return

    setLoadingUtxos(true)
    setRgbClassificationError('')

    try {
      let utxos: any[];

      // Determine fetch method based on address generation mode
      if (addressGenerationMethod === 'bitcoin') {
        // Bitcoin mode: Use Discovery Scan to find all UTXOs across both accounts
        console.log('[Multi-Address] Fetching UTXOs using Discovery Scan...')

        const effectiveIndex = Math.max(addressIndex, changeIndex);
        const { utxos: discoveryUtxos, maxIndex, fundedAddresses: discoveredAddresses, allDiscoveredAddresses: discoveredHistoryAddresses } = await performDiscoveryScan(mnemonic, selectedNetwork, effectiveIndex);

        setFundedAddresses(discoveredAddresses);
        setAllDiscoveredAddresses(discoveredHistoryAddresses);

        // Save discovered addresses to storage
        const discoveredAddressesKey = `allDiscoveredAddresses_${selectedNetwork}` as any;
        await setStorageData({ [discoveredAddressesKey]: discoveredHistoryAddresses });

        // Update address index if a higher one was found during scan
        if (maxIndex > addressIndex) {
          console.log(`[DiscoveryScan] Found higher index during UTXO fetch: ${maxIndex}. Updating.`);
          setAddressIndex(maxIndex);
          const indexKey = `addressIndex_${selectedNetwork}` as any;
          await setStorageData({
            addressIndex: maxIndex,
            [indexKey]: maxIndex
          });
        }

        // Convert to canister format (number → bigint) and preserve account info
        utxos = discoveryUtxos.map(u => ({
          ...u,
          value: BigInt(u.value)
        }))

        setSpendableVanillaUtxos(
          discoveryUtxos
            .filter((u) => u.account === 'vanilla')
            .map((u) => ({
              txid: u.txid,
              vout: u.vout,
              value: u.value,
              address: u.address,
              derivationPath: u.derivationPath,
              account: u.account as 'vanilla',
              chain: u.chain as 0 | 1,
              index: u.index as number
            }))
        )
      } else {
        // ICP mode: Fetch from canister
        console.log('Fetching UTXOs from ICP canister')
        const canisterNetwork = mapNetworkToCanister(selectedNetwork)
        utxos = await getUtxos(walletAddress, canisterNetwork)
        setSpendableVanillaUtxos([])
      }

      console.log('UTXOs received:', utxos?.length || 0)

      // Fetch RGB-occupied UTXOs using the new RGB fetcher
      try {
        console.log('[RGB] Fetching RGB-occupied UTXOs from proxy...')

        // Get RGB proxy URL from storage or use default
        const storageData = await getStorageData(['rgbProxy'])
        const rgbProxyUrl = (storageData.rgbProxy as string) || 'http://89.117.52.115:3000/json-rpc'

        const syncedAuxiliaryAddresses =
          addressGenerationMethod === 'bitcoin'
            ? await syncAuxiliaryBitcoinAddresses(mnemonic, selectedNetwork)
            : null

        const rgbDisplayAddress =
          addressGenerationMethod === 'bitcoin'
            ? (syncedAuxiliaryAddresses?.utxoHolderAddress || utxoHolderAddress)
            : walletAddress

        if (!rgbDisplayAddress) {
          throw new Error('RGB UTXO holder address is not available.')
        }

        const holderCoinType = selectedNetwork === 'mainnet' ? 0 : 1
        const holderDerivationPath = `m/86'/${holderCoinType}'/0'/100/0`
        const holderUtxos = await fetchUTXOsFromBlockchain(rgbDisplayAddress, selectedNetwork)
        const displayUtxos = holderUtxos.map((u) => ({
          txid: u.txid,
          vout: u.vout,
          value: BigInt(u.value),
          address: rgbDisplayAddress,
          derivationPath: holderDerivationPath,
          account: 'vanilla' as const,
          chain: 0 as const,
          index: 0,
        }))

        let rgbOccupiedUtxos: Array<{
          txid: string
          vout: number
          btcAmount: number
          assets: Array<{
            assetId: string
            name: string
            amount: number
            ticker: string
          }>
        }> = []

        if (selectedNetwork === 'regtest') {
          const contractsKey = getNetworkContractsKey(selectedNetwork)
          const contractSettings = await getStorageData([contractsKey])
          const storedContractMapRaw = contractSettings[contractsKey]
          const storedContractMap =
            typeof storedContractMapRaw === 'string'
              ? JSON.parse(storedContractMapRaw) as Record<string, string>
              : {}

          const contractIds = Array.from(
            new Set(
              Object.values(storedContractMap).filter(
                (value): value is string => typeof value === 'string' && value.trim().length > 0
              )
            )
          )

          const assetMetadataByContractId = new Map(
            assets
              .map((asset) => {
                const contractId = storedContractMap[asset.id]
                if (!contractId) return null
                return [
                  contractId,
                  {
                    name: asset.name,
                    ticker: asset.unit,
                  },
                ] as const
              })
              .filter((entry): entry is readonly [string, { name: string; ticker: string }] => entry !== null)
          )

          const occupiedOutpointMap = new Map<string, Array<{
            assetId: string
            name: string
            amount: number
            ticker: string
          }>>()

          if (contractIds.length > 0) {
            const walletKey = await getRegtestWalletKey()
            const transferResponses = await Promise.all(
              contractIds.map(async (assetId) => {
                try {
                  return await fetchRegtestRgbTransfers({ assetId, walletKey })
                } catch (transferError) {
                  console.error(`[RGB] Failed to fetch wallet-scoped transfers for ${assetId}:`, transferError)
                  return null
                }
              })
            )

            for (const transferResponse of transferResponses) {
              if (!transferResponse) continue

              const assetMeta = assetMetadataByContractId.get(transferResponse.assetId)
              for (const transfer of transferResponse.transfers) {
                if (transfer.kind !== 'ReceiveBlind' || !transfer.receive_utxo) {
                  continue
                }

                if (!['WaitingConfirmations', 'Settled'].includes(transfer.status)) {
                  continue
                }

                const [txid, voutRaw] = transfer.receive_utxo.split(':')
                const vout = Number(voutRaw)
                if (!txid || Number.isNaN(vout)) {
                  continue
                }

                const settledAssignment = Array.isArray(transfer.assignments)
                  ? transfer.assignments.find((assignment) => assignment.type === 'Fungible')
                  : null
                const requestedAssignment = transfer.requested_assignment?.type === 'Fungible'
                  ? transfer.requested_assignment
                  : null
                const amount = Number(
                  settledAssignment?.value ??
                  requestedAssignment?.value ??
                  0
                )

                if (!Number.isFinite(amount) || amount <= 0) {
                  continue
                }

                const outpoint = `${txid}:${vout}`
                const existingAllocations = occupiedOutpointMap.get(outpoint) || []
                existingAllocations.push({
                  assetId: transferResponse.assetId,
                  name: assetMeta?.name || transferResponse.assetId,
                  amount,
                  ticker: assetMeta?.ticker || 'RGB',
                })
                occupiedOutpointMap.set(outpoint, existingAllocations)
              }
            }
          }

          rgbOccupiedUtxos = displayUtxos
            .filter((utxo) => occupiedOutpointMap.has(`${utxo.txid}:${utxo.vout}`))
            .map((utxo) => ({
              txid: utxo.txid,
              vout: utxo.vout,
              btcAmount: Number(utxo.value),
              assets: occupiedOutpointMap.get(`${utxo.txid}:${utxo.vout}`) || [],
            }))
        } else {
          // Non-regtest networks still use proxy-based classification.
          rgbOccupiedUtxos = await fetchRgbOccupiedUtxos(rgbDisplayAddress, rgbProxyUrl, selectedNetwork)
        }

        console.log(`[RGB] Found ${rgbOccupiedUtxos.length} RGB-occupied UTXOs`)

        // For Bitcoin UTXOs (unoccupied), filter out the occupied ones
        if (displayUtxos.length > 0) {
          const occupiedOutpoints = new Set(
            rgbOccupiedUtxos.map(u => `${u.txid}:${u.vout}`)
          )

          // Filter and tag unoccupied UTXOs
          const unoccupiedUtxos = displayUtxos
            .filter(u => !occupiedOutpoints.has(`${u.txid}:${u.vout}`))
            .map(u => ({
              ...u,
              address: u.address,
              derivationPath: u.derivationPath,
              isOccupied: false,
              isLocked: false
            }))

          setBitcoinUtxos(unoccupiedUtxos)

          // Convert RGB UTXOs to the expected format
          const occupiedUtxos = rgbOccupiedUtxos.map(u => {
            // Find the original UTXO to get account info
            const originalUtxo = displayUtxos.find(utxo => utxo.txid === u.txid && utxo.vout === u.vout);
            return {
              txid: u.txid,
              vout: u.vout,
              value: BigInt(u.btcAmount),
              address: originalUtxo?.address || '',
              derivationPath: originalUtxo?.derivationPath || '',
              isOccupied: true,
              isLocked: true, // RGB-occupied UTXOs are always locked
              rgbAllocations: u.assets.map((asset) => ({
                assetId: asset.assetId,
                amount: BigInt(asset.amount),
                assetName: asset.name,
                ticker: asset.ticker,
              })),
              account: (originalUtxo?.account || 'colored') as 'vanilla' | 'colored'
            };
          })

          setRgbUtxos(occupiedUtxos)

          console.log(`[RGB] Split complete: ${unoccupiedUtxos.length} unoccupied, ${occupiedUtxos.length} occupied`)
        } else {
          setBitcoinUtxos([])
          setRgbUtxos([])
        }
      } catch (rgbError) {
        console.error('[RGB] RGB fetcher failed, showing all as unoccupied:', rgbError)
        setRgbClassificationError('RGB proxy unavailable. Showing all UTXOs as unoccupied.')

        // Fallback: treat all as unoccupied if RGB fetcher fails
        const syncedAuxiliaryAddresses =
          addressGenerationMethod === 'bitcoin'
            ? await syncAuxiliaryBitcoinAddresses(mnemonic, selectedNetwork)
            : null

        const rgbDisplayAddress =
          addressGenerationMethod === 'bitcoin'
            ? (syncedAuxiliaryAddresses?.utxoHolderAddress || utxoHolderAddress)
            : walletAddress
        if (rgbDisplayAddress) {
          const holderCoinType = selectedNetwork === 'mainnet' ? 0 : 1
          const holderDerivationPath = `m/86'/${holderCoinType}'/0'/100/0`
          const holderUtxos = await fetchUTXOsFromBlockchain(rgbDisplayAddress, selectedNetwork)
          setBitcoinUtxos(holderUtxos.map(u => ({
            txid: u.txid,
            vout: u.vout,
            value: BigInt(u.value),
            address: rgbDisplayAddress,
            derivationPath: holderDerivationPath,
            account: 'vanilla' as const,
            chain: 0 as const,
            index: 0,
            isOccupied: false
          })))
          setRgbUtxos([])
        }
        else {
          setBitcoinUtxos([])
          setRgbUtxos([])
        }
      }

      setView('utxos')
    } catch (error) {
      console.error('Error fetching UTXOs:', error)
      setBitcoinUtxos([])
      setRgbUtxos([])
      setView('utxos')
    } finally {
      setLoadingUtxos(false)
    }
  }

  // Show loading while checking storage
  if (isLoading) {
    return (
      <div className="welcome-container">
        <LightningAnimation size={200} />
        <p className="welcome-subtitle">Loading...</p>
      </div>
    )
  }

  return (
    <>
      {view === 'welcome' && (
        <div className="welcome-container">
          <LightningAnimation size={200} />
          <div>
            <h1 className="welcome-title">Photon Wallet</h1>
            <p className="welcome-subtitle">A one-stop suite for RGB assets : Issue, Send & Receive RGB Assets like never before !</p>
          </div>
          <div className="welcome-buttons">
            <button className="btn-primary" onClick={handleCreateWallet}>
              Create New Wallet
            </button>
            <button className="btn-secondary" onClick={handleRestoreWallet}>
              Restore Wallet
            </button>
          </div>
        </div>
      )}

      {view === 'unlock' && (
        <div className="card-container unlock-container">
          <div className="version-label">V1.0.0</div>
          <LightningAnimation size={120} />
          <h2 className="brand-title" style={{ marginTop: '0.5rem' }}>PHOTON</h2>
          <p className="welcome-subtitle" style={{ marginBottom: '0' }}>A one-stop suite for RGB assets : Issue, Send & Receive RGB Assets like never before !</p>

          <div className="input-group unlock-input-group" style={{ marginTop: '-5px' }}>
            <div className="input-wrapper">
              <input
                type={showUnlockPassword ? 'text' : 'password'}
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="Enter your wallet password"
                className="password-input"
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              />
              <button
                className="toggle-password"
                onClick={() => setShowUnlockPassword(!showUnlockPassword)}
              >
                {showUnlockPassword ? '👁' : '👁‍🗨'}
              </button>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            className="btn-primary continue-btn"
            onClick={handleUnlock}
            disabled={!unlockPassword}
            style={{ marginTop: '0.5rem' }}
          >
            Unlock Wallet
          </button>

          <button className="forgot-link" onClick={handleForgotPassword} style={{ marginTop: '0.25rem' }}>
            Forgot the Password?
          </button>
        </div>
      )}

      {view === 'lock' && (
        <div className="card-container unlock-container">
          <div className="version-label">V1.0.0</div>
          <div className="welcome-logo">⚡</div>
          <h2 className="brand-title">PHOTON</h2>
          <p className="welcome-subtitle" style={{ marginBottom: '0' }}>A one-stop suite for RGB assets : Issue, Send & Receive RGB Assets like never before !</p>

          <div className="input-group unlock-input-group" style={{ marginTop: '-5px' }}>
            <div className="input-wrapper">
              <input
                type={showUnlockPassword ? 'text' : 'password'}
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="Enter your wallet password"
                className="password-input"
                onKeyDown={(e) => e.key === 'Enter' && handleUnlockFromLock()}
              />
              <button
                className="toggle-password"
                onClick={() => setShowUnlockPassword(!showUnlockPassword)}
              >
                {showUnlockPassword ? '👁' : '👁‍🗨'}
              </button>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            className="btn-primary continue-btn"
            onClick={handleUnlockFromLock}
            disabled={!unlockPassword}
            style={{ marginTop: '0.5rem' }}
          >
            Unlock Wallet
          </button>

          <button className="forgot-link" onClick={handleForgotPassword} style={{ marginTop: '0.25rem' }}>
            Forgot the Password?
          </button>
        </div>
      )}

      {view === 'forgot' && (
        <div className="card-container forgot-container">
          <div className="password-header">
            <button className="back-arrow" onClick={() => setView('lock')}>←</button>
            <h2 className="card-title">Reset Wallet</h2>
          </div>

          <div className="forgot-content">
            <p className="forgot-text">
              If you forget your password, you need to delete Photon Wallet, and then you can reset your password.
            </p>
            <p className="forgot-text">
              Please make sure you have backed up the 12-word mnemonic code or private key. Otherwise, please do not delete the wallet.
            </p>
          </div>

          <button className="btn-danger delete-btn" onClick={handleDeleteWallet}>
            Delete Wallet
          </button>
        </div>
      )}

      {view === 'create' && (
        <div className="card-container">
          <h2 className="card-title">Secret Recovery Phrase</h2>
          <p className="card-subtitle">
            Write down these 12 words and keep them safe.
          </p>
          <div className="mnemonic-box">
            {mnemonic.split(' ').map((word, index) => (
              <div key={index} className="mnemonic-word">
                {index + 1}. {word}
              </div>
            ))}
          </div>
          <button className="copy-mnemonic-btn" onClick={copyMnemonic}>
            {mnemonicCopied ? '✓ Copied!' : '⧉ Copy to Clipboard'}
          </button>
          <div className="button-group">
            <button className="btn-secondary" onClick={() => setView('welcome')}>
              Back
            </button>
            <button className="btn-primary" onClick={handleGoToVerify}>
              Continue
            </button>
          </div>
        </div>
      )}

      {view === 'verify' && (
        <div className="card-container">
          <div className="password-header">
            <button className="back-arrow" onClick={() => setView('create')}>←</button>
            <h2 className="card-title">Verify Recovery Phrase</h2>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ flex: 0.5 }}></div>
            <div className="progress-empty" style={{ flex: 1.5 }}></div>
          </div>
          <p className="card-subtitle password-info">
            Please enter the words at the following positions to verify you've saved your recovery phrase.
          </p>

          <div className="verify-words-container">
            {verifyWords.map((vw, index) => (
              <div key={index} className="verify-word-row">
                <span className="verify-position">Word #{vw.position + 1}</span>
                <input
                  type="text"
                  value={vw.userInput}
                  onChange={(e) => updateVerifyInput(index, e.target.value)}
                  placeholder={`Enter word #${vw.position + 1}`}
                  className="verify-input"
                />
              </div>
            ))}
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            className="btn-primary continue-btn"
            onClick={handleVerifyWords}
            disabled={verifyWords.some(w => !w.userInput.trim())}
          >
            Verify & Continue
          </button>
        </div>
      )}

      {view === 'password' && (
        <div className="card-container">
          <div className="password-header">
            <button className="back-arrow" onClick={() => setView('verify')}>←</button>
            <h2 className="card-title">Create a password</h2>
          </div>
          <div className="progress-bar">
            <div className="progress-fill"></div>
            <div className="progress-empty"></div>
          </div>
          <p className="card-subtitle password-info">
            This password will be used to unlock the wallet. It will be securely stored on your device. We will not be able to recover it for you if it is lost.
          </p>

          <div className="input-group">
            <label className="input-label">Password</label>
            <div className="input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="password-input"
              />
              <button
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '👁' : '👁‍🗨'}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Verify Password</label>
            <div className="input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                className="password-input"
              />
              <button
                className="toggle-password"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? '👁' : '👁‍🗨'}
              </button>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            className="btn-primary continue-btn"
            onClick={handlePasswordContinue}
            disabled={!password || !confirmPassword}
            style={{ marginTop: '-25px' }}
          >
            Continue
          </button>

          <button
            className="forgot-link"
            onClick={() => {
              setPassword('rehan123')
              setConfirmPassword('rehan123')
            }}
            style={{ marginTop: '0.5rem', textDecoration: 'underline' }}
          >
            Use Test Password
          </button>
        </div>
      )}

      {view === 'restore' && (
        <div className="card-container">
          <h2 className="card-title">Restore Wallet</h2>
          <p className="card-subtitle">Enter your 12-word recovery phrase.</p>
          <textarea
            value={restoreInput}
            onChange={(e) => setRestoreInput(e.target.value)}
            placeholder="Enter mnemonic..."
          />
          <button
            className="forgot-link"
            onClick={() => setRestoreInput('gasp attitude little organ palm crime layer answer dial twelve feed meadow')}
            style={{ marginTop: '0.5rem', textDecoration: 'underline' }}
          >
            Use Test Wallet
          </button>
          {error && <p className="error-text">{error}</p>}
          <div className="button-group">
            <button className="btn-secondary" onClick={() => setView('welcome')}>
              Back
            </button>
            <button className="btn-primary" onClick={handleConfirmRestore}>
              Continue
            </button>
          </div>
        </div>
      )}

      {view === 'dashboard' && (
        <div className="wallet-wrapper" onDoubleClick={() => balanceError && setBalanceError('')}>
          <div className="photon-dashboard-header">
            <div className="photon-brand-lockup">
              <div className="photon-brand-mark">⚡</div>
              <div className="photon-brand-copy">
                <span className="photon-brand-name">PHOTON</span>
                <span className="photon-brand-subtitle">Bitcoin + RGB wallet</span>
              </div>
            </div>
            <div className="photon-header-actions">
              <WalletHeaderButton
                ariaLabel="Select network"
                onClick={() => setShowNetworkModal(true)}
                className="wallet-network-trigger"
              >
                <span
                  className="wallet-network-symbol"
                  style={{ color: networks.find(n => n.id === selectedNetwork)?.color || '#f7931a' }}
                >
                  ₿
                </span>
                <span className="wallet-network-name">
                  {(networks.find((n) => n.id === selectedNetwork)?.name || 'Bitcoin').replace('Bitcoin ', '')}
                </span>
                <span className="wallet-network-caret">▾</span>
              </WalletHeaderButton>
              <WalletHeaderButton ariaLabel="Refresh balance" onClick={handleRefreshBalance} title="Refresh balance">
                ↻
              </WalletHeaderButton>
              <WalletHeaderButton ariaLabel="Open menu" onClick={() => setShowMenu(!showMenu)} title="Open menu">
                ≡
              </WalletHeaderButton>
            </div>
          </div>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="dropdown-menu">
              <div className="menu-item">
                <span className="menu-icon">💬</span>
                <span>Get Support</span>
                <span className="menu-arrow">↗</span>
              </div>
              <div className="menu-item">
                <span className="menu-icon">📋</span>
                <span>Backup Mnemonic Phrase</span>
                <span className="menu-badge">!</span>
                <span className="menu-arrow">›</span>
              </div>
              <div className="menu-item" onClick={() => {
                setShowMenu(false)
                setView('user-settings')
              }}>
                <span className="menu-icon">⚙</span>
                <span>Settings</span>
                <span className="menu-arrow">›</span>
              </div>
              <div className="menu-item" onClick={() => {
                setShowMenu(false)
                setView('settings')
              }}>
                <span className="menu-icon">🔧</span>
                <span>Admin</span>
                <span className="menu-arrow">›</span>
              </div>
              <div className="menu-item" onClick={() => {
                setShowMenu(false)
                setView('network-settings')
              }}>
                <span className="menu-icon">🌐</span>
                <span>Network Settings</span>
                <span className="menu-arrow">›</span>
              </div>
              {/* Faucet menu - only visible on TestNet */}
              {(selectedNetwork === 'testnet3' || selectedNetwork === 'testnet4' || selectedNetwork === 'regtest') && (
                <div className="menu-item" onClick={() => {
                  setShowMenu(false)
                  setView('faucet')
                }}>
                  <span className="menu-icon">🚰</span>
                  <span>Faucet</span>
                  <span className="menu-arrow">›</span>
                </div>
              )}
              <div className="menu-item">
                <span className="menu-icon">ⓘ</span>
                <span>About</span>
                <span className="menu-arrow">›</span>
              </div>
              <div className="menu-divider"></div>
              <div className="menu-item" onClick={handleLock}>
                <span className="menu-icon">🔒</span>
                <span>Lock</span>
              </div>
              <div className="menu-item menu-danger" onClick={handleSignOut}>
                <span className="menu-icon">↪</span>
                <span>Sign Out</span>
              </div>
            </div>
          )}

          <div className="wallet-scroll-container photon-dashboard-scroll" ref={scrollContainerRef}>
            <section className="photon-balance-panel">
              <div className="photon-balance-topline">
                <span className="photon-balance-kicker">Portfolio value</span>
                <button className="photon-info-trigger" onClick={() => setShowBalanceInfo(!showBalanceInfo)} aria-label="Show balance details" type="button">ⓘ</button>
              </div>

              <div className="photon-balance-amount-row">
                {loadingBalance ? (
                  <div className="skeleton-loader"></div>
                ) : (
                  <>
                    <span className="photon-balance-amount">{(parseFloat(btcBalance) + pendingBalance).toFixed(8)}</span>
                    <span className="photon-balance-unit">BTC</span>
                  </>
                )}
              </div>

              <div className="photon-balance-fiat">{calculateUsdValue(String(parseFloat(btcBalance) + pendingBalance))}</div>
              <div className="photon-balance-caption">
                Main balance {formatBtcValue(btcBalance, 8)} BTC
                {pendingBalance > 0 ? ` + ${formatBtcValue(pendingBalance, 8)} pending` : ''}
              </div>

              {balanceError && (
                <div className="balance-error">
                  <span className="error-icon">⚠️</span>
                  <span className="error-text">{balanceError}</span>
                </div>
              )}

              {showBalanceInfo && (
                <>
                  <div className="balance-popup-overlay" onClick={() => setShowBalanceInfo(false)}></div>
                  <div className="balance-popup" onClick={() => setShowBalanceInfo(false)}>
                    <div className="balance-popup-row">
                      <span className="balance-popup-label">Available</span>
                      <div className="balance-popup-value">
                        <span className="balance-popup-btc">{formatBtcValue(btcBalance, 8)} BTC</span>
                      </div>
                    </div>
                    <div className="balance-popup-row">
                      <span className="balance-popup-label">Unconfirmed</span>
                      <div className="balance-popup-value">
                        <span className="balance-popup-btc">{formatBtcValue(pendingBalance, 8)} BTC</span>
                      </div>
                    </div>
                    <div className="balance-popup-row">
                      <span className="balance-popup-label">Assets tracked</span>
                      <div className="balance-popup-value">
                        <span className="balance-popup-btc">{assets.length}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="photon-stats-grid">
                <WalletStatCard label="Available" value={`${formatBtcValue(btcBalance, 8)} BTC`} tone="positive" />
                <WalletStatCard label="Pending" value={`${formatBtcValue(pendingBalance, 8)} BTC`} tone="warning" />
                <WalletStatCard label="Assets" value={String(assets.length)} />
              </div>
            </section>

            <section className="photon-address-bar">
              <div className="address-bar-item">
                <span className="address-bar-badge">BTC</span>
                <span className="address-bar-value">
                  {loadingAddress ? 'Loading...' : loadingExpand ? '···' : truncateAddress(walletAddress || btcAddress) || 'No address'}
                </span>
                <button
                  className="address-bar-action"
                  onClick={() => { navigator.clipboard.writeText(walletAddress || btcAddress); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  title={copied ? 'Copied!' : 'Copy address'}
                  type="button"
                >{copied ? '✓' : '⧉'}</button>
                <button
                  className="address-bar-action"
                  onClick={handleExpandAddress}
                  title={addressGenerationMethod === 'bitcoin' ? 'Expand disabled in Bitcoin mode' : 'Expand'}
                  disabled={addressGenerationMethod === 'bitcoin'}
                  type="button"
                >⊡</button>
              </div>
              <div className="address-bar-item">
                <span className="address-bar-badge icp">ICP</span>
                <span className="address-bar-value">{truncateAddress(principalId) || 'No Principal'}</span>
                <button
                  className="address-bar-action"
                  onClick={copyPrincipal}
                  title={copiedPrincipal ? 'Copied!' : 'Copy Principal ID'}
                  type="button"
                >{copiedPrincipal ? '✓' : '⧉'}</button>
              </div>
            </section>

            <section className="dashboard-section">
              <div className="photon-actions-grid">
                <button className="photon-action-card" onClick={() => setView('receive')}>
                  <div className="action-icon receive">↓</div>
                  <span className="action-label">Receive</span>
                  <span className="action-subtext">Bitcoin address and RGB invoices</span>
                </button>
                <button className="photon-action-card" onClick={() => setView('send')}>
                  <div className="action-icon send">↗</div>
                  <span className="action-label">Send</span>
                  <span className="action-subtext">Broadcast Bitcoin transactions</span>
                </button>
                <button className="photon-action-card" onClick={handleViewUtxos}>
                  <div className="action-icon utxos">▤</div>
                  <span className="action-label">UTXOs</span>
                  <span className="action-subtext">Manage RGB holder outputs</span>
                </button>
              </div>
            </section>

            <section className="dashboard-section dashboard-content-panel">
              <div className="tabs-container photon-dashboard-tabs">
              <button
                className={`tab-btn ${activeTab === 'assets' ? 'active' : ''}`}
                onClick={() => setActiveTab('assets')}
              >
                Assets
              </button>
              <button
                className={`tab-btn ${activeTab === 'activities' ? 'active' : ''}`}
                onClick={() => setActiveTab('activities')}
              >
                Activities
              </button>
            </div>

            {activeTab === 'assets' && (
              <div className="asset-list">
                <div className="section-inline-note">Tracked assets for {(networks.find((n) => n.id === selectedNetwork)?.name || 'Bitcoin').replace('Bitcoin ', '')}.</div>
                {assets.length === 0 ? (
                  <div className="assets-empty">
                    <div className="empty-icon">🗃️</div>
                    <p className="empty-text">No assets yet</p>
                    <p className="empty-subtitle">RGB assets you add will appear here</p>
                    <button className="empty-cta-btn" onClick={() => setView('add-assets')}>
                      + Add Asset
                    </button>
                  </div>
                ) : (
                  <>
                    {assets.map((asset) => (
                      <div key={asset.id} className="asset-item">
                        <div className="asset-left">
                          <div
                            className="asset-icon"
                            style={{ background: asset.color }}
                          >
                            {asset.name[0]}
                          </div>
                          <div className="asset-info">
                            <div className="asset-item-main">
                              <span className="asset-name">{asset.name}</span>
                              <span className="asset-badge">{asset.unit}</span>
                            </div>
                            <span className="asset-amount">
                              {asset.amount} {asset.unit}
                            </span>
                            {(Number(asset.rgbOffchainOutbound || 0) > 0 || Number(asset.rgbOffchainInbound || 0) > 0) && (
                              <span className="asset-lock-note">
                                Instant: {asset.rgbOffchainOutbound || '0'} {asset.unit} outbound • {asset.rgbOffchainInbound || '0'} inbound
                              </span>
                            )}
                            {asset.rgbLockReason && (
                              <span className="asset-lock-note">
                                {asset.rgbLockReason}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="asset-arrow">
                          <span className="asset-symbol">{asset.unit}</span>
                          <span className="asset-chevron">›</span>
                        </div>
                      </div>
                    ))}
                    <button className="add-assets-btn" onClick={() => setView('add-assets')}>
                      + Add Assets
                    </button>
                  </>
                )}
              </div>
            )}

            {activeTab === 'activities' && (
              <div className="activities-list">
                <div className="section-inline-note">Recent wallet activity and settlement status.</div>
                {loadingActivities ? (
                  <div className="activities-loading">
                    <div className="skeleton-loader"></div>
                    <div className="skeleton-loader"></div>
                    <div className="skeleton-loader"></div>
                  </div>
                ) : activities.length === 0 ? (
                  <div className="activities-empty">
                    <div className="empty-icon">📋</div>
                    <p className="empty-text">No activities yet</p>
                    <p className="empty-subtitle">Your transactions will appear here</p>
                    <button className="empty-cta-btn" onClick={() => setView('receive')}>
                      Receive Bitcoin
                    </button>
                  </div>
                ) : (
                  (() => {
                    // Group activities by date
                    const groups: { [date: string]: BitcoinActivity[] } = {};
                    activities.forEach(activity => {
                      if (!groups[activity.date]) {
                        groups[activity.date] = [];
                      }
                      groups[activity.date].push(activity);
                    });

                    return Object.entries(groups).map(([date, dateActivities]) => (
                      <div key={date} className="activity-date-group">
                        <div className="activity-date-header">{date}</div>
                        {dateActivities.map((activity) => {
                          const explorerUrl = activity.txid
                            ? (selectedNetwork === 'mainnet'
                            ? `https://blockstream.info/tx/${activity.txid}`
                            : `https://blockstream.info/testnet/tx/${activity.txid}`)
                            : null;

                          const shortTxid = activity.txid ? `${activity.txid.slice(0, 4)}...${activity.txid.slice(-4)}` : 'off-chain';

                          return (
                            <div
                              key={`${activity.txid || activity.note || 'offchain'}-${activity.timestamp || activity.date}`}
                              className="activity-item"
                              onClick={() => {
                                if (explorerUrl) {
                                  window.open(explorerUrl, '_blank')
                                }
                              }}
                            >
                              <div className="activity-left">
                                <div className={`activity-icon-circle ${activity.route === 'lightning' ? 'lightning' : activity.type.toLowerCase()}`}>
                                  {activity.route === 'lightning' ? (
                                    <span className="activity-lightning-icon">⚡</span>
                                  ) : activity.type === 'Receive' ? (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
                                  ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                                  )}
                                </div>
                                <div className="activity-info">
                                  <span className="activity-type">{activity.route === 'lightning' ? 'Lightning' : activity.type}</span>
                                  <div className="activity-tx-row">
                                    <span className="activity-txid">
                                      {activity.route === 'lightning'
                                        ? (activity.settlementLabel || 'Off-Chain Settlement')
                                        : `tx: ${shortTxid}`}
                                    </span>
                                    {explorerUrl && <span className="activity-link-icon">↗</span>}
                                  </div>
                                  {activity.note && (
                                    <span className="activity-note">{activity.note}</span>
                                  )}
                                </div>
                              </div>
                              <div className="activity-right">
                                <span className={`activity-amount-new ${activity.type.toLowerCase()}`}>
                                  {activity.type === 'Send' ? '-' : ''}{activity.amount.toFixed(activity.unit === 'BTC' ? 8 : 2)} {activity.unit || 'BTC'}
                                </span>
                                <span className={`activity-status-new activity-status-pill ${activity.status.toLowerCase()}`}>
                                  {activity.route === 'lightning' ? 'Off-Chain Settlement' : activity.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()
                )}
              </div>
            )}
            </section>
          </div>
        </div>
      )}

      {/* Receive Menu Screen */}
      {view === 'receive' && (
        <div className="receive-container">
          <div className="receive-header">
            <button className="back-arrow" onClick={() => setView('dashboard')}>←</button>
            <h2 className="receive-title">Receive</h2>
          </div>

          <div className="receive-hero">
            <div className="flow-kicker">Funding</div>
            <div className="flow-intro-title">Choose how funds should arrive</div>
            <div className="flow-intro-copy">Receive on-chain BTC, generate an RGB invoice, or route funds into Lightning.</div>
          </div>

          <div className="receive-options">
            <button className="receive-option" onClick={() => setView('receive-rgb')}>
              <span className="receive-option-icon rgb">◈</span>
              <span className="receive-option-copy">
                <span className="receive-option-text">Receive RGB Asset</span>
                <span className="receive-option-subtext">Generate an asset invoice for Photon RGB transfers.</span>
              </span>
              <span className="receive-option-arrow">›</span>
            </button>
            <button className="receive-option" onClick={() => {
              setView('receive-lightning')
              setLightningReceiveStep('form')
              setLightningReceiveInvoice('')
              setLightningReceiveError('')
            }}>
              <span className="receive-option-icon lightning">⚡</span>
              <span className="receive-option-copy">
                <span className="receive-option-text">Receive Instantly</span>
                <span className="receive-option-subtext">Generate a Lightning PHO invoice for off-chain settlement.</span>
              </span>
              <span className="receive-option-arrow">›</span>
            </button>
            <button className="receive-option" onClick={() => setView('receive-btc')}>
              <span className="receive-option-icon btc">₿</span>
              <span className="receive-option-copy">
                <span className="receive-option-text">Receive Bitcoin on-chain</span>
                <span className="receive-option-subtext">Share your wallet address and QR code.</span>
              </span>
              <span className="receive-option-arrow">›</span>
            </button>
            <button className="receive-option" onClick={() => setView('convert-lightning')}>
              <span className="receive-option-icon lightning">⚡</span>
              <span className="receive-option-copy">
                <span className="receive-option-text">Convert Bitcoin to Lightning</span>
                <span className="receive-option-subtext">Use the bridge address for Lightning conversion.</span>
              </span>
              <span className="receive-option-arrow">›</span>
            </button>
            <button className="receive-option" onClick={() => setView('swap')}>
              <span className="receive-option-icon swap">⇄</span>
              <span className="receive-option-copy">
                <span className="receive-option-text">Swap BTC</span>
                <span className="receive-option-subtext">Move between wallet funding rails and test flows.</span>
              </span>
              <span className="receive-option-arrow">›</span>
            </button>
          </div>
        </div>
      )}

      {/* Receive Bitcoin On-chain Screen */}
      {view === 'receive-btc' && (
        <div className="receive-container">
          <div className="receive-header">
            <button className="back-arrow" onClick={() => setView('receive')}>←</button>
            <h2 className="receive-title">Receive Bitcoin</h2>
          </div>

          <div className="receive-btc-content">
            <div className="qr-container">
              <QRCodeSVG
                value={walletAddress || btcAddress || 'no-address'}
                size={180}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
                imageSettings={{
                  src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23f7931a'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-size='16' font-weight='bold'%3E₿%3C/text%3E%3C/svg%3E",
                  width: 36,
                  height: 36,
                  excavate: true,
                }}
              />
            </div>

            <div className="btc-address-box dark">
              <span className="btc-address-text">{walletAddress || btcAddress || 'No address available'}</span>
            </div>
          </div>

          <button className="btn-primary copy-btc-btn" onClick={() => {
            navigator.clipboard.writeText(walletAddress || btcAddress)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}>
            {copied ? '✓ Copied!' : '⧉ Copy bitcoin address'}
          </button>

          {selectedNetwork === 'regtest' && (
            <button className="btn-secondary copy-btc-btn" onClick={openRegtestFaucet}>
              🚰 Open Photon faucet
            </button>
          )}
        </div>
      )}

      {/* Convert Bitcoin to Lightning Screen */}
      {view === 'convert-lightning' && (
        <div className="receive-container">
          <div className="receive-header">
            <button className="back-arrow" onClick={() => setView('receive')}>←</button>
            <h2 className="receive-title">Convert Bitcoin to ⚡ Lightning</h2>
          </div>

          <div className="receive-btc-content">
            <div className="receive-hero compact">
              <div className="flow-kicker">Bridge</div>
              <div className="flow-intro-title">Send BTC to the Lightning bridge</div>
              <div className="flow-intro-copy">Use this address to move test funds into the Lightning conversion flow.</div>
            </div>

            <div className="qr-container">
              <QRCodeSVG
                value={lightningAddress || 'no-address'}
                size={180}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
                imageSettings={{
                  src: "/lightning-bitcoin.png",
                  width: 36,
                  height: 36,
                  excavate: true,
                }}
              />
            </div>

            <button className="btn-primary copy-btc-btn" onClick={() => {
              navigator.clipboard.writeText(lightningAddress)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }} style={{ marginBottom: '1rem' }}>
              {copied ? '✓ Copied!' : '⧉ Copy bitcoin address'}
            </button>

            <div className="btc-address-box dark">
              <span className="btc-address-text">{lightningAddress || 'No address available'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Receive RGB Assets Screen */}
      {view === 'receive-rgb' && (
        <div className="receive-container receive-rgb-container">
          <div className="receive-header">
            <button className="back-arrow" onClick={() => {
              setView('receive')
              setRgbInvoiceStep('form')
              setRgbInvoice('')
              setRgbError('')
            }}>←</button>
            <h2 className="receive-title">Receive RGB assets</h2>
            <div className="receive-header-status">
              <span className={`rgb-status-dot ${rgbWalletOnline ? 'online' : 'offline'}`}></span>
              <span>{rgbWalletOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          {rgbInvoiceStep === 'form' ? (
            <>
              {/* Form View */}
              <div className="receive-rgb-content">

                {/* Asset Selection */}
                <div className="rgb-field">
                  <div className="rgb-label-row">
                    <label className="rgb-label">Assets</label>
                    <button
                      className="rgb-info-btn"
                      onClick={() => setRgbError('')}
                      title="Leave empty to accept any RGB asset"
                    >ⓘ</button>
                  </div>
                  <div className="rgb-select-wrapper">
                    <select
                      className="rgb-select"
                      value={rgbAsset}
                      onChange={(e) => setRgbAsset(e.target.value)}
                    >
                      <option value="">Accept any RGB asset</option>
                      {assets.filter(a => a.id !== 'bitcoin' && a.id !== 'lightning-btc').map((asset) => (
                        <option key={asset.id} value={asset.id}>{asset.name}</option>
                      ))}
                    </select>
                    <span className="rgb-select-arrow">▾</span>
                  </div>
                  {!rgbAsset && (
                    <p className="rgb-helper-text">Selecting "Accept any RGB asset" allows the sender to choose the asset type</p>
                  )}
                </div>

                {/* Amount Input with Toggle */}
                <div className="rgb-field">
                  <div className="rgb-label-row">
                    <label className="rgb-label">Amount</label>
                    <label className="rgb-toggle-label">
                      <input
                        type="checkbox"
                        checked={openAmount}
                        onChange={(e) => {
                          setOpenAmount(e.target.checked)
                          if (e.target.checked) setRgbAmount('')
                        }}
                        className="rgb-toggle-input"
                      />
                      <span className="rgb-toggle-switch"></span>
                      <span className="rgb-toggle-text">Open Amount</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    className="rgb-input"
                    placeholder={openAmount ? "Sender will choose amount" : "Enter amount"}
                    value={openAmount ? '' : rgbAmount}
                    onChange={(e) => setRgbAmount(e.target.value)}
                    disabled={openAmount}
                  />
                  {openAmount && (
                    <p className="rgb-helper-text">Enabling "Open Amount" lets the sender specify how much to send</p>
                  )}
                </div>

                {/* BTC Balance Check — only shown when balance is zero */}
                {parseFloat(btcBalance) === 0 && (
                  <div className="rgb-info-box">
                    <div className="rgb-info-icon">⚠️</div>
                    <div className="rgb-info-content">
                      <p className="rgb-info-title">Gas Requirement</p>
                      <p className="rgb-info-desc">You need a small amount of {selectedNetwork === 'mainnet' ? 'Bitcoin' : 'Testnet BTC'} for RGB transfers. Current balance: {btcBalance} BTC</p>
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {rgbError && (
                  <div className="rgb-error-box">
                    <span className="error-icon">⚠</span>
                    <span className="error-text">{rgbError}</span>
                  </div>
                )}
              </div>

              {/* Generate Invoice Button */}
              <button
                className="btn-primary create-invoice-btn"
                disabled={rgbGenerating || parseFloat(btcBalance) === 0}
                onClick={async () => {
                  console.log('[RGB Receive] Generate Invoice clicked', {
                    network: selectedNetwork,
                    assetKey: rgbAsset || null,
                    openAmount,
                    rgbAmount,
                    btcBalance,
                  })
                  setRgbGenerating(true)
                  setRgbError('')

                  try {
                    if (!mnemonic || !coloredAddress) {
                      setRgbWalletOnline(false)
                      setRgbError('Unlock the wallet and wait for the colored Taproot address before generating an RGB invoice.')
                      setRgbGenerating(false)
                      return
                    }

                    if (!rgbAsset) {
                      setRgbError('Select an RGB asset before generating an invoice.')
                      setRgbGenerating(false)
                      return
                    }

                    const contractsKey = getNetworkContractsKey(selectedNetwork)
                    const contractSettings = await getStorageData([contractsKey])
                    const storedContractMapRaw = contractSettings[contractsKey]
                    const storedContractMap =
                      typeof storedContractMapRaw === 'string'
                        ? JSON.parse(storedContractMapRaw) as Record<string, string>
                        : {}

                    const fallbackImportableAsset = importableAssets.find((candidate) => candidate.asset.id === rgbAsset)
                    const contractId =
                      storedContractMap[rgbAsset] ||
                      fallbackImportableAsset?.contracts?.[selectedNetwork] ||
                      ''

                    console.log('[RGB Receive] Resolved local asset mapping', {
                      assetKey: rgbAsset,
                      contractId: contractId || null,
                    })

                    if (!contractId) {
                      setRgbError('Selected asset is not registered with an RGB contract ID in this wallet.')
                      setRgbGenerating(false)
                      return
                    }

                    const invoiceAmount = openAmount ? 0 : Math.floor(parseFloat(rgbAmount) || 0)
                    if (!openAmount && invoiceAmount <= 0) {
                      console.warn('[RGB Receive] Invalid amount supplied for fixed-amount invoice')
                      setRgbError('Enter a valid RGB amount or enable Open Amount.')
                      setRgbGenerating(false)
                      return
                    }

                    const isRegtestRgbInvoice = selectedNetwork === 'regtest'

                    console.log('[RGB Receive] Prepared invoice request', {
                      mode: isRegtestRgbInvoice ? 'backend-regtest' : 'client-side',
                      contractId,
                      invoiceAmount,
                      openAmount,
                    })

                    if (isRegtestRgbInvoice) {
                      const walletKey = await getRegtestWalletKey()
                      const invoiceResult = await createRegtestRgbInvoice({
                        assetId: contractId,
                        amount: invoiceAmount,
                        openAmount,
                        walletKey,
                      })

                      console.log('[RGB Receive] Backend regtest invoice created successfully', {
                        recipientId: invoiceResult.recipient_id,
                        batchTransferIndex: invoiceResult.batch_transfer_idx,
                      })

                      setRgbWalletOnline(true)
                      setRgbInvoice(invoiceResult.invoice)
                      setRgbInvoiceStep('invoice')
                    } else {
                      const invoiceResult = await createRgbInvoice(contractId, invoiceAmount)
                      await registerRgbInvoiceSecret({
                        walletKey: getBackendWalletKey(selectedNetwork),
                        network: selectedNetwork,
                        assetId: contractId,
                        amount: invoiceAmount,
                        invoice: invoiceResult.invoice,
                        recipientId: `bcrt:utxob:${invoiceResult.blindedSeal}`,
                        blindingSecret: invoiceResult.secret,
                      })

                      console.log('[RGB Receive] Client-side invoice created successfully', {
                        txid: invoiceResult.txid,
                        vout: invoiceResult.vout,
                        source: invoiceResult.source,
                      })

                      setRgbWalletOnline(true)
                      setRgbInvoice(invoiceResult.invoice)
                      setRgbInvoiceStep('invoice')
                    }
                  } catch (error) {
                    console.error('[RGB Receive] Error generating RGB invoice:', error)
                    setRgbWalletOnline(Boolean(mnemonic && coloredAddress))
                    setRgbError(`Failed to generate invoice: ${error instanceof Error ? error.message : 'Unknown error'}`)
                  } finally {
                    console.log('[RGB Receive] Generate Invoice flow complete')
                    setRgbGenerating(false)
                  }
                }}
              >
                {rgbGenerating ? (
                  <>
                    <span className="spinner-small"></span>
                    Generating Invoice...
                  </>
                ) : (
                  'Generate Invoice'
                )}
              </button>
            </>
          ) : (
            <>
              {/* Invoice Display View */}
              <div className="receive-rgb-invoice">
                {/* Asset Icon */}
                <div className="rgb-invoice-header">
                  <div className="rgb-invoice-icon">B</div>
                  <h3 className="rgb-invoice-asset-name">BITCOIN</h3>
                  <p className="rgb-invoice-subtitle">Please send only RGB assets to this invoice.</p>
                </div>

                {/* Invoice Label */}
                <div className="rgb-invoice-section">
                  <label className="rgb-invoice-label">RGB Invoice</label>
                  <div className="rgb-invoice-box">
                    <p className="rgb-invoice-text">{rgbInvoice}</p>
                  </div>
                </div>

                {/* QR Code */}
                <div className="rgb-qr-container">
                  <QRCodeSVG
                    value={rgbInvoice}
                    size={120}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                  />
                </div>

                {/* Copy Button */}
                <button
                  className="btn-primary rgb-copy-btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(rgbInvoice)
                    setRgbCopied(true)
                    setTimeout(() => setRgbCopied(false), 2000)
                  }}
                >
                  <span className="btn-icon">{rgbCopied ? '✓' : '📋'}</span>
                  {rgbCopied ? 'Copied!' : 'Copy Invoice'}
                </button>

                {/* Waiting Status */}
                <div className="rgb-waiting-status">
                  <div className="rgb-waiting-icon">⏳</div>
                  <p className="rgb-waiting-text">Waiting for payment...</p>
                </div>

                {/* Invoice Info */}
                <div className="rgb-invoice-info">
                  <div className="rgb-invoice-info-item">
                    <span className="rgb-invoice-info-label">Valid for:</span>
                    <span className="rgb-invoice-info-value">24 hours</span>
                  </div>
                  <div className="rgb-invoice-info-item">
                    <span className="rgb-invoice-info-label">Network:</span>
                    <span className="rgb-invoice-info-value">{networks.find(n => n.id === selectedNetwork)?.name}</span>
                  </div>
                </div>
              </div>

              {/* Back to Form Button */}
              <button
                className="btn-secondary"
                onClick={() => {
                  setRgbInvoiceStep('form')
                  setRgbInvoice('')
                  setRgbAsset('')
                  setRgbAmount('')
                  setOpenAmount(false)
                }}
              >
                Create New Invoice
              </button>
            </>
          )}
        </div>
      )}

      {/* Receive Lightning RGB Screen */}
      {view === 'receive-lightning' && (
        <div className="receive-container receive-rgb-container">
          <div className="receive-header">
            <button className="back-arrow" onClick={() => {
              setView('receive')
              setLightningReceiveStep('form')
              setLightningReceiveInvoice('')
              setLightningReceiveError('')
            }}>←</button>
            <h2 className="receive-title">Receive instantly</h2>
            <div className="receive-header-status">
              <span className="rgb-status-dot online"></span>
              <span>Lightning</span>
            </div>
          </div>

          {lightningReceiveStep === 'form' ? (
            <>
              <div className="receive-rgb-content">

                <div className="rgb-field">
                  <div className="rgb-label-row">
                    <label className="rgb-label">Asset</label>
                  </div>
                  <div className="rgb-select-wrapper">
                    <select
                      className="rgb-select"
                      value={lightningReceiveAsset}
                      onChange={(e) => setLightningReceiveAsset(e.target.value)}
                    >
                      {assets.filter(a => a.id !== 'bitcoin' && a.id !== 'lightning-btc').map((asset) => (
                        <option key={asset.id} value={asset.id}>{asset.name}</option>
                      ))}
                    </select>
                    <span className="rgb-select-arrow">▾</span>
                  </div>
                </div>

                <div className="rgb-field">
                  <div className="rgb-label-row">
                    <label className="rgb-label">Amount</label>
                  </div>
                  <input
                    type="text"
                    className="rgb-input"
                    placeholder="Enter amount"
                    value={lightningReceiveAmount}
                    onChange={(e) => setLightningReceiveAmount(e.target.value)}
                  />
                  <p className="rgb-helper-text">This creates a fixed-amount Lightning RGB invoice. Current instant-pay path uses a 3,000 sat Lightning bridge amount under the hood.</p>
                </div>

                <div className="rgb-info-box">
                  <div className="rgb-info-icon">⚡</div>
                  <div className="rgb-info-content">
                    <p className="rgb-info-title">Off-Chain Settlement</p>
                    <p className="rgb-info-desc">The sender will pay this invoice instantly through the Lightning-enabled RGB node, so there is no new Bitcoin txid for the payment itself.</p>
                  </div>
                </div>

                {lightningReceiveError && (
                  <div className="rgb-error-box">
                    <span className="error-icon">⚠</span>
                    <span className="error-text">{lightningReceiveError}</span>
                  </div>
                )}
              </div>

              <button
                className="btn-primary create-invoice-btn"
                disabled={lightningReceiveGenerating || selectedNetwork !== 'regtest'}
                onClick={async () => {
                  setLightningReceiveGenerating(true)
                  setLightningReceiveError('')

                  try {
                    if (selectedNetwork !== 'regtest') {
                      throw new Error('Instant PHO receive is currently enabled for regtest only')
                    }

                    const selectedAsset = assets.find((asset) => asset.id === lightningReceiveAsset)
                    if (!selectedAsset) {
                      throw new Error('Select an RGB asset before generating a Lightning invoice.')
                    }

                    const invoiceAmount = Math.floor(parseFloat(lightningReceiveAmount) || 0)
                    if (invoiceAmount <= 0) {
                      throw new Error('Enter a valid asset amount.')
                    }

                    const contractsKey = getNetworkContractsKey(selectedNetwork)
                    const contractSettings = await getStorageData([contractsKey])
                    const storedContractMapRaw = contractSettings[contractsKey]
                    const storedContractMap =
                      typeof storedContractMapRaw === 'string'
                        ? JSON.parse(storedContractMapRaw) as Record<string, string>
                        : {}

                    const contractId = storedContractMap[lightningReceiveAsset]
                    if (!contractId) {
                      throw new Error('Selected asset is not mapped to an RGB contract in this wallet.')
                    }

                    const walletKey = await getRegtestWalletKey()
                    const result = await createRegtestLightningInvoice({
                      assetId: contractId,
                      amount: invoiceAmount,
                      walletKey,
                    })

                    setSendRouteHint(`Lightning invoice created for ${invoiceAmount} ${selectedAsset.unit}`)
                    setLightningReceiveInvoice(result.invoice)
                    setLightningReceiveStep('invoice')
                  } catch (error: any) {
                    console.error('Error generating Lightning invoice:', error)
                    setLightningReceiveError(error.message || 'Failed to generate Lightning invoice')
                  } finally {
                    setLightningReceiveGenerating(false)
                  }
                }}
              >
                {lightningReceiveGenerating ? (
                  <>
                    <span className="spinner-small"></span>
                    Generating Lightning Invoice...
                  </>
                ) : (
                  'Generate Instant Invoice'
                )}
              </button>
            </>
          ) : (
            <div className="receive-rgb-content">
              <div className="receive-rgb-invoice">
                <div className="rgb-invoice-header">
                  <div className="rgb-invoice-icon" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)' }}>⚡</div>
                  <h3 className="rgb-invoice-asset-name">LIGHTNING PHO</h3>
                  <p className="rgb-invoice-subtitle">Pay this invoice from Photon Instant Pay to settle off-chain.</p>
                </div>

                <div className="rgb-invoice-section">
                  <label className="rgb-invoice-label">Lightning Invoice</label>
                  <div className="rgb-invoice-box">
                    <p className="rgb-invoice-text">{lightningReceiveInvoice}</p>
                  </div>
                </div>

                <div className="rgb-qr-container">
                  <QRCodeSVG
                    value={lightningReceiveInvoice}
                    size={120}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                  />
                </div>

                <button
                  className="btn-primary rgb-copy-btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(lightningReceiveInvoice)
                    setLightningReceiveCopied(true)
                    setTimeout(() => setLightningReceiveCopied(false), 2000)
                  }}
                >
                  <span className="btn-icon">{lightningReceiveCopied ? '✓' : '📋'}</span>
                  {lightningReceiveCopied ? 'Copied!' : 'Copy Lightning Invoice'}
                </button>

                <button
                  className="btn-secondary rgb-copy-btn"
                  onClick={() => {
                    setLightningReceiveStep('form')
                    setLightningReceiveInvoice('')
                    setLightningReceiveError('')
                  }}
                >
                  Create Another
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Assets Screen */}
      {view === 'add-assets' && (
        <div className="receive-container add-assets-container">
          <div className="receive-header">
            <button className="back-arrow" onClick={() => setView('dashboard')}>←</button>
            <h2 className="receive-title">Add Assets</h2>
            <a
              href="https://photonbolt.xyz/asset/issue"
              target="_blank"
              rel="noopener noreferrer"
              className="issue-assets-link"
            >
              Issue assets
            </a>
          </div>

          <div className="add-assets-content">
            <input
              type="text"
              className="token-input"
              placeholder="Token contract address, or token name"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value)
                if (addAssetError) setAddAssetError('')
                if (addAssetSuccess) setAddAssetSuccess('')
              }}
            />

            {addAssetError && (
              <div className="rgb-error-box add-asset-status">
                <span className="error-text">{addAssetError}</span>
              </div>
            )}

            {addAssetSuccess && (
              <p className="success-text add-asset-status">{addAssetSuccess}</p>
            )}

            <div className="asset-registry-row">
              <span className="registry-text">Display data for all public RGB assets</span>
              <a
                href="https://faucet.photonbolt.xyz/asset-registry.html"
                target="_blank"
                rel="noopener noreferrer"
                className="registry-link"
              >
                Asset Registry ↗
              </a>
            </div>
          </div>

          <button
            className="btn-secondary import-btn"
            disabled={!tokenInput.trim() || importingAsset}
            onClick={handleImportAsset}
          >
            {importingAsset ? 'Importing...' : 'Import'}
          </button>
        </div>
      )}

      {/* Settings Screen */}
      {view === 'settings' && (
        <div className="settings-container">
          <div className="password-header">
            <button className="back-arrow" onClick={() => setView('dashboard')}>←</button>
            <h2 className="card-title">Admin</h2>
          </div>

          <div className="settings-content">
            <div className="settings-section">
              <h3 className="settings-section-title">Reference</h3>
              <p className="settings-info">Wallet identifiers and developer-facing values for troubleshooting.</p>
            </div>

            <div className="input-group">
              <label className="input-label">Principal ID</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.9rem 1rem',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px'
                }}
              >
                <div style={{ flex: 1, fontSize: '0.9rem', color: '#fff', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {principalId || 'No Principal'}
                </div>
                <button
                  className="icon-btn-sm"
                  onClick={copyPrincipal}
                  title={copiedPrincipal ? 'Copied!' : 'Copy Principal ID'}
                >
                  {copiedPrincipal ? '✓' : '⧉'}
                </button>
              </div>
            </div>

            <div className="settings-section">
              <h3 className="settings-section-title">Canister Configuration</h3>
              <p className="settings-info">Configure custom canister IDs for wallet address and balance retrieval.</p>
            </div>

            <div className="input-group">
              <label className="input-label">MainNet Canister ID</label>
              <input
                type="text"
                className="settings-input"
                placeholder={DEFAULT_MAINNET_CANISTER}
                value={mainnetCanisterId}
                onChange={(e) => setMainnetCanisterId(e.target.value)}
              />
              <span className="settings-hint">Default: {DEFAULT_MAINNET_CANISTER}</span>
            </div>

            <div className="input-group">
              <label className="input-label">TestNet Canister ID</label>
              <input
                type="text"
                className="settings-input"
                placeholder={DEFAULT_TESTNET_CANISTER}
                value={testnetCanisterId}
                onChange={(e) => setTestnetCanisterId(e.target.value)}
              />
              <span className="settings-hint">Default: {DEFAULT_TESTNET_CANISTER} (Also used for Regtest)</span>
            </div>

            <div className="settings-section" style={{ marginTop: '2rem' }}>
              <h3 className="settings-section-title">Bitcoin Address Generation</h3>
              <p className="settings-info">Choose how Bitcoin addresses are generated for your wallet.</p>

              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="addressMethod"
                    value="icp"
                    checked={addressGenerationMethod === 'icp'}
                    onChange={(e) => setAddressGenerationMethod(e.target.value as 'icp' | 'bitcoin')}
                    style={{ marginRight: '0.5rem', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: '500', color: '#fff' }}>Generate with ICP</div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      Fetch Bitcoin address from ICP canister (requires network connection)
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="addressMethod"
                    value="bitcoin"
                    checked={addressGenerationMethod === 'bitcoin'}
                    onChange={(e) => setAddressGenerationMethod(e.target.value as 'icp' | 'bitcoin')}
                    style={{ marginRight: '0.5rem', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: '500', color: '#fff' }}>Generate with Bitcoin</div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      Generate Bitcoin address locally from your mnemonic (works offline)
                    </div>
                  </div>
                </label>
              </div>

              {/* Display the three addresses when using Bitcoin generation method */}
              {addressGenerationMethod === 'bitcoin' && (mainBalanceAddress || utxoHolderAddress || dustHolderAddress) && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#f7931a', marginBottom: '1rem' }}>
                    Multi-Address Wallet Structure
                  </div>

                  {mainBalanceAddress && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.25rem' }}>Main Address (Index 0)</div>
                      <div style={{ fontSize: '0.9rem', color: '#fff', fontFamily: 'monospace', wordBreak: 'break-all' }}>{mainBalanceAddress}</div>
                    </div>
                  )}

                  {utxoHolderAddress && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.25rem' }}>UTXO Holder (Index 100)</div>
                      <div style={{ fontSize: '0.9rem', color: '#fff', fontFamily: 'monospace', wordBreak: 'break-all' }}>{utxoHolderAddress}</div>
                    </div>
                  )}

                  {dustHolderAddress && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.25rem' }}>Dust Holder (Index 999)</div>
                      <div style={{ fontSize: '0.9rem', color: '#fff', fontFamily: 'monospace', wordBreak: 'break-all' }}>{dustHolderAddress}</div>
                    </div>
                  )}

                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.25rem' }}>Current Change Index</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f7931a' }}>{addressIndex}</div>
                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>
                      Iterative scan with Gap Limit (20)
                    </div>
                  </div>

                  {/* Display funded addresses found during scan */}
                  {fundedAddresses.length > 0 && (
                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <div style={{ fontSize: '0.85rem', color: '#f7931a', fontWeight: '600', marginBottom: '0.5rem' }}>
                        Funded Addresses Found
                      </div>
                      <div style={{ maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
                        {fundedAddresses
                          .filter(fa => fa.account === 'vanilla') // Only show vanilla addresses as requested
                          .map((fa, idx) => (
                            <div key={idx} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '4px' }}>
                              <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Index {fa.index} ({fa.chain === 0 ? 'External' : 'Internal'})</span>
                                <span style={{ color: '#f7931a' }}>{(fa.balance / 100000000).toFixed(8)} BTC</span>
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#fff', fontFamily: 'monospace', wordBreak: 'break-all', marginTop: '2px' }}>
                                {fa.address}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <p className="error-text">{error}</p>}
            {settingsSaved && <p className="success-text">✓ Settings saved successfully!</p>}

            <button
              className="btn-primary"
              onClick={handleSaveCanisterIds}
              style={{ width: '100%', marginTop: '1.5rem' }}
            >
              Save Changes
            </button>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                className="reset-link"
                onClick={handleSwapCanisterIds}
              >
                Swap
              </button>
              <button
                className="reset-link"
                onClick={handleResetCanisterIds}
              >
                Reset to Defaults
              </button>
              <button
                className="reset-link"
                style={{ color: '#ef4444' }}
                onClick={async () => {
                  const logs = await getErrorLogs();
                  setErrorLogs(logs);
                  setView('error-logs');
                }}
              >
                Error Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Settings Screen */}
      {/* Error Logs Screen */}
      {view === 'error-logs' && (
        <div className="settings-container">
          <div className="password-header">
            <button className="back-arrow" onClick={() => setView('settings')}>←</button>
            <h2 className="card-title">Error Logs</h2>
            <button
              className="reset-link"
              style={{ color: '#ef4444', fontSize: '0.8rem' }}
              onClick={async () => {
                await clearErrorLogs();
                setErrorLogs([]);
              }}
            >
              Clear
            </button>
          </div>

          <div className="settings-content" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {errorLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                No error logs found.
              </div>
            ) : (
              errorLogs.map((log) => (
                <div key={log.id} style={{
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.8rem' }}>{log.source}</span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.7rem' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    {log.message}
                  </div>
                  {log.network && (
                    <div style={{ fontSize: '0.75rem', color: '#f7931a', marginBottom: '0.5rem' }}>
                      Network: {log.network}
                    </div>
                  )}
                  {log.details && (
                    <div style={{
                      padding: '0.5rem',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all'
                    }}>
                      {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {view === 'user-settings' && (
        <div className="settings-container">
          <div className="password-header">
            <button className="back-arrow" onClick={() => setView('dashboard')}>←</button>
            <h2 className="card-title">Settings</h2>
          </div>

          <div className="settings-content" style={{ padding: '1rem 0', gap: '0.75rem' }}>
            {/* Auto-Lock Timer */}
            <div className="settings-menu-item" onClick={() => setView('auto-lock-settings')}>
              <div className="settings-menu-item-left">
                <span className="settings-menu-item-icon">🕐</span>
                <span className="settings-menu-item-label">Auto-Lock Timer</span>
              </div>
              <div className="settings-menu-item-right">
                <span className="settings-menu-item-value">{autoLockTimer}</span>
                <span className="settings-menu-item-chevron">›</span>
              </div>
            </div>

            {/* Color Mode */}
            <div className="settings-menu-item" onClick={() => console.log('Color Mode clicked')}>
              <div className="settings-menu-item-left">
                <span className="settings-menu-item-icon">🌙</span>
                <span className="settings-menu-item-label">Color Mode</span>
              </div>
              <div className="settings-menu-item-right">
                <span className="settings-menu-item-value">{colorMode}</span>
                <span className="settings-menu-item-chevron">›</span>
              </div>
            </div>

            {/* Advanced Setting */}
            <div className="settings-menu-item" onClick={() => setView('settings')}>
              <div className="settings-menu-item-left">
                <span className="settings-menu-item-icon">🔧</span>
                <span className="settings-menu-item-label">Advanced Setting</span>
              </div>
              <div className="settings-menu-item-right">
                <span className="settings-menu-item-chevron">›</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Lock Settings Screen */}
      {view === 'auto-lock-settings' && (
        <div className="settings-container">
          <div className="password-header">
            <button className="back-arrow" onClick={() => setView('user-settings')}>←</button>
            <h2 className="card-title">Auto-lock Timer</h2>
          </div>

          <div className="settings-content" style={{ padding: '1rem 0' }}>
            {/* Timer options */}
            {[
              { label: '1 minutes', value: 1 },
              { label: '5 minutes', value: 5 },
              { label: '15 minutes', value: 15 },
              { label: '30 minutes', value: 30 }
            ].map((option) => (
              <div
                key={option.value}
                onClick={() => handleSelectAutoLockTimer(option.value)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
              >
                <span style={{ fontWeight: '600', color: '#fff' }}>{option.label}</span>
                {autoLockMinutes === option.value && (
                  <span style={{ color: '#f7931a', fontSize: '1.2rem' }}>✓</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Network Settings Screen */}

      {view === 'network-settings' && (
        <div className="settings-container">
          <div className="password-header">
            <button className="back-arrow" onClick={() => setView('dashboard')}>←</button>
            <h2 className="card-title">Network Settings</h2>
            <div className="connection-status">
              <span className={`status-dot status-${connectionStatus}`}></span>
              <span className="status-text">{connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}</span>
            </div>
          </div>

          <div className="settings-content">
            <div className="settings-section">
              <h3 className="settings-section-title">Network Configuration</h3>
              <p className="settings-info">Configure the backend profile, Electrum Server, and RGB Proxy for network connectivity.</p>
            </div>

            <div className="input-group">
              <label className="input-label">Backend Profile</label>
              <select
                className="settings-input"
                value={backendProfileId}
                onChange={(e) => applyBackendProfileDefaults(e.target.value as BackendProfileId)}
              >
                {BACKEND_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <span className="settings-hint">
                {getBackendProfileById(backendProfileId).description}
              </span>
            </div>

            <div className="input-group">
              <label className="input-label">Electrum Server</label>
              <input
                type="text"
                className="settings-input"
                placeholder="e.g., ssl://electrum.iriswallet.com:50013"
                value={electrumServer}
                onChange={(e) => setElectrumServer(e.target.value)}
              />
              <span className="settings-hint">Enter server URL (e.g., ssl://electrum.iriswallet.com:50013)</span>
            </div>

            <div className="input-group">
              <label className="input-label">RGB Proxy</label>
              <input
                type="text"
                className="settings-input"
                placeholder="e.g., http://89.117.52.115:3000/json-rpc"
                value={rgbProxy}
                onChange={(e) => setRgbProxy(e.target.value)}
              />
              <span className="settings-hint">Enter RGB proxy URL (e.g., http://89.117.52.115:3000/json-rpc)</span>
            </div>

            {error && <p className="error-text">{error}</p>}
            {networkSettingsSaved && <p className="success-text">✓ Network settings saved successfully!</p>}

            <button
              className="btn-primary"
              onClick={handleSaveNetworkSettings}
              style={{ width: '100%', marginTop: '1.5rem' }}
            >
              Save & Apply
            </button>


            <button
              className="reset-link"
              onClick={handleResetNetworkSettings}
              style={{ display: 'block', margin: '1rem auto 0', textAlign: 'center' }}
            >
              Clear Settings
            </button>
          </div>
        </div>
      )}

      {/* Faucet Screen - TestNet Only */}
      {view === 'faucet' && (
        <div className="settings-container">
          <div className="password-header">
            <button className="back-arrow" onClick={() => setView('dashboard')}>←</button>
            <h2 className="card-title">Faucet</h2>
          </div>

          <div className="settings-content">
            <div className="settings-section">
              <h3 className="settings-section-title">
                {selectedNetwork === 'regtest' ? 'Get Photon regtest coins' : 'Get Free Testnet Coins'}
              </h3>
              <p className="settings-info">
                {selectedNetwork === 'regtest'
                  ? 'Use the PhotonBolt regtest faucet to fund the wallet with valid bcrt1 regtest bitcoin.'
                  : 'Use these faucets to get free testnet Bitcoin and ckBTC for testing.'}
              </p>
            </div>

            {selectedNetwork === 'regtest' && (
              <div className="faucet-item" onClick={() => window.open('https://faucet.photonbolt.xyz/', '_blank')}>
                <div className="faucet-icon">🧪</div>
                <div className="faucet-details">
                  <div className="faucet-name">PhotonBolt Regtest Faucet</div>
                  <div className="faucet-url">faucet.photonbolt.xyz</div>
                </div>
                <div className="faucet-arrow">↗</div>
              </div>
            )}

            {selectedNetwork !== 'regtest' && (
              <>
            {/* ckBTC Faucet */}
            <div className="faucet-item" onClick={() => window.open('https://testnet-faucet.ckboost.com/', '_blank')}>
              <div className="faucet-icon">⚡</div>
              <div className="faucet-details">
                <div className="faucet-name">ckBTC Faucet</div>
                <div className="faucet-url">testnet-faucet.ckboost.com</div>
              </div>
              <div className="faucet-arrow">↗</div>
            </div>

            {/* tBTC Faucet 1 */}
            <div className="faucet-item" onClick={() => window.open('https://testnet-faucet.devwork.tech/', '_blank')}>
              <div className="faucet-icon">🚰</div>
              <div className="faucet-details">
                <div className="faucet-name">tBTC Faucet</div>
                <div className="faucet-url">testnet-faucet.devwork.tech</div>
              </div>
              <div className="faucet-arrow">↗</div>
            </div>

            {/* tBTC Faucet 2 */}
            <div className="faucet-item" onClick={() => window.open('https://coinfaucet.eu/en/', '_blank')}>
              <div className="faucet-icon">🚰</div>
              <div className="faucet-details">
                <div className="faucet-name">tBTC Faucet</div>
                <div className="faucet-url">coinfaucet.eu</div>
              </div>
              <div className="faucet-arrow">↗</div>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Swap Screen */}
      {view === 'swap' && (
        <div className="swap-container">
          <div className="swap-header">
            <button className="swap-close" onClick={() => setView('receive')}>✕</button>
            <h2 className="swap-title">Swap</h2>
          </div>

          <div className="swap-content">
            {/* From Token - conditionally swap based on direction */}
            <div className="swap-token-section">
              <div className="swap-token-header">
                <div className="swap-token-info">
                  {swapIconRotated ? (
                    <>
                      <div className="swap-token-icon swap-token-icon-image">
                        <img src="/lbtc-logo.png" alt="LBTC" className="swap-token-logo" />
                      </div>
                      <span className="swap-token-name">Lightning Bitcoin</span>
                    </>
                  ) : (
                    <>
                      <div className="swap-token-icon">₿</div>
                      <span className="swap-token-name">Bitcoin</span>
                    </>
                  )}
                </div>
              </div>
              <input
                type="text"
                className="swap-amount-input"
                placeholder="0"
                value={swapFromAmount}
                onChange={(e) => setSwapFromAmount(e.target.value)}
              />
              <div className="swap-token-footer">
                <span className="swap-token-usd">{calculateUsdValue(swapFromAmount)}</span>
                <div className="swap-balance-row">
                  <div className="swap-balance-info">
                    <span className="swap-balance-label">Balance:</span>
                    <span className="swap-balance-value">{swapUserBalance} ₿</span>
                  </div>
                  <div className="swap-percent-buttons">
                    <button className="swap-percent-btn" onClick={() => handleSwapPercentage(25)}>25%</button>
                    <button className="swap-percent-btn" onClick={() => handleSwapPercentage(50)}>50%</button>
                    <button className="swap-percent-btn" onClick={() => handleSwapPercentage(75)}>75%</button>
                    <button className="swap-percent-btn" onClick={() => handleSwapPercentage(100)}>100%</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Swap Icon */}
            <button
              className={`swap-direction-btn ${swapIconRotated ? 'rotated' : ''}`}
              onClick={() => setSwapIconRotated(!swapIconRotated)}
            >
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" height="1.5em" width="1.5em" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
              </svg>
            </button>

            {/* To Token - conditionally swap based on direction */}
            <div className="swap-token-section">
              <div className="swap-token-header">
                <div className="swap-token-info">
                  {swapIconRotated ? (
                    <>
                      <div className="swap-token-icon">₿</div>
                      <span className="swap-token-name">Bitcoin</span>
                    </>
                  ) : (
                    <>
                      <div className="swap-token-icon swap-token-icon-image">
                        <img src="/lbtc-logo.png" alt="LBTC" className="swap-token-logo" />
                      </div>
                      <span className="swap-token-name">Lightning Bitcoin</span>
                    </>
                  )}
                </div>
              </div>
              <input
                type="text"
                className="swap-amount-input"
                placeholder="0"
                value={swapToAmount}
                onChange={(e) => setSwapToAmount(e.target.value)}
                readOnly
              />
              <div className="swap-token-footer">
                <span className="swap-token-usd">{calculateUsdValue(swapToAmount)}</span>
              </div>
            </div>

            {/* Error/Success Messages */}
            {swapError && (
              <div style={{
                padding: '0.75rem',
                margin: '1rem 0',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '0.875rem'
              }}>
                {swapError}
              </div>
            )}

            {swapSuccess && (
              <div style={{
                padding: '0.75rem',
                margin: '1rem 0',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '8px',
                color: '#22c55e',
                fontSize: '0.875rem'
              }}>
                {swapSuccess}
              </div>
            )}

            {/* Swap Button */}
            <button
              className="swap-execute-btn"
              disabled={parseFloat(swapUserBalance) === 0 || swapProcessing}
              onClick={handleExecuteSwap}
            >
              {swapProcessing
                ? 'Processing...'
                : parseFloat(swapUserBalance) === 0
                  ? 'NOT ENOUGH BTC'
                  : 'Convert to Lightning ₿'}
            </button>
          </div>
        </div>
      )
      }


      {/* Send Screen */}
      {
        view === 'send' && (
          <div className="receive-container send-screen">
            <div className="receive-header">
              <button className="back-arrow" onClick={() => setView('dashboard')}>←</button>
              <h2 className="receive-title">Send</h2>
            </div>

            <div className="send-content send-entry-content">
	              <div className="send-input-group send-surface-card">
	                <label className="send-label">Receiver</label>
	                <input
                  type="text"
                  className="send-input"
                  placeholder="lnbcrt1..., rgb:..., or Bitcoin address"
                  value={sendReceiverAddress}
	                  onChange={(e) => { void handleInvoicePaste(e.target.value) }}
	                />
                  {sendRoute && (
                    <div className={`send-route-card ${sendRoute}`}>
                      <div className="send-route-pill">
                        {sendRoute === 'lightning' ? 'Lightning' : sendRoute === 'rgb-onchain' ? 'RGB On-Chain' : 'Bitcoin'}
                      </div>
                      <div className="send-route-copy">{sendRouteHint || 'Route detected.'}</div>
                    </div>
                  )}
	              </div>
	            </div>

            <div className="flow-footer-bar">
              <button
                className="send-next-btn"
                disabled={!sendReceiverAddress}
                onClick={handleSendEntryNext}
              >
                Next
              </button>
            </div>
          </div>
        )
      }


      {/* Send Amount Screen */}
      {
        view === 'send-amount' && (
          <div className="send-container">
            <div className="send-header">
              <button className="send-back" onClick={() => setView('send')}>←</button>
              <h2 className="send-title">{sendMode === 'rgb' ? `Send ${sendRgbAssetLabel}` : sendMode === 'lightning' ? `Instant Pay ${sendRgbAssetLabel}` : 'Send BTC'}</h2>
            </div>

            <div className="send-content">
              <div className="send-surface-card">
                {sendMode === 'lightning' && (
                  <div className="send-instant-balance-card">
                    <div className="send-instant-kicker">Ready to Spend (Instant)</div>
                    <div className="send-instant-amount">
                      {sendTotalSpendingPower || '0'} <span>{sendRgbAssetLabel}</span>
                    </div>
                    <div className="send-instant-meta">
                      <span>On-chain: {Number(sendTotalSpendingPower || 0) - Number(sendOffchainOutbound || 0)}</span>
                      <span>Channel: {sendOffchainOutbound || '0'}</span>
                      <span>Inbound: {sendOffchainInbound || '0'}</span>
                    </div>
                  </div>
                )}

                <div className="send-section-block">
                  <label className="send-label">Recipient</label>
                  <div className="send-recipient-display">
                    <span className="send-recipient-text">{sendReceiverAddress}</span>
                    <button
                      className="send-copy-btn"
                      onClick={() => navigator.clipboard.writeText(sendReceiverAddress)}
                    >
                      ⎘
                    </button>
                  </div>
                </div>

                <div className="send-section-block">
                  <div className="send-amount-header">
                    <label className="send-label">Amount</label>
                    <span className="send-balance-label">
                      {sendMode === 'rgb'
                        ? `Asset: ${sendRgbAssetLabel}`
                        : sendMode === 'lightning'
                          ? `Spending Power: ${sendTotalSpendingPower} ${sendRgbAssetLabel}`
                          : `Balance: ${sendUserBalance} BTC`}
                    </span>
                  </div>
                  <div className="send-amount-input-container">
                    <input
                      type="text"
                      className="send-amount-input"
                      placeholder={sendMode === 'rgb' || sendMode === 'lightning' ? '0' : '0.000000'}
                      value={sendAmount}
                      readOnly={sendMode === 'rgb' || sendMode === 'lightning'}
                      onChange={(e) => {
                        if (sendMode === 'rgb' || sendMode === 'lightning') {
                          return
                        }
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          const numVal = parseFloat(val);
                          const maxNum = parseFloat(maxSendableAmount);
                          if (!isNaN(numVal) && numVal > maxNum) {
                            setSendAmount(maxSendableAmount);
                          } else {
                            setSendAmount(val);
                          }
                        }
                      }}
                    />
                    <div className="send-amount-suffix">
                      <span className="send-amount-unit">{sendMode === 'rgb' || sendMode === 'lightning' ? (sendRgbAssetLabel || 'RGB') : 'BTC'}</span>
                      {sendMode === 'btc' && <button className="send-max-btn" onClick={handleMaxAmount}>Max</button>}
                    </div>
                  </div>
                  <div className="send-helper-copy">
                    {sendMode === 'rgb'
                      ? `Invoice amount: ${sendAmount} ${sendRgbAssetLabel}`
                      : sendMode === 'lightning'
                        ? `Instant route detected. Channel spendable: ${sendOffchainOutbound || '0'} ${sendRgbAssetLabel}`
                      : `Maximum sendable: ${maxSendableAmount} BTC`}
                  </div>
                </div>
              </div>

              {sendMode === 'btc' && (
              <div className="send-surface-card">
                <div className="send-fee-header">
                  <label className="send-label">
                    Fee
                    <button
                      className="send-inline-link"
                      onClick={() => setSendEstimatedFees([2n, 3n, 5n])}
                    >
                      use default [2,3,5]
                    </button>
                  </label>
                  <button
                    className="send-refresh-btn"
                    onClick={handleRefreshFees}
                    disabled={sendLoadingFees}
                  >
                    {sendLoadingFees ? '...' : '⟳'}
                  </button>
                </div>

                <div className="send-fee-options">
                  <button className={`send-fee-btn ${sendFeeOption === 'slow' ? 'active' : ''}`} onClick={() => setSendFeeOption('slow')}>
                    <div className="send-fee-title">Slow</div>
                    <div className="send-fee-rate">{Number(sendEstimatedFees[0])} sat/vB</div>
                    <div className="send-fee-time">~ 2 hours</div>
                  </button>
                  <button className={`send-fee-btn ${sendFeeOption === 'avg' ? 'active' : ''}`} onClick={() => setSendFeeOption('avg')}>
                    <div className="send-fee-title">Avg</div>
                    <div className="send-fee-rate">{Number(sendEstimatedFees[1])} sat/vB</div>
                    <div className="send-fee-time">~ 30 mins</div>
                  </button>
                  <button className={`send-fee-btn ${sendFeeOption === 'fast' ? 'active' : ''}`} onClick={() => setSendFeeOption('fast')}>
                    <div className="send-fee-title">Fast</div>
                    <div className="send-fee-rate">{Number(sendEstimatedFees[2])} sat/vB</div>
                    <div className="send-fee-time">~ 10 mins</div>
                  </button>
                  <button className={`send-fee-btn ${sendFeeOption === 'custom' ? 'active' : ''}`} onClick={() => setSendFeeOption('custom')}>
                    <div className="send-fee-title">Custom</div>
                  </button>
                </div>
              </div>
              )}
            </div>

            <div className="flow-footer-bar">
              <button
                className="send-next-btn"
                disabled={!sendAmount || parseFloat(sendAmount) === 0}
                onClick={handleSendNext}
              >
                Next
              </button>
            </div>
          </div>
        )
      }

      {/* Send Confirm Screen */}
      {
        view === 'send-confirm' && (
          <div className="send-container">
            <div className="send-header">
              <button className="send-back" onClick={() => setView('send-amount')}>←</button>
              <h2 className="send-title">{sendMode === 'rgb' ? 'Send RGB Asset' : sendMode === 'lightning' ? 'Pay Instantly' : 'Sign Transaction'}</h2>
            </div>

            <div className="send-content">
              <div className="send-confirm-box">
                <div className="send-confirm-route">
                  <div className="send-confirm-party">
                    <div className="send-confirm-label">From</div>
                    <div className="send-confirm-address">{truncateAddress(walletAddress || btcAddress)}</div>
                  </div>
                  <div className="send-confirm-arrow">→</div>
                  <div className="send-confirm-party align-right">
                    <div className="send-confirm-label">{sendMode === 'rgb' ? 'Invoice' : sendMode === 'lightning' ? 'Lightning Invoice' : 'Send to'}</div>
                    <div className="send-confirm-address">{truncateAddress(sendReceiverAddress)}</div>
                  </div>
                </div>

                <div className="send-confirm-total">
                  <div className="send-confirm-label">Send Amount</div>
                  <div className="send-confirm-amount">{sendAmount} {sendMode === 'rgb' || sendMode === 'lightning' ? sendRgbAssetLabel : 'BTC'}</div>
                  <div className="send-confirm-fiat">
                    {sendMode === 'rgb'
                      ? `Asset ID: ${truncateAddress(sendRgbAssetId)}`
                      : sendMode === 'lightning'
                        ? `Route: Lightning • ${sendLightningMsats > 0 ? `${sendLightningMsats / 1000} sats bridge` : 'Instant settlement'}`
                        : calculateUsdValue(sendAmount)}
                  </div>
                </div>
              </div>

              {sendMode === 'btc' ? (
                <div className="send-input-group">
                  <label className="send-label">Fee Breakdown</label>
                  <div className="send-fee-breakdown">
                    <div className="send-fee-row">
                      <span className="send-fee-label">Amount sent</span>
                      <span className="send-fee-value">{parseFloat(sendAmount).toFixed(8)} BTC</span>
                    </div>
                    <div className="send-fee-row">
                      <span className="send-fee-label">Network fee ({sendFeeOption === 'slow' ? Number(sendEstimatedFees[0]) : sendFeeOption === 'avg' ? Number(sendEstimatedFees[1]) : Number(sendEstimatedFees[2])} sat/vB)</span>
                      <span className="send-fee-value">{sendNetworkFee} BTC</span>
                    </div>
                    <div className="send-fee-row total">
                      <span className="send-fee-label">Total</span>
                      <span className="send-fee-value">{(parseFloat(sendAmount || '0') + parseFloat(sendNetworkFee || '0')).toFixed(8)} BTC</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="send-input-group">
                  <label className="send-label">{sendMode === 'rgb' ? 'Estimated BTC Fee' : 'Settlement Fee'}</label>
                  <div className="send-metric-card">
                    <span className="send-metric-value">{sendNetworkFee}</span>
                  </div>
                </div>
              )}

              {sendError && (
                <div className="send-error-box">
                  <span>{sendError}</span>
                </div>
              )}

              <button
                className="send-next-btn"
                onClick={handleSendBitcoin}
                disabled={sendProcessing}
              >
                {sendProcessing ? 'Sending...' : sendMode === 'rgb' ? 'Send PHO' : sendMode === 'lightning' ? 'Pay Instantly' : 'Sign & Pay'}
              </button>
            </div>
          </div>
        )
      }

      {/* Send Success Screen */}
      {
        view === 'send-success' && (
          <div className="send-container">
            <div className="send-header">
              <h2 className="send-title">{sendMode === 'rgb' ? 'RGB Transfer Sent' : sendMode === 'lightning' ? 'Instant Payment Settled' : 'Sign Transaction'}</h2>
            </div>

            <div className="send-content send-success-screen">
              <div className="send-success-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>

              <p className="send-success-copy">
                {sendMode === 'rgb'
                  ? `Transfer of ${sendAmount} ${sendRgbAssetLabel} submitted successfully!`
                  : sendMode === 'lightning'
                    ? `Instant transfer of ${sendAmount} ${sendRgbAssetLabel} settled off-chain.`
                  : `Payment of ${sendAmount} BTC successfully!`}
              </p>

              {sendMode === 'lightning' && sendPaymentHash && (
                <div className="send-success-txid">
                  <p className="send-success-label">Payment Hash</p>
                  <p className="send-success-hash">
                    {sendPaymentHash}
                  </p>
                </div>
              )}

              {sendTxId && (
                <div className="send-success-txid">
                  <p className="send-success-label">Transaction ID</p>
                  <p className="send-success-hash">
                    {sendTxId}
                  </p>
                </div>
              )}

              <button
                className="send-next-btn"
                onClick={() => {
                  setView('dashboard')
                  setSendReceiverAddress('')
                  setSendAmount('')
                  setSendTxId('')
                  setSendPaymentHash('')
                  setSendRoute(null)
                  setSendRouteHint('')
                  setSendLightningMsats(0)
                  setSendError('')
                }}
              >
                Close
              </button>
            </div>
          </div>
        )
      }

      {/* Click outside to close menu */}
      {showMenu && <div className="menu-overlay" onClick={() => setShowMenu(false)}></div>}

      {/* Notice Modal */}
      {
        showNoticeModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3 className="modal-title">Notice</h3>
              <p className="modal-text">
                The Photon wallet currently does not support assets such as runes and inscriptions. Importing these assets may result in them not being displayed or functioning properly within the wallet.
              </p>
              <button className="btn-primary modal-confirm" onClick={handleConfirmNotice}>
                Confirm
              </button>
            </div>
          </div>
        )
      }

      {/* Network Switch Modal */}
      {
        showNetworkModal && (
          <div className="modal-overlay" onClick={() => setShowNetworkModal(false)}>
            <div className="network-modal" onClick={(e) => e.stopPropagation()}>
              <div className="network-modal-header">
                <h3 className="network-modal-title">Switch Network</h3>
                <button className="network-close-btn" onClick={() => setShowNetworkModal(false)}>×</button>
              </div>
              <div className="network-list">
                {networks.map((network) => (
                  <button
                    key={network.id}
                    className={`network-item ${selectedNetwork === network.id ? 'selected' : ''} ${!network.enabled ? 'disabled' : ''}`}
                    onClick={() => {
                      if (network.enabled) {
                        handleNetworkSwitch(network.id)
                      }
                    }}
                    disabled={!network.enabled}
                  >
                    <span className="network-item-icon" style={{ background: network.color }}>₿</span>
                    <span className="network-item-name">{network.name}</span>
                    {selectedNetwork === network.id && <span className="network-check">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      }

      {showUnlockUtxoModal && selectedUnlockUtxo && (
        <div className="modal-overlay" onClick={closeUnlockUtxoModal}>
          <div className="notice-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="network-close-btn"
              onClick={closeUnlockUtxoModal}
              style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }}
            >
              ×
            </button>
            <div className="notice-modal-content">
              <h3 className="notice-title">Unlock UTXO</h3>
              <p className="notice-text">
                UTXO unlocking requires a transaction fee. After unlocking, the available BTC in the original UTXO will be transferred to your BTC balance.
              </p>
              <div className="unlock-summary-card">
                <div className="unlock-summary-label">Unlocking output</div>
                <div className="unlock-summary-outpoint">
                  {selectedUnlockUtxo.txid}:{selectedUnlockUtxo.vout}
                </div>
                <div className="unlock-summary-amount">
                  Amount: {(Number(selectedUnlockUtxo.value) / 100000000).toFixed(4)} BTC
                </div>
              </div>
              {unlockUtxoError && (
                <div className="unlock-error-box">
                  {unlockUtxoError}
                </div>
              )}
              <button
                className="btn-primary modal-confirm unlock-confirm-btn"
                onClick={() => {
                  setShowUnlockUtxoModal(false)
                  setUnlockUtxoError('')
                  setView('unlock-rgb-utxo')
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UTXOs View */}
      {
        view === 'utxos' && (
          <div className="wallet-wrapper utxo-screen">
            <div className="wallet-header">
              <button className="back-arrow" onClick={() => setView('dashboard')}>←</button>
              <h2 className="utxo-header-title">RGB UTXOs</h2>
              <button
                onClick={() => setView('create-rgb-utxo')}
                className="utxo-header-action"
              >
                Create UTXO
              </button>
            </div>

            <div className="wallet-scroll-container">
              <div className="utxo-hero">
                <div className="flow-kicker">Holder workspace</div>
                <div className="flow-intro-title">Manage uncolored, occupied, and unlockable outputs</div>
                <div className="flow-intro-copy">Use this space to prepare RGB-ready outputs and return idle holder BTC back to the main wallet when needed.</div>
              </div>

              <div className="utxos-tabs">
                <button className={`utxo-tab-btn ${utxoTab === 'occupied' ? 'active' : ''}`} onClick={() => setUtxoTab('occupied')}>Occupied</button>
                <button className={`utxo-tab-btn ${utxoTab === 'unoccupied' ? 'active' : ''}`} onClick={() => setUtxoTab('unoccupied')}>Unoccupied</button>
                <button className={`utxo-tab-btn ${utxoTab === 'unlockable' ? 'active' : ''}`} onClick={() => setUtxoTab('unlockable')}>Unlockable</button>
              </div>

              {rgbClassificationError && (
                <div className="utxo-banner error">
                  <div>⚠️ {rgbClassificationError}</div>
                </div>
              )}

              <div className="utxo-content">
                {loadingUtxos ? (
                  <div className="utxo-empty-state">Classifying UTXOs with RGB proxy...</div>
                ) : (
                  <>
                    {utxoTab === 'unoccupied' && (
                      <>
                        {bitcoinUtxos.length === 0 ? (
                          <div className="utxo-empty-state">
                            <div className="utxo-empty-icon">📦</div>
                            <p className="utxo-empty-title">No Unoccupied UTXOs</p>
                            <p className="utxo-empty-copy">Bitcoin UTXOs available for RGB asset binding will appear here.</p>
                          </div>
                        ) : (
                          <div className="utxo-list">
                            <div className="utxo-banner info">
                              <div>These Bitcoin UTXOs are available for RGB asset binding.</div>
                            </div>
                            {bitcoinUtxos.map((utxo) => (
                              <div key={`${utxo.txid}:${utxo.vout}`} className={`utxo-list-card ${utxo.isLocked ? 'locked' : ''}`}>
                                <div className="utxo-card-head">
                                  <div>
                                    <span className="utxo-card-label">Output</span>
                                    <div className="utxo-card-outpoint">{utxo.txid.slice(0, 12)}...{utxo.txid.slice(-8)}:{utxo.vout}</div>
                                  </div>
                                  {utxo.isLocked && (
                                    <div className="utxo-tag locked">Locked</div>
                                  )}
                                </div>
                                <div>
                                  <span className="utxo-card-label">{utxo.isLocked ? 'Reserved for RGB' : 'Available for RGB Binding'}</span>
                                  <div className="utxo-card-amount">{formatBtcAmount(utxo.value)} BTC</div>
                                  <div className="utxo-card-fiat">{calculateUsdValue(formatBtcAmount(utxo.value, 8))}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {utxoTab === 'occupied' && (
                      <>
                        {rgbUtxos.length === 0 ? (
                          <div className="utxo-empty-state">
                            <div className="utxo-empty-icon">🎨</div>
                            <p className="utxo-empty-title">No Occupied UTXOs</p>
                            <p className="utxo-empty-copy">UTXOs with RGB assets bound to them will appear here.</p>
                          </div>
                        ) : (
                          <div className="utxo-list">
                            <div className="utxo-banner purple">
                              <div>These outputs already have RGB assets bound to them.</div>
                            </div>
                            {rgbUtxos.map((utxo) => (
                              <div key={`${utxo.txid}:${utxo.vout}`} className="utxo-list-card occupied">
                                <div className="utxo-card-head">
                                  <div>
                                    <span className="utxo-card-label">Output</span>
                                    <div className="utxo-card-outpoint">{utxo.txid.slice(0, 12)}...{utxo.txid.slice(-8)}:{utxo.vout}</div>
                                  </div>
                                  <div className="utxo-tag locked">Locked</div>
                                </div>
                                <div className="utxo-card-stack">
                                  <span className="utxo-card-label">Bitcoin Value</span>
                                  <div className="utxo-card-amount">{formatBtcAmount(utxo.value)} BTC</div>
                                  <div className="utxo-card-fiat">{calculateUsdValue(formatBtcAmount(utxo.value, 8))}</div>
                                </div>
                                {utxo.rgbAllocations && utxo.rgbAllocations.length > 0 && (
                                  <div className="utxo-assets-list">
                                    <span className="utxo-assets-title">RGB Assets ({utxo.rgbAllocations.length})</span>
                                    {utxo.rgbAllocations.map((allocation, idx) => (
                                      <div key={idx} className="utxo-asset-pill">
                                        <div className="utxo-asset-name">
                                          {allocation.ticker || allocation.assetName || 'RGB Asset'}
                                        </div>
                                        <div className="utxo-asset-amount">
                                          {allocation.amount.toString()} units
                                        </div>
                                        <div className="utxo-asset-id">
                                          ID: {allocation.assetId.slice(0, 16)}...
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {utxoTab === 'unlockable' && (
                      <>
                        {bitcoinUtxos.length === 0 ? (
                          <div className="utxo-empty-state">
                            <div className="utxo-empty-icon">🔓</div>
                            <p className="utxo-empty-title">No Unlockable UTXOs</p>
                            <p className="utxo-empty-copy">Unoccupied RGB holder outputs will appear here when they can be returned to your main BTC balance.</p>
                          </div>
                        ) : (
                          <div className="utxo-list">
                            {bitcoinUtxos.map((utxo) => (
                              <div key={`${utxo.txid}:${utxo.vout}`} className="utxo-list-card">
                                <div className="utxo-card-head">
                                  <div>
                                    <span className="utxo-card-label">Output</span>
                                    <div className="utxo-card-outpoint">{utxo.txid.slice(0, 12)}...{utxo.txid.slice(-8)}:{utxo.vout}</div>
                                  </div>
                                </div>
                                <div className="utxo-card-stack">
                                  <span className="utxo-card-label">Available UTXO balance</span>
                                  <div className="utxo-card-amount">{formatBtcAmount(utxo.value)} BTC</div>
                                  <div className="utxo-card-fiat">{calculateUsdValue(formatBtcAmount(utxo.value, 8))}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUnlockUtxo(utxo)
                                    setUnlockUtxoError('')
                                    setShowUnlockUtxoModal(true)
                                  }}
                                  className="utxo-action-btn"
                                >
                                  Unlock UTXO
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      }

      {view === 'unlock-rgb-utxo' && selectedUnlockUtxo && (
        <div className="wallet-container" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="wallet-header">
            <button className="back-arrow" onClick={() => setView('utxos')}>←</button>
            <h2 className="utxo-header-title">Unlock RGB UTXO</h2>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingTop: '1rem', paddingBottom: '1rem', minHeight: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.5rem' }}>Unlock UTXO</div>
                <div style={{ padding: '0.9rem 1rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: '#fff', fontFamily: 'monospace', fontSize: '0.82rem', wordBreak: 'break-all' }}>
                  {selectedUnlockUtxo.txid}:{selectedUnlockUtxo.vout}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.5rem' }}>Unlockable amount</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.9rem 1rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: '#fff' }}>
                  <span>{(Number(selectedUnlockUtxo.value) / 100000000).toFixed(4)}</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>BTC</span>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)' }}>Fee</span>
                  <button
                    type="button"
                    onClick={() => setUnlockUtxoFeeOption(unlockUtxoFeeOption)}
                    style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.5)', cursor: 'pointer' }}
                  >
                    ⟳
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  <button onClick={() => setUnlockUtxoFeeOption('slow')} style={{ padding: '0.75rem 0.5rem', background: unlockUtxoFeeOption === 'slow' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: unlockUtxoFeeOption === 'slow' ? '#fff' : 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}><div style={{ fontWeight: 600 }}>Slow</div><div>3 sat/VB</div><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>≈ 1 hours</div></button>
                  <button onClick={() => setUnlockUtxoFeeOption('avg')} style={{ padding: '0.75rem 0.5rem', background: unlockUtxoFeeOption === 'avg' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: unlockUtxoFeeOption === 'avg' ? '#fff' : 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}><div style={{ fontWeight: 600 }}>Avg</div><div>3 sat/VB</div><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>≈ 30 mins</div></button>
                  <button onClick={() => setUnlockUtxoFeeOption('fast')} style={{ padding: '0.75rem 0.5rem', background: unlockUtxoFeeOption === 'fast' ? '#ff5a1f' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', fontWeight: unlockUtxoFeeOption === 'fast' ? 600 : 400 }}><div style={{ fontWeight: 600 }}>Fast</div><div>5 sat/VB</div><div style={{ fontSize: '0.75rem', opacity: 0.9 }}>≈ 10 mins</div></button>
                  <button onClick={() => setUnlockUtxoFeeOption('custom')} style={{ padding: '0.75rem 0.5rem', background: unlockUtxoFeeOption === 'custom' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: unlockUtxoFeeOption === 'custom' ? '#fff' : 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>Custom</button>
                </div>
                {unlockUtxoFeeOption === 'custom' && (
                  <input type="number" placeholder="Enter custom fee rate" value={unlockUtxoCustomFee} onChange={(e) => setUnlockUtxoCustomFee(e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', marginTop: '0.75rem', outline: 'none' }} />
                )}
              </div>
            </div>

            <div style={{ position: 'sticky', bottom: 0, paddingTop: '1rem', background: 'linear-gradient(180deg, rgba(10, 10, 10, 0) 0%, #131313 35%)' }}>
              <button className="btn-primary" onClick={() => setView('unlock-utxo-confirm')} style={{ width: '100%', background: '#ff5a1f', padding: '1rem', fontSize: '1rem', fontWeight: 600 }}>Next</button>
            </div>
          </div>
        </div>
      )}

      {view === 'unlock-utxo-confirm' && selectedUnlockUtxo && (
        <div className="wallet-container" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="wallet-header">
            <button className="back-arrow" onClick={() => setView('unlock-rgb-utxo')}>←</button>
            <h2 className="utxo-header-title">Sign Transaction</h2>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '1rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.35rem' }}>From</div>
                  <div style={{ fontSize: '0.9rem', color: '#fff', fontFamily: 'monospace' }}>
                    {utxoHolderAddress ? `${utxoHolderAddress.slice(0, 7)}...${utxoHolderAddress.slice(-4)}` : selectedNetwork === 'regtest' ? 'bcrt1p...' : 'tb1p...'}
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', color: 'rgba(255, 255, 255, 0.3)', margin: '0 1rem' }}>→</div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.35rem' }}>Send to</div>
                  <div style={{ fontSize: '0.9rem', color: '#fff', fontFamily: 'monospace' }}>
                    {mainBalanceAddress ? `${mainBalanceAddress.slice(0, 7)}...${mainBalanceAddress.slice(-4)}` : walletAddress ? `${walletAddress.slice(0, 7)}...${walletAddress.slice(-4)}` : selectedNetwork === 'regtest' ? 'bcrt1p...' : 'tb1p...'}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.5rem' }}>Send Amount</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>{getUnlockSendAmountBtc()} BTC</div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.75rem' }}>Network Fee</div>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.95rem', color: '#fff' }}>{(getUnlockFeeSats() / 100000000).toFixed(8)}</span>
                <span style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.5)' }}>BTC</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.75rem' }}>Network Fee Rate</div>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.95rem', color: '#fff' }}>{getUnlockFeeRate()}</span>
                <span style={{ fontSize: '0.85rem', color: 'rgba(59, 130, 246, 0.7)' }}>sat/VB</span>
              </div>
            </div>

            {unlockUtxoError && (
              <div className="unlock-error-box">
                {unlockUtxoError}
              </div>
            )}

            <div style={{ position: 'sticky', bottom: 0, paddingTop: '1rem', background: 'linear-gradient(180deg, rgba(10, 10, 10, 0) 0%, #131313 35%)' }}>
              <button
                className="btn-primary"
                onClick={handleUnlockUtxo}
                disabled={unlockUtxoProcessing}
                style={{
                  width: '100%',
                  background: '#ff5a1f',
                  padding: '1rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  borderRadius: '12px',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                {unlockUtxoProcessing ? 'Signing...' : 'Sign & Pay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'utxo-action-success' && (
        <div className="send-container">
          <div className="send-header">
            <h2 className="send-title">{utxoActionSuccessLabel}</h2>
          </div>

          <div className="send-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '3rem' }}>
            <div style={{ fontSize: '4rem', lineHeight: 1, marginBottom: '1rem' }}>✅</div>

            <p style={{ fontSize: '1rem', color: '#111827', textAlign: 'center', marginBottom: '2rem', maxWidth: '300px', fontWeight: '500' }}>
              Transaction sent successfully.
            </p>

            {utxoActionTxId && (
              <div style={{ backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '1rem', marginBottom: '2rem', maxWidth: '320px' }}>
                <p style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.5rem' }}>Transaction ID:</p>
                <p style={{ fontSize: '0.75rem', color: '#111827', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  {utxoActionTxId}
                </p>
              </div>
            )}

            <button
              className="send-next-btn"
              onClick={() => {
                setUtxoActionTxId('')
                setUtxoActionSuccessLabel('Transaction complete')
                setUnlockUtxoError('')
                setView('utxos')
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Create RGB UTXO View */}
      {
        view === 'create-rgb-utxo' && (
          <div className="wallet-container" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="wallet-header">
              <button className="back-arrow" onClick={() => setView('utxos')}>←</button>
              <h2 className="utxo-header-title">Create RGB UTXO</h2>
            </div>

            {(() => {
              const slowFeeRate = Number(sendEstimatedFees?.[0] ?? 2)
              const avgFeeRate = Number(sendEstimatedFees?.[1] ?? slowFeeRate)
              const fastFeeRate = Number(sendEstimatedFees?.[2] ?? avgFeeRate)
              const currentFeeRate = Number(deriveCreateUtxoFeeRate(createUtxoFeeOption, createUtxoCustomFee, sendEstimatedFees))
              const estimatedNetworkFee = (currentFeeRate * DEFAULT_CREATE_UTXO_TX_VBYTES) / 100000000

              return (
                <div style={{ flex: 1, overflow: 'auto', paddingBottom: '1rem' }}>
                  {/* Mode Tabs */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', marginBottom: '1rem' }}>
                    <button onClick={() => setCreateUtxoMode('default')} style={{ flex: 1, background: createUtxoMode === 'default' ? 'rgba(255, 255, 255, 0.1)' : 'transparent', border: `1px solid ${createUtxoMode === 'default' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '8px', padding: '0.75rem', color: createUtxoMode === 'default' ? '#fff' : 'rgba(255, 255, 255, 0.5)', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Default</button>
                    <button onClick={() => setCreateUtxoMode('custom')} style={{ flex: 1, background: createUtxoMode === 'custom' ? 'rgba(255, 255, 255, 0.1)' : 'transparent', border: `1px solid ${createUtxoMode === 'custom' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '8px', padding: '0.75rem', color: createUtxoMode === 'custom' ? '#fff' : 'rgba(255, 255, 255, 0.5)', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Custom</button>
                  </div>

                  {/* Info Text */}
                  <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', marginBottom: '1.5rem' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>Move BTC to pre-fund UTXO for RGB20 transaction fees.</p>
                  </div>

                  {/* Default Mode */}
                  {createUtxoMode === 'default' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.5rem' }}>The UTXO creation amount</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '1.2rem', fontWeight: 600, color: '#fff' }}>0.0003 BTC</span>
                          <span style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.5)' }}>Balance: {btcBalance} BTC</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.5rem' }}>Fee</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff' }}>{currentFeeRate} sat/VB</div>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>Est. network fee: {formatBtcValue(estimatedNetworkFee, 8)} BTC</div>
                    </div>
                  )}

                  {/* Custom Mode */}
                  {createUtxoMode === 'custom' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.5rem' }}>Available BTC</div>
                        <div style={{ fontSize: '0.95rem', color: 'rgba(255, 255,  255, 0.6)' }}>Balance: {btcBalance} BTC</div>
                      </div>
                      <div>
                        <input type="text" placeholder="Enter BTC amount for creating UTXO" value={createUtxoAmount} onChange={(e) => setCreateUtxoAmount(e.target.value)} style={{ width: '100%', padding: '0.9rem 1rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.95rem', outline: 'none' }} />
                        <div style={{ textAlign: 'right', marginTop: '0.5rem' }}><span style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>BTC</span></div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)' }}>Fee</span>
                          <button style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.5)', cursor: 'pointer' }}>⟳</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                          <button onClick={() => setCreateUtxoFeeOption('slow')} style={{ padding: '0.75rem 0.5rem', background: createUtxoFeeOption === 'slow' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: createUtxoFeeOption === 'slow' ? '#fff' : 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}><div style={{ fontWeight: 600 }}>Slow</div><div>{slowFeeRate} sat/VB</div><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>≈ 1 hours</div></button>
                          <button onClick={() => setCreateUtxoFeeOption('avg')} style={{ padding: '0.75rem 0.5rem', background: createUtxoFeeOption === 'avg' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: createUtxoFeeOption === 'avg' ? '#fff' : 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}><div style={{ fontWeight: 600 }}>Avg</div><div>{avgFeeRate} sat/VB</div><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>≈ 30 mins</div></button>
                          <button onClick={() => setCreateUtxoFeeOption('fast')} style={{ padding: '0.75rem 0.5rem', background: createUtxoFeeOption === 'fast' ? '#f7931a' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', fontWeight: createUtxoFeeOption === 'fast' ? 600 : 400 }}><div style={{ fontWeight: 600 }}>Fast</div><div>{fastFeeRate} sat/VB</div><div style={{ fontSize: '0.75rem', opacity: 0.9 }}>≈ 10 mins</div></button>
                          <button onClick={() => setCreateUtxoFeeOption('custom')} style={{ padding: '0.75rem 0.5rem', background: createUtxoFeeOption === 'custom' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: createUtxoFeeOption === 'custom' ? '#fff' : 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>Custom</button>
                        </div>
                        {createUtxoFeeOption === 'custom' && (
                          <input type="number" placeholder="Enter custom fee rate" value={createUtxoCustomFee} onChange={(e) => setCreateUtxoCustomFee(e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', marginTop: '0.75rem', outline: 'none' }} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Next Button */}
                  <button className="btn-primary" onClick={() => setView('create-utxo-confirm')} style={{ width: '100%', marginTop: '2rem', background: '#f7931a', padding: '1rem', fontSize: '1rem', fontWeight: 600 }}>Next</button>
                </div>
              )
            })()}
          </div>
        )
      }

      {/* Create UTXO Confirmation - Sign Transaction */}
      {
        view === 'create-utxo-confirm' && (
          <div className="wallet-container utxo-confirm-shell">
            <div className="wallet-header">
              <button className="back-arrow" onClick={() => setView('create-rgb-utxo')}>←</button>
              <h2 className="utxo-header-title">Sign Transaction</h2>
            </div>

            {(() => {
              const amountBtc = createUtxoBaseAmountBtc(createUtxoMode, createUtxoAmount)
              const feeRateDisplay = deriveCreateUtxoFeeRate(createUtxoFeeOption, createUtxoCustomFee, sendEstimatedFees)
              const feeRateValue = Number(feeRateDisplay) || 0
              const networkFeeBtc = (feeRateValue * DEFAULT_CREATE_UTXO_TX_VBYTES) / 100000000
              const totalBtc = amountBtc + networkFeeBtc
              const fromLabel = mainBalanceAddress ? `${mainBalanceAddress.slice(0, 7)}...${mainBalanceAddress.slice(-4)}` : walletAddress ? `${walletAddress.slice(0, 7)}...${walletAddress.slice(-4)}` : selectedNetwork === 'regtest' ? 'bcrt1p...' : 'tb1p...'
              const toLabel = utxoHolderAddress ? `${utxoHolderAddress.slice(0, 7)}...${utxoHolderAddress.slice(-4)}` : selectedNetwork === 'regtest' ? 'bcrt1p...pxak' : 'tb1p...pxak'

              return (
                <div className="utxo-confirm-body">
                  <div className="utxo-card">
                    <div className="utxo-chip">SENDING</div>
                    <div className="utxo-amount">{formatBtcValue(amountBtc, 8)} BTC</div>
                    <div className="utxo-sub">{calculateUsdValue(String(amountBtc))}</div>
                    <div className="utxo-divider" />
                    <div className="utxo-route">{fromLabel} → {toLabel}</div>
                  </div>

                  <div className="utxo-row">
                    <span className="utxo-label">Network Fee</span>
                    <span className="utxo-value">{formatBtcValue(networkFeeBtc, 8)} BTC</span>
                  </div>

                  <div className="utxo-row">
                    <span className="utxo-label">Fee Rate</span>
                    <span className="utxo-pill">{feeRateDisplay} sat/vB</span>
                  </div>

                  <div className="utxo-divider full" />

                  <div className="utxo-row total">
                    <span className="utxo-label">Total to be deducted</span>
                    <span className="utxo-value bold">{formatBtcValue(totalBtc, 8)} BTC</span>
                  </div>

                  <button
                    className="btn-primary utxo-submit"
                    disabled={createUtxoProcessing}
                    onClick={async () => {
                      if (createUtxoProcessing) return

                      setCreateUtxoProcessing(true)

                      try {
                        console.log('Signing and broadcasting transaction to UTXO Holder address...');

                        const derivedUtxoHolderAddress =
                          addressGenerationMethod === 'bitcoin'
                            ? await deriveBitcoinAddress(mnemonic, selectedNetwork, 86, 0, 100, 0)
                            : utxoHolderAddress

                        if (!derivedUtxoHolderAddress) {
                          throw new Error('UTXO holder address is not available.');
                        }

                        const amountSats = BigInt(Math.floor(amountBtc * 100000000));

                        // Always refresh spendable Vanilla UTXOs before signing to avoid
                        // selecting inputs already consumed by another unconfirmed tx.
                        const { utxos: discoveryUtxos } = await performDiscoveryScan(
                          mnemonic,
                          selectedNetwork,
                          Math.max(addressIndex, changeIndex)
                        )

                        const vanillaUtxos = discoveryUtxos
                          .filter(u => u.account === 'vanilla')
                          .map(u => ({
                            txid: u.txid,
                            vout: u.vout,
                            value: u.value,
                            address: u.address,
                            derivationPath: u.derivationPath,
                            account: u.account as 'vanilla',
                            chain: u.chain as 0 | 1,
                            index: u.index as number
                          }))

                        setSpendableVanillaUtxos(vanillaUtxos)

                        if (vanillaUtxos.length === 0) {
                          throw new Error('No spendable Vanilla UTXOs available');
                        }

                        // Get fee rate
                        let feeRate = 2;
                        if (createUtxoMode === 'custom') {
                          if (createUtxoFeeOption === 'custom') {
                            feeRate = Number(createUtxoCustomFee);
                          } else {
                            const feeRateMap = { slow: 0, avg: 1, fast: 2 };
                            const feeIndex = feeRateMap[createUtxoFeeOption as 'slow' | 'avg' | 'fast'] || 2;
                            feeRate = Number(sendEstimatedFees[feeIndex]);
                          }
                        }

                        // Sign transaction locally
                        const txHex = await signAndSendVanilla(
                          mnemonic,
                          vanillaUtxos,
                          derivedUtxoHolderAddress,
                          amountSats,
                          feeRate,
                          selectedNetwork,
                          changeIndex
                        )
                          ;

                        // Increment and save change index
                        const nextChangeIndex = changeIndex + 1;
                        setChangeIndex(nextChangeIndex);
                        const changeIndexKey = `changeIndex_${selectedNetwork}` as any;
                        await setStorageData({ [changeIndexKey]: nextChangeIndex });
                        console.log(`[ChangeIndex] Incremented to ${nextChangeIndex} for ${selectedNetwork}`);

                        // Broadcast to network
                        const txid = await broadcastTransaction(txHex, selectedNetwork);
                        console.log('UTXO creation transaction broadcast:', txid);

                        const createdHolderUtxo: UtxoWithRgbStatus = {
                          txid,
                          vout: 0,
                          value: amountSats,
                          address: derivedUtxoHolderAddress,
                          derivationPath: `m/86'/${selectedNetwork === 'mainnet' ? 0 : 1}'/0'/100/0`,
                          isOccupied: false,
                          isLocked: false,
                          account: 'vanilla',
                          chain: 0,
                          index: 0,
                        }

                        setBitcoinUtxos((previous) => {
                          const next = previous.filter((utxo) => !(utxo.txid === txid && utxo.vout === 0))
                          return [createdHolderUtxo, ...next]
                        })

                        if (selectedNetwork === 'regtest') {
                          await mineRegtestBlocks(1)
                        }

                        await handleViewUtxos();
                        setUtxoActionTxId(txid)
                        setUtxoActionSuccessLabel('RGB UTXO created')
                        setView('utxo-action-success')
                      } catch (error: any) {
                        console.error('Failed to create UTXO:', error);
                        if (String(error?.message || '').includes('txn-mempool-conflict')) {
                          await handleViewUtxos()
                          alert('Failed to create UTXO: one of the selected inputs is already used by an unconfirmed transaction. The wallet refreshed its UTXOs. Please try again.')
                        } else {
                          alert(`Failed to create UTXO: ${error.message}`);
                        }
                      } finally {
                        setCreateUtxoProcessing(false)
                      }
                    }}
                  >
                    {createUtxoProcessing ? 'Signing...' : 'Sign & Pay'}
                  </button>
                </div>
              )
            })()}
          </div>
        )
      }
    </>
  )
}

export default App
