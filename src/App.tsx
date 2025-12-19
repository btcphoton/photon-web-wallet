import { useState, useEffect } from 'react'
import './App.css'
import { generateMnemonic, deriveIdentity, validateMnemonic } from './utils/crypto'
import { getBtcAddress, getWalletAddress, getWalletBalance, updateBalance, mapNetworkToCanister } from './utils/icp'
import { getStorageData, setStorageData, removeStorageData, getNetworkAddressKey, getNetworkAssetsKey, testnet3DefaultAssets } from './utils/storage'
import type { Asset } from './utils/storage'
import { QRCodeSVG } from 'qrcode.react'

type View = 'welcome' | 'unlock' | 'lock' | 'forgot' | 'create' | 'verify' | 'password' | 'restore' | 'dashboard' | 'receive' | 'receive-btc' | 'receive-rgb' | 'convert-lightning' | 'add-assets'
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
  { id: 'testnet4', name: 'Bitcoin testnet 4', color: '#9ca3af', enabled: false },
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
  const [mnemonic, setMnemonic] = useState<string>('')
  const [principalId, setPrincipalId] = useState<string>('')
  const [restoreInput, setRestoreInput] = useState<string>('')
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

  // Network-specific assets
  const [assets, setAssets] = useState<Asset[]>([])

  // Add asset state
  const [tokenInput, setTokenInput] = useState<string>('')

  // Balance states for two-address system
  const [btcBalance, setBtcBalance] = useState<string>('0.00000000') // Wallet balance (main)
  // const [lightningBalance, setLightningBalance] = useState<string>('0.00000000') // Lightning balance - for future asset display
  const [loadingBalance, setLoadingBalance] = useState<boolean>(false)
  // const [loadingLightningBalance, setLoadingLightningBalance] = useState<boolean>(false) // For future Lightning asset
  const [balanceError, setBalanceError] = useState<string>('')

  // Truncate address for display
  const truncateAddress = (addr: string) => {
    if (!addr || addr.length < 12) return addr
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`
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

      // Fetch BOTH addresses in parallel
      const [walletAddr, lightningAddr] = await Promise.all([
        getWalletAddress(mnemonicPhrase, canisterNetwork),
        getBtcAddress(mnemonicPhrase, canisterNetwork)
      ])

      // Update both addresses in state
      setWalletAddress(walletAddr)
      setLightningAddress(lightningAddr)
      setBtcAddress(walletAddr) // For backward compatibility, use wallet address

      // Save both to network-specific storage
      const addressKey = getNetworkAddressKey(network)
      await setStorageData({
        [addressKey]: walletAddr, // Network-specific wallet address
        btcAddress: walletAddr, // Backward compatibility
        walletAddress: walletAddr, // Main wallet address
        lightningAddress: lightningAddr, // Lightning/ckBTC address
        [`walletAddress_${network}`]: walletAddr,
        [`lightningAddress_${network}`]: lightningAddr
      })

      console.log(`Wallet address for ${network}:`, walletAddr)
      console.log(`Lightning address for ${network}:`, lightningAddr)

      return walletAddr
    } catch (e) {
      console.error('Failed to fetch addresses:', e)
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
          'walletAddress', 'lightningAddress', // Load both addresses
          'btcAddress_mainnet', 'btcAddress_testnet3', 'btcAddress_testnet4', 'btcAddress_regtest',
          'walletAddress_mainnet', 'walletAddress_testnet3', 'walletAddress_testnet4', 'walletAddress_regtest',
          'lightningAddress_mainnet', 'lightningAddress_testnet3', 'lightningAddress_testnet4', 'lightningAddress_regtest'
        ])
        console.log('Storage check result:', result)

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
          if (result.btcAddress) {
            setBtcAddress(result.btcAddress)
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
        const networkAddress = result[networkAddressKey] || result.btcAddress || ''
        setBtcAddress(networkAddress as string)

        setError('')
        setUnlockPassword('')
        setView('dashboard')
        console.log('Unlock successful, going to dashboard')

        // Fetch balance after unlock
        if (result.mnemonic && networkAddress) {
          fetchBalance(result.mnemonic, networkAddress as string, network)
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
        setMnemonic(result.mnemonic || mnemonic)
        setPrincipalId(result.principalId || principalId)

        // Restore network and address
        const network = (result.selectedNetwork as Network) || selectedNetwork
        setSelectedNetwork(network)
        const networkAddressKey = getNetworkAddressKey(network)
        const networkAddress = result[networkAddressKey] || result.btcAddress || btcAddress
        setBtcAddress(networkAddress as string)

        setError('')
        setUnlockPassword('')
        setView('dashboard')
        console.log('Unlock from lock successful')

        // Fetch balance after unlock
        const currentMnemonic = result.mnemonic || mnemonic
        if (currentMnemonic && networkAddress) {
          fetchBalance(currentMnemonic, networkAddress as string, network)
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

  // Handle network switch
  const handleNetworkSwitch = async (network: Network) => {
    if (network === selectedNetwork) {
      setShowNetworkModal(false)
      return
    }

    setSelectedNetwork(network)
    setShowNetworkModal(false)

    // Save selected network to storage
    await setStorageData({ selectedNetwork: network })
    console.log('Network switched to:', network)

    // Check if we have a cached address for this network
    const networkAddressKey = getNetworkAddressKey(network)
    const result = await getStorageData([networkAddressKey])
    const cachedAddress = result[networkAddressKey]

    let currentAddress = ''

    if (cachedAddress) {
      // Use cached address
      currentAddress = cachedAddress as string
      setBtcAddress(currentAddress)
      await setStorageData({ btcAddress: currentAddress })
      console.log('Using cached address for', network, ':', currentAddress)
    } else if (mnemonic) {
      // Fetch new address from canister
      console.log('Fetching new address for network:', network)
      const newAddress = await fetchAndSaveBtcAddress(mnemonic, network)
      if (newAddress) currentAddress = newAddress
    }

    // Fetch balance for the new network
    if (mnemonic && currentAddress) {
      fetchBalance(mnemonic, currentAddress, network)
    }

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
      } catch (e) {
        console.error('Error parsing cached assets:', e)
        setAssets([])
      }
    } else if (network === 'testnet3') {
      // Initialize testnet3 with default assets
      setAssets(testnet3DefaultAssets)
      await setStorageData({ [assetsKey]: JSON.stringify(testnet3DefaultAssets) })
      console.log('Initialized testnet3 with default assets')
    } else {
      // Clear assets for other networks
      setAssets([])
      console.log('Cleared assets for', network)
    }
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

  const fetchBalance = async (currentMnemonic: string, currentAddress: string, networkId: Network) => {
    if (!currentMnemonic || !currentAddress) return

    setLoadingBalance(true)
    setBalanceError('') // Clear previous error
    try {
      // Try to get balance from wallet canister first
      try {
        const canisterNetwork = mapNetworkToCanister(networkId)
        const balanceNat64 = await getWalletBalance(currentMnemonic, canisterNetwork)
        const balanceBtc = (Number(balanceNat64) / 100000000).toFixed(8)
        setBtcBalance(balanceBtc)
        setBalanceError('')
        console.log('Balance from wallet canister:', balanceBtc)
        return
      } catch (canisterError) {
        console.log('Wallet canister balance fetch failed, falling back to Blockstream API:', canisterError)
      }

      // Fallback to Blockstream API
      const apiUrl = networkId === 'mainnet'
        ? `https://blockstream.info/api/address/${currentAddress.trim()}`
        : `https://blockstream.info/testnet/api/address/${currentAddress.trim()}`

      const response = await fetch(apiUrl)

      if (!response.ok) {
        if (response.status === 400) {
          throw new Error('Invalid Bitcoin address format')
        } else if (response.status === 404) {
          throw new Error('Address not found')
        } else {
          throw new Error('Failed to fetch balance')
        }
      }

      const data = await response.json()
      // Blockstream API returns chain_stats.funded_txo_sum - chain_stats.spent_txo_sum
      const balanceFromAPI = (data.chain_stats?.funded_txo_sum || 0) - (data.chain_stats?.spent_txo_sum || 0)
      const balanceBtc = (balanceFromAPI / 100000000).toFixed(8)
      setBtcBalance(balanceBtc)
      setBalanceError('')
      console.log('Balance from Blockstream API:', balanceBtc)
    } catch (e) {
      console.error('Error fetching balance:', e)
      // Show simple user-friendly error and prompt to refresh
      setBalanceError('Error fetching balance. Click refresh to try again.')
      setBtcBalance('0.00000000')
    } finally {
      setLoadingBalance(false)
    }
  }

  const handleRefreshBalance = async () => {
    if (!btcAddress || !mnemonic) return

    setLoadingBalance(true)
    try {
      // Determine API URL based on network
      const apiUrl = selectedNetwork === 'mainnet'
        ? `https://blockstream.info/api/address/${btcAddress.trim()}`
        : `https://blockstream.info/testnet/api/address/${btcAddress.trim()}`

      const response = await fetch(apiUrl)

      if (!response.ok) {
        if (response.status === 400) {
          throw new Error('Invalid Bitcoin address format')
        } else if (response.status === 404) {
          throw new Error('Address not found')
        } else {
          throw new Error('Failed to fetch balance')
        }
      }

      const data = await response.json()
      // Blockstream API returns chain_stats.funded_txo_sum - chain_stats.spent_txo_sum
      const balanceFromAPI = (data.chain_stats?.funded_txo_sum || 0) - (data.chain_stats?.spent_txo_sum || 0)
      const balanceBtc = (balanceFromAPI / 100000000).toFixed(8)
      setBtcBalance(balanceBtc)
      console.log('Balance refreshed from Blockstream API:', balanceBtc)
    } catch (e) {
      console.error('Error refreshing balance:', e)
    } finally {
      setLoadingBalance(false)
    }
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
        principalId: id
      })
      console.log('Wallet data saved to storage: mnemonic, password, principalId')

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
        fetchBalance(mnemonic, address, selectedNetwork)
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

  // Show loading while checking storage
  if (isLoading) {
    return (
      <div className="welcome-container">
        <div className="welcome-logo">⚡</div>
        <p className="welcome-subtitle">Loading...</p>
      </div>
    )
  }

  return (
    <>
      {view === 'welcome' && (
        <div className="welcome-container">
          <div className="welcome-logo">⚡</div>
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
          <div className="welcome-logo">⚡</div>
          <h2 className="brand-title">PHOTON</h2>
          <p className="welcome-subtitle">A one-stop suite for RGB assets : Issue, Send & Receive RGB Assets like never before !</p>

          <div className="input-group unlock-input-group">
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
          >
            Unlock Wallet
          </button>

          <button className="forgot-link" onClick={handleForgotPassword}>
            Forgot the Password?
          </button>
        </div>
      )}

      {view === 'lock' && (
        <div className="card-container unlock-container">
          <div className="version-label">V1.0.0</div>
          <div className="welcome-logo">⚡</div>
          <h2 className="brand-title">PHOTON</h2>
          <p className="welcome-subtitle">A one-stop suite for RGB assets : Issue, Send & Receive RGB Assets like never before !</p>

          <div className="input-group unlock-input-group">
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
          >
            Unlock Wallet
          </button>

          <button className="forgot-link" onClick={handleForgotPassword}>
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
          >
            Continue
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
        <div className="wallet-container" onDoubleClick={() => balanceError && setBalanceError('')}>
          {/* Header */}
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
              <div className="menu-item">
                <span className="menu-icon">⚙</span>
                <span>Setting</span>
                <span className="menu-arrow">›</span>
              </div>
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

          {/* Balance Section */}
          <div className="balance-section">
            <div className="network-label">{networks.find(n => n.id === selectedNetwork)?.name.replace('Bitcoin ', '') || 'Mainnet'}</div>
            <div className="balance-row">
              {loadingBalance ? (
                <div className="skeleton-loader"></div>
              ) : (
                <span className="balance-amount">{btcBalance}</span>
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
                title="Expand - Fetch from canister"
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
            <button className="action-btn">
              <div className="action-icon send">↗</div>
              <span className="action-label">Send</span>
            </button>
            <button className="action-btn">
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
            <div className="activities-empty">
              <p>No activities yet</p>
            </div>
          )}
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

            <div className="btc-address-box">
              <span className="btc-address-text">{lightningAddress || 'No address available'}</span>
            </div>
          </div>

          <button className="btn-primary copy-btc-btn" onClick={() => {
            navigator.clipboard.writeText(lightningAddress)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}>
            {copied ? '✓ Copied!' : '⧉ Copy bitcoin address'}
          </button>
        </div>
      )}

      {/* Receive RGB Assets Screen */}
      {view === 'receive-rgb' && (
        <div className="receive-container receive-rgb-container">
          <div className="receive-header">
            <button className="back-arrow" onClick={() => setView('receive')}>←</button>
            <h2 className="receive-title">Receive RGB assets</h2>
          </div>

          <div className="receive-rgb-content">
            <div className="rgb-field">
              <div className="rgb-label-row">
                <label className="rgb-label">Assets</label>
                <span className="rgb-info">ⓘ</span>
              </div>
              <div className="rgb-select-wrapper">
                <select
                  className="rgb-select"
                  value={rgbAsset}
                  onChange={(e) => setRgbAsset(e.target.value)}
                >
                  <option value="">Select assets</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                  ))}
                </select>
                <span className="rgb-select-arrow">▾</span>
              </div>
            </div>

            <div className="rgb-field">
              <label className="rgb-label">Amount</label>
              <input
                type="text"
                className="rgb-input"
                placeholder="Amount"
                value={rgbAmount}
                onChange={(e) => setRgbAmount(e.target.value)}
              />
            </div>
          </div>

          <button
            className="btn-secondary create-invoice-btn"
            disabled={!rgbAsset || !rgbAmount}
          >
            Create Invoice
          </button>
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

      {/* Click outside to close menu */}
      {showMenu && <div className="menu-overlay" onClick={() => setShowMenu(false)}></div>}

      {/* Notice Modal */}
      {showNoticeModal && (
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
      )}

      {/* Network Switch Modal */}
      {showNetworkModal && (
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
      )}
    </>
  )
}

export default App
