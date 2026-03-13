import { useState, useEffect, useRef } from 'react'
import './App.css'
import { generateMnemonic, deriveIdentity, validateMnemonic } from './utils/crypto'
import { getBtcAddress, getWalletAddress, updateBalance, mapNetworkToCanister, getUtxos, getEstimatedBitcoinFees, sendBitcoin } from './utils/icp'
import { deriveBitcoinAddress, isLikelyRegtestAddress } from './utils/bitcoin-address'
import { signAndSendVanilla, broadcastTransaction, fetchUTXOsFromBlockchain, performDiscoveryScan, fetchLiveFees, estimateFee, type UTXO } from './utils/bitcoin-transactions'
import type { UtxoWithRgbStatus } from './utils/rgb'
import { fetchRgbOccupiedUtxos } from './utils/rgb-fetcher'
import { getCkBTCBalance } from './utils/icrc1'
import { convertLBTCtoBTC } from './utils/ckbtc-withdrawal'
import { getErrorLogs, clearErrorLogs, type ErrorLog } from './utils/error-logger'
import { getStorageData, setStorageData, removeStorageData, getNetworkAddressKey, getNetworkAssetsKey, getNetworkContractsKey, testnet3DefaultAssets, mainnetDefaultAssets, type StorageData } from './utils/storage'
import type { Asset } from './utils/storage'
import { BACKEND_PROFILES, DEFAULT_BACKEND_PROFILE_ID, getBackendProfileById, getDefaultElectrumServer, getDefaultRgbProxy, type BackendProfileId } from './utils/backend-config'
import { QRCodeSVG } from 'qrcode.react'
import { generateRgbInvoice, notifyRgbProxy, isValidRgbProxyUrl } from './utils/rgb-invoice'
import { checkLocalRgbNode, createRegtestRgbInvoice } from './utils/rgb-wallet'
import { LightningAnimation } from './components/LightningAnimation'
import { fetchBtcActivities, type BitcoinActivity } from './utils/bitcoin-activities'


type View = 'welcome' | 'unlock' | 'lock' | 'forgot' | 'create' | 'verify' | 'password' | 'restore' | 'dashboard' | 'receive' | 'receive-btc' | 'receive-rgb' | 'convert-lightning' | 'add-assets' | 'settings' | 'user-settings' | 'auto-lock-settings' | 'network-settings' | 'swap' | 'send' | 'send-amount' | 'send-confirm' | 'send-success' | 'utxos' | 'create-rgb-utxo' | 'create-utxo-confirm' | 'faucet' | 'error-logs'
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

  // Network-specific assets
  const [assets, setAssets] = useState<Asset[]>([])

  // Bitcoin activities state
  const [activities, setActivities] = useState<BitcoinActivity[]>([])
  const [loadingActivities, setLoadingActivities] = useState<boolean>(false)

  // Add asset state
  const [tokenInput, setTokenInput] = useState<string>('')

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
  const [maxSendableAmount, setMaxSendableAmount] = useState<string>('0.00000000')
  const [sendFeeOption, setSendFeeOption] = useState<'slow' | 'avg' | 'fast' | 'custom'>('fast')
  const [sendUserBalance, setSendUserBalance] = useState<string>('0.00000000')
  const [sendEstimatedFees, setSendEstimatedFees] = useState<bigint[]>([2n, 3n, 5n]) // Default: [slow, avg, fast]
  const [sendLoadingFees, setSendLoadingFees] = useState<boolean>(false)
  const [sendNetworkFee, setSendNetworkFee] = useState<string>('0')
  const [sendTxId, setSendTxId] = useState<string>('')
  const [sendProcessing, setSendProcessing] = useState<boolean>(false)
  const [sendError, setSendError] = useState<string>('')


  // UTXOs states
  const [loadingUtxos, setLoadingUtxos] = useState<boolean>(false)
  const [bitcoinUtxos, setBitcoinUtxos] = useState<UtxoWithRgbStatus[]>([])
  const [rgbUtxos, setRgbUtxos] = useState<UtxoWithRgbStatus[]>([])
  const [utxoTab, setUtxoTab] = useState<'unoccupied' | 'occupied' | 'unlockable'>('unoccupied')
  const [rgbClassificationError, setRgbClassificationError] = useState<string>('')

  // Scroll container ref for scroll-based UX
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Create RGB UTXO states
  const [createUtxoMode, setCreateUtxoMode] = useState<'default' | 'custom'>('default')
  const [createUtxoAmount, setCreateUtxoAmount] = useState<string>('')
  const [createUtxoFeeOption, setCreateUtxoFeeOption] = useState<'slow' | 'avg' | 'fast' | 'custom'>('fast')
  const [createUtxoCustomFee, setCreateUtxoCustomFee] = useState<string>('2')


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

  const shouldRegenerateRegtestAddress = (network: Network, address: string) => {
    return network === 'regtest' && !!address && !isLikelyRegtestAddress(address)
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
        setAssets(parsedAssets)
        console.log('Loaded cached assets for', network)

        // Update ckBTC balance for Lightning BTC asset
        if (currentMnemonic) {
          try {
            const canisterNetwork = mapNetworkToCanister(network)
            const ckBTCBalance = await getCkBTCBalance(currentMnemonic, canisterNetwork)
            // Store as user_lbtc_balance
            await setStorageData({ user_lbtc_balance: ckBTCBalance })
            const updatedAssets = parsedAssets.map((asset: Asset) =>
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
      setAssets(testnet3DefaultAssets)
      await setStorageData({ [assetsKey]: JSON.stringify(testnet3DefaultAssets) })
      console.log('Initialized', network, 'with default assets')

      // Fetch ckBTC balance for Lightning BTC
      if (currentMnemonic) {
        try {
          const canisterNetwork = mapNetworkToCanister(network)
          const ckBTCBalance = await getCkBTCBalance(currentMnemonic, canisterNetwork)
          // Store as user_lbtc_balance
          await setStorageData({ user_lbtc_balance: ckBTCBalance })
          const updatedAssets = testnet3DefaultAssets.map(asset =>
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
      setActivities(btcActivities)
      console.log(`Loaded ${btcActivities.length} activities`)
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
        setMainBalanceAddress((result[`MainBalance_${selectedNetwork}` as keyof typeof result] as string) || '')
        setUtxoHolderAddress((result[`UTXOHolder_${selectedNetwork}` as keyof typeof result] as string) || '')
        setDustHolderAddress((result[`DustHolder_${selectedNetwork}` as keyof typeof result] as string) || '')
      }
    }
    loadCanisterSettings()
  }, [view, selectedNetwork])

  // Inactivity tracking for auto-lock
  useEffect(() => {
    // Only track inactivity when on dashboard or other wallet screens (not on unlock/lock/welcome screens)
    const trackableViews = ['dashboard', 'receive', 'receive-btc', 'receive-rgb', 'convert-lightning', 'send', 'send-amount', 'send-confirm', 'settings', 'user-settings', 'auto-lock-settings', 'network-settings', 'add-assets', 'swap', 'utxos']

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

        // Fetch BTC price from CoinGecko API
        try {
          const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
          const data = await response.json()
          if (data.bitcoin && data.bitcoin.usd) {
            setBtcPrice(data.bitcoin.usd)
          }
        } catch (error) {
          console.error('Error fetching BTC price:', error)
        }
      }
    }
    loadSwapBalance()
  }, [view, swapIconRotated])

  // Check RGB wallet connectivity when RGB receive view opens
  useEffect(() => {
    const checkRgbConnection = async () => {
      if (view === 'receive-rgb') {
        try {
          if (selectedNetwork === 'regtest') {
            console.log('[RGB Receive] Checking regtest RGB backend health')
            const localNodeOnline = await checkLocalRgbNode()
            setRgbWalletOnline(localNodeOnline)
            console.log('[RGB Receive] Regtest RGB backend health result:', localNodeOnline ? 'online' : 'offline')
            return
          }

          // Check if RGB Proxy is configured
          const networkSettings = await getStorageData(['rgbProxy'])
          const rgbProxyUrl = networkSettings.rgbProxy as string

          if (rgbProxyUrl && isValidRgbProxyUrl(rgbProxyUrl)) {
            // RGB Proxy is configured - mark as online
            setRgbWalletOnline(true)
            console.log('RGB Proxy configured:', rgbProxyUrl)
          } else {
            // RGB Proxy not configured
            setRgbWalletOnline(false)
            console.log('RGB Proxy not configured')
          }
        } catch (error) {
          console.error('[RGB Receive] Error checking RGB connection:', error)
          setRgbWalletOnline(false)
        }
      }
    }
    checkRgbConnection()
  }, [view, selectedNetwork, backendProfileId])

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

  // Load user balance and fees when send-amount view opens
  useEffect(() => {
    const loadSendBalance = async () => {
      if (view === 'send-amount') {
        const result = await getStorageData(['user_bitcoin_balance'])
        const balance = result.user_bitcoin_balance || '0.00000000'
        setSendUserBalance(balance)

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
      }
    }
    loadSendBalance()
  }, [view, mnemonic, selectedNetwork])

  // Calculate max sendable amount whenever relevant state changes
  useEffect(() => {
    const calculateMax = async () => {
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
  }, [view, btcBalance, sendEstimatedFees, sendFeeOption, walletAddress, selectedNetwork])

  // Navigate to send confirm screen
  const handleSendNext = async () => {
    if (!sendAmount || parseFloat(sendAmount) === 0) {
      setSendError('Please enter a valid amount')
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

        if (bitcoinUtxos.length === 0) {
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
          // Use already-loaded UTXOs from state
          vanillaUtxos = bitcoinUtxos
            .filter(u => u.account === 'vanilla' && !u.isLocked)
            .map(u => ({
              txid: u.txid,
              vout: u.vout,
              value: Number(u.value),
              address: u.address,
              derivationPath: u.derivationPath,
              account: u.account as 'vanilla',
              chain: u.chain as 0 | 1,
              index: u.index as number
            }));
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
      } else {
        // ICP mode: Fetch from canister
        console.log('Fetching UTXOs from ICP canister')
        const canisterNetwork = mapNetworkToCanister(selectedNetwork)
        utxos = await getUtxos(walletAddress, canisterNetwork)
      }

      console.log('UTXOs received:', utxos?.length || 0)

      // Fetch RGB-occupied UTXOs using the new RGB fetcher
      try {
        console.log('[RGB] Fetching RGB-occupied UTXOs from proxy...')

        // Get RGB proxy URL from storage or use default
        const storageData = await getStorageData(['rgbProxy'])
        const rgbProxyUrl = (storageData.rgbProxy as string) || 'http://89.117.52.115:3000/json-rpc'

        // Fetch RGB UTXOs directly from the proxy
        const rgbOccupiedUtxos = await fetchRgbOccupiedUtxos(walletAddress, rgbProxyUrl, selectedNetwork)

        console.log(`[RGB] Found ${rgbOccupiedUtxos.length} RGB-occupied UTXOs`)

        // For Bitcoin UTXOs (unoccupied), filter out the occupied ones
        if (utxos && utxos.length > 0) {
          const occupiedOutpoints = new Set(
            rgbOccupiedUtxos.map(u => `${u.txid}:${u.vout}`)
          )

          // Filter and tag unoccupied UTXOs
          const unoccupiedUtxos = utxos
            .filter(u => !occupiedOutpoints.has(`${u.txid}:${u.vout}`))
            .map(u => ({
              ...u,
              address: u.address,
              derivationPath: u.derivationPath,
              isOccupied: false,
              // Isolation Wall: Tag as locked if it belongs to the Colored account
              isLocked: u.account === 'colored'
            }))

          setBitcoinUtxos(unoccupiedUtxos)

          // Convert RGB UTXOs to the expected format
          const occupiedUtxos = rgbOccupiedUtxos.map(u => {
            // Find the original UTXO to get account info
            const originalUtxo = utxos!.find(utxo => utxo.txid === u.txid && utxo.vout === u.vout);
            return {
              txid: u.txid,
              vout: u.vout,
              value: BigInt(u.btcAmount),
              address: originalUtxo?.address || '',
              derivationPath: originalUtxo?.derivationPath || '',
              isOccupied: true,
              isLocked: true, // RGB-occupied UTXOs are always locked
              rgbAssets: u.assets,
              account: originalUtxo?.account || 'colored'
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
        if (utxos && utxos.length > 0) {
          setBitcoinUtxos(utxos.map(u => ({
            ...u,
            address: u.address,
            derivationPath: u.derivationPath,
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
          {/* Header - Fixed at top */}
          <div className="wallet-header">
            <div className="brand">
              <span className="brand-icon">⚡</span>
              <span className="brand-name">PHOTON</span>
            </div>
            <div className="header-actions">
              <button className="icon-btn network-btn" onClick={() => setShowNetworkModal(true)}>
                <span
                  className="network-icon"
                  style={{ color: networks.find(n => n.id === selectedNetwork)?.color || '#f7931a' }}
                >₿</span>
                <span className="dropdown-arrow">▾</span>
              </button>
              <button className="icon-btn" onClick={handleRefreshBalance} title="Refresh balance">↻</button>
              <button className="icon-btn" onClick={() => setShowMenu(!showMenu)}>≡</button>
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

          {/* Scrollable Content Container - Everything scrolls together */}
          <div className="wallet-scroll-container" ref={scrollContainerRef}>
            {/* Balance Section */}
            <div className="balance-section">
              <div className="network-label">{networks.find(n => n.id === selectedNetwork)?.name.replace('Bitcoin ', '') || 'Mainnet'}</div>
              <div className="balance-row">
                {loadingBalance ? (
                  <div className="skeleton-loader"></div>
                ) : (
                  <span className="balance-amount">
                    {(parseFloat(btcBalance) + pendingBalance).toFixed(8)}
                  </span>
                )}
                <span className="balance-currency">BTC</span>
                <button className="info-btn" onClick={() => setShowBalanceInfo(!showBalanceInfo)}>ⓘ</button>
              </div>

              {/* Balance Error Display */}
              {balanceError && (
                <div className="balance-error">
                  <span className="error-icon">⚠️</span>
                  <span className="error-text">{balanceError}</span>
                </div>
              )}

              {/* Balance Info Popup */}
              {showBalanceInfo && (
                <>
                  <div className="balance-popup-overlay" onClick={() => setShowBalanceInfo(false)}></div>
                  <div className="balance-popup" onClick={() => setShowBalanceInfo(false)}>
                    <div className="balance-popup-row">
                      <span className="balance-popup-label">Available</span>
                      <div className="balance-popup-value">
                        <span className="balance-popup-btc">0 BTC</span>
                        <span className="balance-popup-sats">0 sats</span>
                      </div>
                    </div>
                    <div className="balance-popup-row">
                      <span className="balance-popup-label">Unconfirmed</span>
                      <div className="balance-popup-value">
                        <span className="balance-popup-btc">0 BTC</span>
                        <span className="balance-popup-sats">0 sats</span>
                      </div>
                    </div>
                    <div className="balance-popup-row">
                      <span className="balance-popup-label">UTXO Locked</span>
                      <div className="balance-popup-value">
                        <span className="balance-popup-btc">0 BTC</span>
                        <span className="balance-popup-sats">0 sats</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
              <div className="address-row">
                <span className="address-badge">BTC</span>
                {loadingAddress ? (
                  <span className="address-text">Loading...</span>
                ) : loadingExpand ? (
                  <div className="wave-loader">
                    <div className="wave-dot"></div>
                    <div className="wave-dot"></div>
                    <div className="wave-dot"></div>
                  </div>
                ) : (
                  <span className="address-text" title={walletAddress || btcAddress}>
                    {truncateAddress(walletAddress || btcAddress) || 'No address'}
                  </span>
                )}
                <button
                  className="icon-btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(walletAddress || btcAddress)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  title={copied ? 'Copied!' : 'Copy address'}
                >
                  {copied ? '✓' : '⧉'}
                </button>
                <button
                  className="icon-btn-sm"
                  onClick={handleExpandAddress}
                  title={addressGenerationMethod === 'bitcoin' ? 'Expand disabled in Bitcoin mode' : 'Expand - Fetch from canister'}
                  disabled={addressGenerationMethod === 'bitcoin'}
                  style={{
                    opacity: addressGenerationMethod === 'bitcoin' ? 0.5 : 1,
                    cursor: addressGenerationMethod === 'bitcoin' ? 'not-allowed' : 'pointer'
                  }}
                >
                  ⊡
                </button>
              </div>
              {/* Principal ID Row */}
              <div className="address-row principal-row">
                <span className="address-badge principal-badge">ICP</span>
                <span className="address-text" title={principalId}>
                  {truncateAddress(principalId) || 'No Principal'}
                </span>
                <button
                  className="icon-btn-sm"
                  onClick={copyPrincipal}
                  title={copiedPrincipal ? 'Copied!' : 'Copy Principal ID'}
                >
                  {copiedPrincipal ? '✓' : '⧉'}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="action-buttons">
              <button className="action-btn" onClick={() => setView('receive')}>
                <div className="action-icon receive">↓</div>
                <span className="action-label">Receive</span>
              </button>
              <button className="action-btn" onClick={() => setView('send')}>
                <div className="action-icon send">↗</div>
                <span className="action-label">Send</span>
              </button>
              <button className="action-btn" onClick={handleViewUtxos}>
                <div className="action-icon utxos">▤</div>
                <span className="action-label">UTXOs</span>
              </button>
            </div>

            {/* Tabs */}
            <div className="tabs-container">
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

            {/* Asset List */}
            {activeTab === 'assets' && (
              <div className="asset-list">
                {assets.length === 0 ? (
                  <div className="assets-empty">
                    <div className="empty-icon">📦</div>
                    <p className="empty-text">No Asset</p>
                    <button className="add-assets-btn" onClick={() => setView('add-assets')}>
                      + Add Assets
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
                            <span className="asset-name">{asset.name}</span>
                            <span className="asset-amount">
                              {asset.amount} {asset.unit}
                            </span>
                          </div>
                        </div>
                        <div className="asset-arrow">›</div>
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
                          const explorerUrl = selectedNetwork === 'mainnet'
                            ? `https://blockstream.info/tx/${activity.txid}`
                            : `https://blockstream.info/testnet/tx/${activity.txid}`;

                          const shortTxid = activity.txid ? `${activity.txid.slice(0, 4)}...${activity.txid.slice(-4)}` : 'unknown';

                          return (
                            <div
                              key={activity.txid}
                              className="activity-item"
                              onClick={() => window.open(explorerUrl, '_blank')}
                            >
                              <div className="activity-left">
                                <div className={`activity-icon-circle ${activity.type.toLowerCase()}`}>
                                  {activity.type === 'Receive' ? (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
                                  ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                                  )}
                                </div>
                                <div className="activity-info">
                                  <span className="activity-type">{activity.type}</span>
                                  <div className="activity-tx-row">
                                    <span className="activity-txid">tx: {shortTxid}</span>
                                    <span className="activity-link-icon">↗</span>
                                  </div>
                                </div>
                              </div>
                              <div className="activity-right">
                                <span className={`activity-amount-new ${activity.type.toLowerCase()}`}>
                                  {activity.type === 'Send' ? '-' : ''}{activity.amount.toFixed(8)} BTC
                                </span>
                                <span className={`activity-status-new ${activity.status.toLowerCase()}`}>
                                  {activity.status}
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

          <div className="receive-options">
            <button className="receive-option" onClick={() => setView('receive-rgb')}>
              <span className="receive-option-text">Receive RGB Asset</span>
              <span className="receive-option-arrow">›</span>
            </button>
            <button className="receive-option" onClick={() => setView('receive-btc')}>
              <span className="receive-option-text">Receive Bitcoin on-chain</span>
              <span className="receive-option-arrow">›</span>
            </button>
            <button className="receive-option" onClick={() => setView('convert-lightning')}>
              <span className="receive-option-text">Convert Bitcoin to ⚡ Lightning</span>
              <span className="receive-option-arrow">›</span>
            </button>
            <button className="receive-option" onClick={() => setView('swap')}>
              <span className="receive-option-text">Swap BTC</span>
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

            <div className="btc-address-box">
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
            <p className="card-subtitle" style={{ textAlign: 'center', marginBottom: '20px', fontSize: '14px', color: '#666' }}>
              Instructions: Send your BTC to the below address
            </p>

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

            <div className="btc-address-box">
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
          </div>

          {rgbInvoiceStep === 'form' ? (
            <>
              {/* Form View */}
              <div className="receive-rgb-content">
                {/* Wallet Connectivity Status */}
                <div className="rgb-status-row">
                  <span className="rgb-status-label">Wallet Status</span>
                  <div className="rgb-status-indicator">
                    <span className={`rgb-status-dot ${rgbWalletOnline ? 'online' : 'offline'}`}></span>
                    <span className="rgb-status-text">{rgbWalletOnline ? 'Online' : 'Offline'}</span>
                  </div>
                </div>

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

                {/* BTC Balance Check */}
                <div className="rgb-info-box">
                  <div className="rgb-info-icon">⚠️</div>
                  <div className="rgb-info-content">
                    <p className="rgb-info-title">Gas Requirement</p>
                    <p className="rgb-info-desc">You need a small amount of {selectedNetwork === 'mainnet' ? 'Bitcoin' : 'Testnet BTC'} for RGB transfers. Current balance: {btcBalance} BTC</p>
                  </div>
                </div>

                {/* Colored Address Display */}
                <div className="rgb-field">
                  <label className="rgb-label">Your Colored Address (RGB)</label>
                  <div className="rgb-address-display" style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '10px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    wordBreak: 'break-all',
                    color: '#9ca3af',
                    marginTop: '5px'
                  }}>
                    {coloredAddress || 'Generating...'}
                  </div>
                </div>

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
                  console.log('[RGB Receive] Create Invoice clicked', {
                    network: selectedNetwork,
                    assetKey: rgbAsset || null,
                    openAmount,
                    rgbAmount,
                    btcBalance,
                  })
                  setRgbGenerating(true)
                  setRgbError('')

                  try {
                    if (selectedNetwork === 'regtest') {
                      console.log('[RGB Receive] Using Photon backend regtest invoice flow')
                      const rgbBackendOnline = await checkLocalRgbNode()
                      setRgbWalletOnline(rgbBackendOnline)
                      console.log('[RGB Receive] Backend health before invoice request:', rgbBackendOnline)

                      if (!rgbBackendOnline) {
                        console.warn('[RGB Receive] Aborting invoice creation because backend is offline')
                        setRgbError('Photon RGB backend is unavailable. Please try again in a moment.')
                        setRgbGenerating(false)
                        return
                      }

                      const contractSettingsKey = getNetworkContractsKey(selectedNetwork)
                      const contractSettings = await getStorageData([contractSettingsKey])
                      const storedContractMapRaw = contractSettings[contractSettingsKey]
                      const storedContractMap =
                        typeof storedContractMapRaw === 'string'
                          ? JSON.parse(storedContractMapRaw) as Record<string, string>
                          : {}

                      const assetId = rgbAsset ? storedContractMap[rgbAsset] : undefined
                      console.log('[RGB Receive] Resolved regtest asset mapping', {
                        assetKey: rgbAsset || null,
                        assetId: assetId || null,
                      })

                      if (rgbAsset && !assetId) {
                        console.warn('[RGB Receive] Selected asset has no registered regtest contract ID')
                        setRgbError('Selected asset is not registered with a regtest RGB contract ID.')
                        setRgbGenerating(false)
                        return
                      }

                      const invoiceAmount = openAmount ? undefined : (parseFloat(rgbAmount) || 0)
                      console.log('[RGB Receive] Prepared invoice request', {
                        assetId: assetId || null,
                        invoiceAmount: invoiceAmount ?? null,
                        openAmount,
                      })
                      if (!openAmount && (!invoiceAmount || invoiceAmount <= 0)) {
                        console.warn('[RGB Receive] Invalid amount supplied for fixed-amount invoice')
                        setRgbError('Enter a valid RGB amount or enable Open Amount.')
                        setRgbGenerating(false)
                        return
                      }

                      const invoiceResult = await createRegtestRgbInvoice({
                        assetId,
                        amount: invoiceAmount,
                        openAmount,
                      })
                      console.log('[RGB Receive] Invoice created successfully', {
                        recipientId: invoiceResult.recipient_id,
                        batchTransferIdx: invoiceResult.batch_transfer_idx,
                        expirationTimestamp: invoiceResult.expiration_timestamp ?? null,
                      })

                      setRgbWalletOnline(true)
                      setRgbInvoice(invoiceResult.invoice)
                      setRgbInvoiceStep('invoice')
                      return
                    }

                    // 1. Check RGB Proxy configuration
                    const networkSettings = await getStorageData(['rgbProxy'])
                    const rgbProxyUrl = networkSettings.rgbProxy as string

                    if (!rgbProxyUrl || !isValidRgbProxyUrl(rgbProxyUrl)) {
                      setRgbError('RGB Proxy not configured. Please configure it in Network Settings.')
                      setRgbGenerating(false)
                      return
                    }

                    // 2. Mark wallet as online
                    setRgbWalletOnline(true)

                    // 3. Fetch available UTXOs from ICP canister
                    const canisterNetwork = mapNetworkToCanister(selectedNetwork)
                    const utxos = await getUtxos(walletAddress, canisterNetwork)

                    if (!utxos || utxos.length === 0) {
                      setRgbError('No available UTXOs. Please ensure your wallet has Bitcoin funds.')
                      setRgbWalletOnline(false)
                      setRgbGenerating(false)
                      return
                    }

                    // 4. Select first UTXO as seal
                    const sealUtxo = utxos[0]
                    console.log('Selected UTXO for RGB seal:', sealUtxo)

                    // 5. Get contract ID for selected asset
                    // Prefer the per-network storage map so regtest assets can be registered
                    // without editing the bundle.
                    const contractsKey = getNetworkContractsKey(selectedNetwork)
                    const contractSettings = await getStorageData([contractsKey])
                    const storedContractMapRaw = contractSettings[contractsKey]
                    const storedContractMap =
                      typeof storedContractMapRaw === 'string'
                        ? JSON.parse(storedContractMapRaw) as Record<string, string>
                        : {}

                    // Backward-compatible examples used when no storage mapping is present.
                    const defaultContractIds: Record<string, string> = {
                      puliyal: 'rgb:2ae8d9f1b3c45678901234567890abcd',
                      bitcoin: 'rgb:1234567890abcdef1234567890abcdef',
                      xiao: 'rgb:fedcba0987654321fedcba0987654321',
                    }

                    const contractId = rgbAsset
                      ? (storedContractMap[rgbAsset] || defaultContractIds[rgbAsset] || 'rgb:default00000000000000000000')
                      : 'rgb:default00000000000000000000' // Generic contract for "any asset"

                    // 6. Determine amount (0 for open amount)
                    const invoiceAmount = openAmount ? 0 : (parseFloat(rgbAmount) || 0)

                    // 7. Generate RGB invoice
                    const invoiceResult = await generateRgbInvoice(
                      sealUtxo.txid,
                      sealUtxo.vout,
                      contractId,
                      invoiceAmount,
                      rgbProxyUrl
                    )

                    console.log('Generated RGB Invoice:', invoiceResult)

                    // 8. Notify RGB Proxy about blinded UTXO
                    try {
                      await notifyRgbProxy(
                        rgbProxyUrl,
                        invoiceResult.blindedUtxo,
                        contractId,
                        invoiceAmount
                      )
                      console.log('RGB Proxy notified successfully')
                    } catch (proxyError) {
                      console.warn('RGB Proxy notification failed:', proxyError)
                      // Continue anyway - invoice is still valid
                    }

                    // 9. Display invoice to user
                    setRgbInvoice(invoiceResult.invoice)
                    setRgbInvoiceStep('invoice')
                  } catch (error) {
                    console.error('[RGB Receive] Error generating RGB invoice:', error)
                    const backendStillOnline =
                      selectedNetwork === 'regtest' ? await checkLocalRgbNode() : false
                    console.log('[RGB Receive] Backend health after invoice failure:', backendStillOnline)
                    setRgbWalletOnline(backendStillOnline)
                    setRgbError(`Failed to generate invoice: ${error instanceof Error ? error.message : 'Unknown error'}`)
                  } finally {
                    console.log('[RGB Receive] Create Invoice flow complete')
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
                  'Create Invoice'
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

      {/* Add Assets Screen */}
      {view === 'add-assets' && (
        <div className="receive-container add-assets-container">
          <div className="receive-header">
            <button className="back-arrow" onClick={() => setView('dashboard')}>←</button>
            <h2 className="receive-title">Add Assets</h2>
            <a
              href="https://photon.net/asset/issue"
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
              onChange={(e) => setTokenInput(e.target.value)}
            />

            <div className="asset-registry-row">
              <span className="registry-text">Display data for all public RGB assets</span>
              <a
                href="https://photon.net/asset/testnet"
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
            disabled={!tokenInput}
          >
            Import
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

          <div className="settings-content" style={{ padding: '1rem 0' }}>
            {/* Auto-Lock Timer */}
            <div
              className="settings-menu-item"
              onClick={() => {
                setView('auto-lock-settings')
              }}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🕐</span>
                <span style={{ fontWeight: '600', color: '#fff' }}>Auto-Lock Timer</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>{autoLockTimer}</span>
                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>›</span>
              </div>
            </div>

            {/* Color Mode */}
            <div
              className="settings-menu-item"
              onClick={() => {
                // Placeholder for future functionality
                console.log('Color Mode clicked')
              }}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🌙</span>
                <span style={{ fontWeight: '600', color: '#fff' }}>Color Mode</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>{colorMode}</span>
                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>›</span>
              </div>
            </div>

            {/* Advanced Setting */}
            <div
              className="settings-menu-item"
              onClick={() => {
                // Navigate to admin settings
                setView('settings')
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'background 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🔧</span>
                <span style={{ fontWeight: '600', color: '#fff' }}>Advanced Setting</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>›</span>
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
          <div className="receive-container">
            <div className="receive-header">
              <button className="back-arrow" onClick={() => setView('dashboard')}>←</button>
              <h2 className="receive-title">Send</h2>
            </div>

            <div className="receive-btc-content">
              <div className="send-input-group" style={{ maxWidth: '320px', width: '100%' }}>
                <label className="send-label">Receiver</label>
                <input
                  type="text"
                  className="send-input"
                  placeholder="Invoice or Bitcoin address"
                  value={sendReceiverAddress}
                  onChange={(e) => setSendReceiverAddress(e.target.value)}
                />
              </div>
            </div>

            <button
              className="btn-primary copy-btc-btn"
              disabled={!sendReceiverAddress}
              onClick={() => setView('send-amount')}
              style={{ marginBottom: '30px' }}
            >
              Next
            </button>
          </div>
        )
      }


      {/* Send Amount Screen */}
      {
        view === 'send-amount' && (
          <div style={{ minHeight: '100vh', maxWidth: '100vw', background: '#0a0a0a', display: 'flex', flexDirection: 'column', padding: '0', boxSizing: 'border-box', overflowX: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', position: 'relative' }}>
              <button
                onClick={() => setView('send')}
                style={{ position: 'absolute', left: '1rem', background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}
              >
                ←
              </button>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#fff', margin: 0 }}>Send BTC</h2>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', boxSizing: 'border-box' }}>
              {/* Card 1: Recipient + Amount */}
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '1.25rem', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                {/* Recipient */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#fff', marginBottom: '0.5rem' }}>Recipient</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.75rem 1rem', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <span style={{ flex: 1, color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sendReceiverAddress}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(sendReceiverAddress)}
                      style={{ background: 'transparent', border: 'none', color: 'rgba(255, 255, 255, 0.6)', fontSize: '1rem', cursor: 'pointer', padding: '0.25rem' }}
                    >
                      ⎘
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: '600', color: '#fff' }}>Amount</label>
                    <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)' }}>Balance: {sendUserBalance} BTC</span>
                  </div>
                  <div style={{ position: 'relative', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <input
                      type="text"
                      placeholder="0.000000"
                      value={sendAmount}
                      onChange={(e) => {
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
                      style={{ width: '100%', padding: '1rem', paddingRight: '120px', background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', fontWeight: '700', outline: 'none' }}
                    />
                    <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>BTC</span>
                      <button
                        onClick={handleMaxAmount}
                        style={{ background: '#f7931a', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Max
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>maximum amount that can be sent: {maxSendableAmount} BTC</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Fee Selection */}
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '1.25rem', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: '600', color: '#fff' }}>
                    Fee
                    <button
                      onClick={() => setSendEstimatedFees([2n, 3n, 5n])}
                      style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#f7931a', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      (use default [2,3,5])
                    </button>
                  </label>
                  <button
                    onClick={handleRefreshFees}
                    disabled={sendLoadingFees}
                    style={{ background: 'transparent', border: 'none', color: 'rgba(255, 255, 255, 0.6)', fontSize: '1.1rem', cursor: 'pointer', padding: '0.25rem' }}
                  >
                    {sendLoadingFees ? '...' : '⟳'}
                  </button>
                </div>

                {/* Horizontal Fee Options */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  {/* Slow */}
                  <button
                    onClick={() => setSendFeeOption('slow')}
                    style={{
                      background: sendFeeOption === 'slow' ? '#f7931a' : 'rgba(255, 255, 255, 0.08)',
                      border: sendFeeOption === 'slow' ? '1px solid #f7931a' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '12px',
                      padding: '0.75rem 0.5rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.25rem',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff' }}>Slow</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: sendFeeOption === 'slow' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.7)' }}>{Number(sendEstimatedFees[0])} sat/VB</div>
                    <div style={{ fontSize: '0.65rem', color: sendFeeOption === 'slow' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.5)' }}>~ 2 hours</div>
                  </button>

                  {/* Avg */}
                  <button
                    onClick={() => setSendFeeOption('avg')}
                    style={{
                      background: sendFeeOption === 'avg' ? '#f7931a' : 'rgba(255, 255, 255, 0.08)',
                      border: sendFeeOption === 'avg' ? '1px solid #f7931a' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '12px',
                      padding: '0.75rem 0.5rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.25rem',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff' }}>Avg</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: sendFeeOption === 'avg' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.7)' }}>{Number(sendEstimatedFees[1])} sat/VB</div>
                    <div style={{ fontSize: '0.65rem', color: sendFeeOption === 'avg' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.5)' }}>~ 30 mins</div>
                  </button>

                  {/* Fast */}
                  <button
                    onClick={() => setSendFeeOption('fast')}
                    style={{
                      background: sendFeeOption === 'fast' ? '#f7931a' : 'rgba(255, 255, 255, 0.08)',
                      border: sendFeeOption === 'fast' ? '1px solid #f7931a' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '12px',
                      padding: '0.75rem 0.5rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.25rem',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff' }}>Fast</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: sendFeeOption === 'fast' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.7)' }}>{Number(sendEstimatedFees[2])} sat/VB</div>
                    <div style={{ fontSize: '0.65rem', color: sendFeeOption === 'fast' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.5)' }}>~ 10 mins</div>
                  </button>

                  {/* Custom */}
                  <button
                    onClick={() => setSendFeeOption('custom')}
                    style={{
                      background: sendFeeOption === 'custom' ? '#f7931a' : 'rgba(255, 255, 255, 0.08)',
                      border: sendFeeOption === 'custom' ? '1px solid #f7931a' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '12px',
                      padding: '0.75rem 0.5rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff' }}>Custom</div>
                  </button>
                </div>
              </div>
            </div>

            {/* Next Button */}
            <div style={{ padding: '1rem' }}>
              <button
                disabled={!sendAmount || parseFloat(sendAmount) === 0}
                onClick={handleSendNext}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: (!sendAmount || parseFloat(sendAmount) === 0) ? 'rgba(247, 147, 26, 0.5)' : 'linear-gradient(135deg, #f7931a 0%, #e67e00 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50px',
                  fontSize: '1rem',
                  fontWeight: '700',
                  cursor: (!sendAmount || parseFloat(sendAmount) === 0) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  opacity: (!sendAmount || parseFloat(sendAmount) === 0) ? 0.6 : 1
                }}
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
              <h2 className="send-title">Sign Transaction</h2>
            </div>

            <div className="send-content">
              <div className="send-confirm-box" style={{ backgroundColor: '#1f2937', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid #374151' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.5rem' }}>From</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#f3f4f6' }}>{truncateAddress(walletAddress || btcAddress)}</div>
                  </div>
                  <div style={{ padding: '0 1rem', fontSize: '1.25rem', color: '#6b7280' }}>→</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.5rem' }}>Send to</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#f3f4f6' }}>{truncateAddress(sendReceiverAddress)}</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #374151', paddingTop: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.5rem' }}>Send Amount</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#f3f4f6' }}>{sendAmount} BTC</div>
                </div>
              </div>

              <div className="send-input-group" style={{ marginTop: '-25px' }}>
                <label className="send-label">Network Fee</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: '#1f2937', borderRadius: '8px', border: '1px solid #374151' }}>
                  <span style={{ fontSize: '1rem', fontWeight: '500', color: '#f3f4f6' }}>{sendNetworkFee}</span>
                  <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>BTC</span>
                </div>
              </div>

              <div className="send-input-group" style={{ marginTop: '-10px' }}>
                <label className="send-label">Network Fee Rate</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: '#1f2937', borderRadius: '8px', border: '1px solid #374151' }}>
                  <span style={{ fontSize: '1rem', fontWeight: '500', color: '#f3f4f6' }}>
                    {sendFeeOption === 'slow' ? Number(sendEstimatedFees[0]) :
                      sendFeeOption === 'avg' ? Number(sendEstimatedFees[1]) :
                        Number(sendEstimatedFees[2])}
                  </span>
                  <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>sat/VB</span>
                </div>
              </div>

              {sendError && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fee2e2', borderRadius: '8px' }}>
                  <span style={{ color: '#ef4444', fontSize: '0.875rem' }}>{sendError}</span>
                </div>
              )}

              <button
                className="send-next-btn"
                onClick={handleSendBitcoin}
                disabled={sendProcessing}
                style={{ marginTop: 'calc(2rem - 35px)', backgroundColor: '#ff6b2c' }}
              >
                {sendProcessing ? 'Sending...' : 'Sign & Pay'}
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
              <h2 className="send-title">Sign Transaction</h2>
            </div>

            <div className="send-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '3rem' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>

              <p style={{ fontSize: '1rem', color: '#111827', textAlign: 'center', marginBottom: '2rem', maxWidth: '300px', fontWeight: '500' }}>
                Payment of {sendAmount} BTC successfully!
              </p>

              {sendTxId && (
                <div style={{ backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '1rem', marginBottom: '2rem', maxWidth: '320px' }}>
                  <p style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.5rem' }}>Transaction ID:</p>
                  <p style={{ fontSize: '0.75rem', color: '#111827', wordBreak: 'break-all', fontFamily: 'monospace' }}>
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

      {/* UTXOs View */}
      {
        view === 'utxos' && (
          <div className="wallet-wrapper" style={{ padding: '0' }}>
            {/* Header - Fixed at top */}
            <div className="wallet-header">
              <button className="icon-btn" onClick={() => setView('dashboard')}>←</button>
              <h2 style={{ flex: 1, textAlign: 'center', margin: 0 }}>RGB UTXOs</h2>
              <button
                onClick={() => setView('create-rgb-utxo')}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.8rem',
                  color: '#fff',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Create UTXO
              </button>
            </div>

            {/* Scrollable Content Container */}
            <div className="wallet-scroll-container">
              {/* Tabs */}
              <div className="utxos-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', padding: '0 1rem 0.5rem 1rem' }}>
                <button onClick={() => setUtxoTab('unoccupied')} style={{ background: utxoTab === 'unoccupied' ? 'rgba(247, 147, 26, 0.2)' : 'transparent', color: utxoTab === 'unoccupied' ? '#f7931a' : 'rgba(255, 255, 255, 0.6)', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.2s ease' }}>Unoccupied</button>
                <button onClick={() => setUtxoTab('occupied')} style={{ background: utxoTab === 'occupied' ? 'rgba(247, 147, 26, 0.2)' : 'transparent', color: utxoTab === 'occupied' ? '#f7931a' : 'rgba(255, 255, 255, 0.6)', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.2s ease' }}>Occupied</button>
                <button onClick={() => setUtxoTab('unlockable')} style={{ background: utxoTab === 'unlockable' ? 'rgba(247, 147, 26, 0.2)' : 'transparent', color: utxoTab === 'unlockable' ? '#f7931a' : 'rgba(255, 255, 255, 0.6)', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.2s ease' }}>Unlockable</button>
              </div>

              {/* RGB Classification Error Warning */}
              {rgbClassificationError && (
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', margin: '0 1rem 1rem 1rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'rgba(239, 68, 68, 0.9)' }}>⚠️ {rgbClassificationError}</div>
                </div>
              )}

              {/* UTXO Content */}
              <div style={{ padding: '0 1rem 2rem 1rem' }}>
                {loadingUtxos ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem', color: 'rgba(255, 255, 255, 0.5)' }}>Classifying UTXOs with RGB proxy...</div>
                ) : (
                  <>
                    {utxoTab === 'unoccupied' && (
                      <>
                        {bitcoinUtxos.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
                            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No Unoccupied UTXOs</p>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'rgba(255, 255, 255, 0.3)' }}>Bitcoin UTXOs available for RGB asset binding will appear here</p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ padding: '0.75rem 1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                              <div style={{ fontSize: '0.85rem', color: 'rgba(59, 130, 246, 0.9)' }}>💡 These Bitcoin UTXOs are available for RGB asset binding</div>
                            </div>
                            {bitcoinUtxos.map((utxo) => (
                              <div key={`${utxo.txid}:${utxo.vout}`} style={{
                                background: 'rgba(255, 255, 255, 0.04)',
                                borderRadius: '12px',
                                padding: '1rem',
                                border: utxo.isLocked ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255, 255, 255, 0.06)',
                                opacity: utxo.isLocked ? 0.8 : 1
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                  <div>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}>Output</span>
                                    <div style={{ color: '#fff', fontSize: '0.95rem', marginTop: '0.25rem', fontFamily: 'monospace' }}>{utxo.txid.slice(0, 12)}...{utxo.txid.slice(-8)}:{utxo.vout}</div>
                                  </div>
                                  {utxo.isLocked && (
                                    <div style={{
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      color: '#ef4444',
                                      fontSize: '0.7rem',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600,
                                      border: '1px solid rgba(239, 68, 68, 0.2)'
                                    }}>
                                      LOCKED
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}>{utxo.isLocked ? 'Reserved for RGB' : 'Available for RGB Binding'}</span>
                                  <div style={{ color: '#fff', fontSize: '0.95rem', marginTop: '0.25rem', fontWeight: 600 }}>{(Number(utxo.value) / 100000000).toFixed(8)} BTC</div>
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
                          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎨</div>
                            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No Occupied UTXOs</p>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'rgba(255, 255, 255, 0.3)' }}>UTXOs with RGB assets bound to them will appear here</p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ padding: '0.75rem 1rem', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '8px', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                              <div style={{ fontSize: '0.85rem', color: 'rgba(168, 85, 247, 0.9)' }}>🎨 These UTXOs have RGB assets bound to them</div>
                            </div>
                            {rgbUtxos.map((utxo) => (
                              <div key={`${utxo.txid}:${utxo.vout}`} style={{
                                background: 'rgba(255, 255, 255, 0.04)',
                                borderRadius: '12px',
                                padding: '1rem',
                                border: '1px solid rgba(168, 85, 247, 0.2)',
                                opacity: 0.9
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                  <div>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}>Output</span>
                                    <div style={{ color: '#fff', fontSize: '0.95rem', marginTop: '0.25rem', fontFamily: 'monospace' }}>{utxo.txid.slice(0, 12)}...{utxo.txid.slice(-8)}:{utxo.vout}</div>
                                  </div>
                                  <div style={{
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    color: '#ef4444',
                                    fontSize: '0.7rem',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: 600,
                                    border: '1px solid rgba(239, 68, 68, 0.2)'
                                  }}>
                                    LOCKED
                                  </div>
                                </div>
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}>Bitcoin Value</span>
                                  <div style={{ color: '#fff', fontSize: '0.95rem', marginTop: '0.25rem', fontWeight: 600 }}>{(Number(utxo.value) / 100000000).toFixed(8)} BTC</div>
                                </div>
                                {utxo.rgbAllocations && utxo.rgbAllocations.length > 0 && (
                                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.75rem' }}>
                                    <span style={{ color: 'rgba(168, 85, 247, 0.7)', fontSize: '0.85rem', fontWeight: 600 }}>RGB Assets ({utxo.rgbAllocations.length})</span>
                                    {utxo.rgbAllocations.map((allocation, idx) => (
                                      <div key={idx} style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(168, 85, 247, 0.05)', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.25rem' }}>
                                          {allocation.ticker || allocation.assetName || 'RGB Asset'}
                                        </div>
                                        <div style={{ color: 'rgba(168, 85, 247, 0.9)', fontSize: '0.9rem', fontWeight: 600 }}>
                                          {allocation.amount.toString()} units
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)', marginTop: '0.25rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
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
                      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔓</div>
                        <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No Unlockable UTXOs</p>
                        <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'rgba(255, 255, 255, 0.3)' }}>UTXOs that can be unlocked for spending will appear here</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* Create RGB UTXO View */}
      {
        view === 'create-rgb-utxo' && (
          <div className="wallet-container" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="wallet-header">
              <button className="icon-btn" onClick={() => setView('utxos')}>←</button>
              <h2 style={{ flex: 1, textAlign: 'center', margin: 0 }}>Create RGB UTXO</h2>
              <button className="icon-btn" style={{ visibility: 'hidden' }}>⋮</button>
            </div>

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
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff' }}>2 sat/VB</div>
                  </div>
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
                      <button onClick={() => setCreateUtxoFeeOption('slow')} style={{ padding: '0.75rem 0.5rem', background: createUtxoFeeOption === 'slow' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: createUtxoFeeOption === 'slow' ? '#fff' : 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}><div style={{ fontWeight: 600 }}>Slow</div><div>2 sat/VB</div><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>≈ 1 hours</div></button>
                      <button onClick={() => setCreateUtxoFeeOption('avg')} style={{ padding: '0.75rem 0.5rem', background: createUtxoFeeOption === 'avg' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: createUtxoFeeOption === 'avg' ? '#fff' : 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}><div style={{ fontWeight: 600 }}>Avg</div><div>2 sat/VB</div><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>≈ 30 mins</div></button>
                      <button onClick={() => setCreateUtxoFeeOption('fast')} style={{ padding: '0.75rem 0.5rem', background: createUtxoFeeOption === 'fast' ? '#f7931a' : 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', fontWeight: createUtxoFeeOption === 'fast' ? 600 : 400 }}><div style={{ fontWeight: 600 }}>Fast</div><div>2 sat/VB</div><div style={{ fontSize: '0.75rem', opacity: 0.9 }}>≈ 10 mins</div></button>
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
          </div>
        )
      }

      {/* Create UTXO Confirmation - Sign Transaction */}
      {
        view === 'create-utxo-confirm' && (
          <div className="wallet-container" style={{ padding: '1rem' }}>
            <div className="wallet-header">
              <button className="icon-btn" onClick={() => setView('create-rgb-utxo')}>←</button>
              <h2 style={{ flex: 1, textAlign: 'center', margin: 0 }}>Sign Transaction</h2>
              <button className="icon-btn" style={{ visibility: 'hidden' }}>⋮</button>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* From/To Addresses Box */}
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.35rem' }}>From</div>
                    <div style={{ fontSize: '0.9rem', color: '#fff', fontFamily: 'monospace' }}>
                      {mainBalanceAddress ? `${mainBalanceAddress.slice(0, 7)}...${mainBalanceAddress.slice(-4)}` : walletAddress ? `${walletAddress.slice(0, 7)}...${walletAddress.slice(-4)}` : 'tb1p...'}
                    </div>
                  </div>
                  <div style={{ fontSize: '1.5rem', color: 'rgba(255, 255, 255, 0.3)', margin: '0 1rem' }}>→</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.35rem' }}>Send to</div>
                    <div style={{ fontSize: '0.9rem', color: '#fff', fontFamily: 'monospace' }}>
                      {utxoHolderAddress ? `${utxoHolderAddress.slice(0, 7)}...${utxoHolderAddress.slice(-4)}` : 'tb1p...pxak'}
                    </div>
                  </div>
                </div>

                {/* Send Amount */}
                <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.5rem' }}>Send Amount</div>
                  <div style={{ fontSize: '2rem', fontWeight: 600, color: '#fff' }}>
                    {createUtxoMode === 'default' ? '0.0003' : createUtxoAmount || '0.0003'} BTC
                  </div>
                </div>
              </div>

              {/* Network Fee */}
              <div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.75rem' }}>Network Fee</div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.95rem', color: '#fff' }}>0.00000425</span>
                  <span style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.5)' }}>BTC</span>
                </div>
              </div>

              {/* Network Fee Rate */}
              <div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.75rem' }}>Network Fee Rate</div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.95rem', color: '#fff' }}>
                    {createUtxoFeeOption === 'custom' ? createUtxoCustomFee : '2'}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'rgba(59, 130, 246, 0.7)' }}>sat/VB</span>
                </div>
              </div>

              {/* Sign & Pay Button */}
              <button
                className="btn-primary"
                onClick={async () => {
                  try {
                    console.log('Signing and broadcasting transaction to UTXO Holder address...');

                    const amountBtc = createUtxoMode === 'default' ? 0.0003 : parseFloat(createUtxoAmount || '0.0003');
                    const amountSats = BigInt(Math.floor(amountBtc * 100000000));

                    // Use all discovered Vanilla UTXOs for spending
                    const vanillaUtxos = bitcoinUtxos
                      .filter(u => u.account === 'vanilla' && !u.isLocked)
                      .map(u => ({
                        txid: u.txid,
                        vout: u.vout,
                        value: Number(u.value),
                        address: u.address,
                        derivationPath: u.derivationPath,
                        account: u.account as 'vanilla',
                        chain: u.chain as 0 | 1,
                        index: u.index as number
                      }));

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
                      utxoHolderAddress,
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

                    // Refresh UTXOs and return to list
                    await handleViewUtxos();
                  } catch (error: any) {
                    console.error('Failed to create UTXO:', error);
                    alert(`Failed to create UTXO: ${error.message}`);
                  }
                }}
                style={{
                  width: '100%',
                  marginTop: '1rem',
                  background: '#f7931a',
                  padding: '1rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  borderRadius: '12px',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Sign & Pay
              </button>
            </div>
          </div>
        )
      }
    </>
  )
}

export default App
