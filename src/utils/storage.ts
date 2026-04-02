// Storage utility that works in both Chrome extension and regular browser environments
// Uses chrome.storage when available (extension), falls back to localStorage (dev mode)

export interface Asset {
    id: string
    name: string
    amount: string
    unit: string
    color: string
    rgbLockReason?: string
    rgbSpendabilityStatus?: string
    rgbOffchainOutbound?: string
    rgbOffchainInbound?: string
    rgbLockedUnconfirmed?: string
    rgbSpendingPower?: string
}

export interface StorageData {
    currentAccountId?: string
    knownAccountIds?: string
    mnemonic?: string
    walletPassword?: string
    principalId?: string
    btcAddress?: string
    selectedNetwork?: string
    backendProfileId?: string
    // Canister IDs
    mainnetCanisterId?: string
    testnetCanisterId?: string
    // Bitcoin balance from Blockstream API
    user_bitcoin_balance?: string
    // Lightning BTC (ckBTC) balance from ICRC-1
    user_lbtc_balance?: string
    // Two-address system
    walletAddress?: string  // Main BTC wallet address
    coloredAddress?: string // Colored Account (RGB Assets)
    addressIndex?: number   // The 'i' value
    lightningAddress?: string // Lightning/ckBTC address
    // Per-network wallet addresses
    btcAddress_mainnet?: string
    btcAddress_testnet3?: string
    btcAddress_testnet4?: string
    btcAddress_regtest?: string
    walletAddress_mainnet?: string
    walletAddress_testnet3?: string
    walletAddress_testnet4?: string
    walletAddress_regtest?: string
    // Per-network colored addresses
    coloredAddress_mainnet?: string
    coloredAddress_testnet3?: string
    coloredAddress_testnet4?: string
    coloredAddress_regtest?: string
    // Multi-address wallet structure (per network)
    // MainBalance - receives Bitcoin from outside (index 0)
    MainBalance_mainnet?: string
    MainBalance_testnet3?: string
    MainBalance_testnet4?: string
    MainBalance_regtest?: string
    // UTXOHolder - holds UTXOs for RGB assets (index 1)
    UTXOHolder_mainnet?: string
    UTXOHolder_testnet3?: string
    UTXOHolder_testnet4?: string
    UTXOHolder_regtest?: string
    // DustHolder - holds dust to protect RGB UTXOs (index 2)
    DustHolder_mainnet?: string
    DustHolder_testnet3?: string
    DustHolder_testnet4?: string
    DustHolder_regtest?: string
    // Per-network lightning addresses
    lightningAddress_mainnet?: string
    lightningAddress_testnet3?: string
    lightningAddress_testnet4?: string
    lightningAddress_regtest?: string
    // Per-network assets (stored as JSON string)
    assets_mainnet?: string
    assets_testnet3?: string
    assets_testnet4?: string
    assets_regtest?: string
    // Network settings
    electrumServer?: string
    rgbProxy?: string
    // RGB Asset Contract IDs (stored as JSON string per asset)
    // Format: { "asset-id": "contract-id", ... }
    rgbContracts_mainnet?: string
    rgbContracts_testnet3?: string
    rgbContracts_testnet4?: string
    rgbContracts_regtest?: string
    // Change address indices (BIP84 internal chain)
    changeIndex_mainnet?: number
    changeIndex_testnet3?: number
    changeIndex_testnet4?: number
    changeIndex_regtest?: number
    // All discovered addresses with history (for change detection)
    allDiscoveredAddresses_mainnet?: string[]
    allDiscoveredAddresses_testnet3?: string[]
    allDiscoveredAddresses_testnet4?: string[]
    allDiscoveredAddresses_regtest?: string[]
    // Bitcoin Address Generation Method
    addressGenerationMethod?: 'icp' | 'bitcoin'
    // Auto-Lock Timer setting (in minutes)
    AutoLockTimer?: number
    // Login timestamp for auto-login feature
    LoginTime?: number
    // Cached wallet balance
    walletBalance?: string
    // Error logs for Admin section
    error_logs?: any[]
    // Persisted RGB blinded seal secrets and UTXO bindings
    rgbSealSecrets?: string
}

const SENSITIVE_ACCOUNT_KEYS = new Set<keyof StorageData>(['mnemonic', 'walletPassword'])
const EXACT_ACCOUNT_SCOPED_KEYS = new Set<keyof StorageData>([
    'mnemonic',
    'walletPassword',
    'principalId',
    'btcAddress',
    'user_bitcoin_balance',
    'user_lbtc_balance',
    'walletAddress',
    'coloredAddress',
    'addressIndex',
    'lightningAddress',
    'addressGenerationMethod',
    'walletBalance',
    'rgbSealSecrets',
])
const ACCOUNT_SCOPED_PREFIXES = [
    'btcAddress_',
    'walletAddress_',
    'coloredAddress_',
    'MainBalance_',
    'UTXOHolder_',
    'DustHolder_',
    'lightningAddress_',
    'assets_',
    'rgbContracts_',
    'changeIndex_',
    'allDiscoveredAddresses_',
] as const
const ADDRESS_SCOPED_REGTEST_KEYS = new Set<keyof StorageData>([
    'assets_regtest',
    'rgbContracts_regtest',
])
const ACCOUNT_METADATA_KEYS: (keyof StorageData)[] = ['currentAccountId', 'knownAccountIds']
const LEGACY_ACCOUNT_MIGRATION_KEYS: (keyof StorageData)[] = [
    'mnemonic',
    'walletPassword',
    'principalId',
    'btcAddress',
    'user_bitcoin_balance',
    'user_lbtc_balance',
    'walletAddress',
    'coloredAddress',
    'addressIndex',
    'lightningAddress',
    'btcAddress_mainnet',
    'btcAddress_testnet3',
    'btcAddress_testnet4',
    'btcAddress_regtest',
    'walletAddress_mainnet',
    'walletAddress_testnet3',
    'walletAddress_testnet4',
    'walletAddress_regtest',
    'coloredAddress_mainnet',
    'coloredAddress_testnet3',
    'coloredAddress_testnet4',
    'coloredAddress_regtest',
    'MainBalance_mainnet',
    'MainBalance_testnet3',
    'MainBalance_testnet4',
    'MainBalance_regtest',
    'UTXOHolder_mainnet',
    'UTXOHolder_testnet3',
    'UTXOHolder_testnet4',
    'UTXOHolder_regtest',
    'DustHolder_mainnet',
    'DustHolder_testnet3',
    'DustHolder_testnet4',
    'DustHolder_regtest',
    'lightningAddress_mainnet',
    'lightningAddress_testnet3',
    'lightningAddress_testnet4',
    'lightningAddress_regtest',
    'assets_mainnet',
    'assets_testnet3',
    'assets_testnet4',
    'assets_regtest',
    'rgbContracts_mainnet',
    'rgbContracts_testnet3',
    'rgbContracts_testnet4',
    'rgbContracts_regtest',
    'changeIndex_mainnet',
    'changeIndex_testnet3',
    'changeIndex_testnet4',
    'changeIndex_regtest',
    'allDiscoveredAddresses_mainnet',
    'allDiscoveredAddresses_testnet3',
    'allDiscoveredAddresses_testnet4',
    'allDiscoveredAddresses_regtest',
    'addressGenerationMethod',
    'walletBalance',
    'rgbSealSecrets',
]

const isAccountScopedKey = (key: keyof StorageData): boolean => {
    if (EXACT_ACCOUNT_SCOPED_KEYS.has(key)) {
        return true
    }

    const keyString = String(key)
    return ACCOUNT_SCOPED_PREFIXES.some((prefix) => keyString.startsWith(prefix))
}

const isSensitiveAccountKey = (key: keyof StorageData): boolean => SENSITIVE_ACCOUNT_KEYS.has(key)

const getAccountStorageKey = (accountId: string, key: keyof StorageData): string => {
    return `account:${accountId}:${String(key)}`
}

const getAddressScopedAccountStorageKey = (accountId: string, key: keyof StorageData, address: string): string => {
    return `account:${accountId}:${String(key)}:${address}`
}

const normalizeScopedAddress = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : undefined
}

const readAccountRegtestAddress = async (
    accountId: string,
    inlineData?: Partial<StorageData>,
): Promise<string | undefined> => {
    const inlineAddress =
        normalizeScopedAddress(inlineData?.walletAddress_regtest) ||
        normalizeScopedAddress(inlineData?.btcAddress_regtest) ||
        normalizeScopedAddress(inlineData?.coloredAddress_regtest) ||
        normalizeScopedAddress(inlineData?.walletAddress) ||
        normalizeScopedAddress(inlineData?.btcAddress) ||
        normalizeScopedAddress(inlineData?.coloredAddress)

    if (inlineAddress) {
        return inlineAddress
    }

    const rawAddressKeys = [
        getAccountStorageKey(accountId, 'walletAddress_regtest'),
        getAccountStorageKey(accountId, 'btcAddress_regtest'),
        getAccountStorageKey(accountId, 'coloredAddress_regtest'),
        getAccountStorageKey(accountId, 'walletAddress'),
        getAccountStorageKey(accountId, 'btcAddress'),
        getAccountStorageKey(accountId, 'coloredAddress'),
    ]
    const rawAddressData = await readStorageRecords(rawAddressKeys)

    return (
        normalizeScopedAddress(rawAddressData[getAccountStorageKey(accountId, 'walletAddress_regtest')]) ||
        normalizeScopedAddress(rawAddressData[getAccountStorageKey(accountId, 'btcAddress_regtest')]) ||
        normalizeScopedAddress(rawAddressData[getAccountStorageKey(accountId, 'coloredAddress_regtest')]) ||
        normalizeScopedAddress(rawAddressData[getAccountStorageKey(accountId, 'walletAddress')]) ||
        normalizeScopedAddress(rawAddressData[getAccountStorageKey(accountId, 'btcAddress')]) ||
        normalizeScopedAddress(rawAddressData[getAccountStorageKey(accountId, 'coloredAddress')])
    )
}

const resolveAccountStorageReadKeys = async (accountId: string, key: keyof StorageData): Promise<string[]> => {
    const legacyKey = getAccountStorageKey(accountId, key)
    if (!ADDRESS_SCOPED_REGTEST_KEYS.has(key)) {
        return [legacyKey]
    }

    const regtestAddress = await readAccountRegtestAddress(accountId)
    if (!regtestAddress) {
        return [legacyKey]
    }

    return [
        getAddressScopedAccountStorageKey(accountId, key, regtestAddress),
    ]
}

const resolveAccountStorageWriteKey = async (
    accountId: string,
    key: keyof StorageData,
    inlineData?: Partial<StorageData>,
): Promise<{ storageKey: string; legacyKeysToRemove: string[] }> => {
    const legacyKey = getAccountStorageKey(accountId, key)
    if (!ADDRESS_SCOPED_REGTEST_KEYS.has(key)) {
        return {
            storageKey: legacyKey,
            legacyKeysToRemove: [],
        }
    }

    const regtestAddress = await readAccountRegtestAddress(accountId, inlineData)
    if (!regtestAddress) {
        return {
            storageKey: legacyKey,
            legacyKeysToRemove: [],
        }
    }

    return {
        storageKey: getAddressScopedAccountStorageKey(accountId, key, regtestAddress),
        legacyKeysToRemove: [legacyKey],
    }
}

// Check if chrome.storage is actually available and functional
const isChromeStorageAvailable = (): boolean => {
    try {
        return !!(
            typeof chrome !== 'undefined' &&
            chrome.storage &&
            chrome.storage.local &&
            typeof chrome.storage.local.get === 'function'
        )
    } catch {
        return false
    }
}

const getLocalStorageItem = (key: string): string | null => {
    return localStorage.getItem(`photon_${key}`)
}

const setLocalStorageItem = (key: string, value: unknown): void => {
    if (value !== undefined) {
        localStorage.setItem(`photon_${key}`, String(value))
    }
}

const removeLocalStorageItems = (keys: string[]): void => {
    keys.forEach((key) => {
        localStorage.removeItem(`photon_${key}`)
    })
}

const getChromeLocal = (keys: string[]): Promise<Record<string, unknown>> => {
    return new Promise((resolve) => {
        if (keys.length === 0) {
            resolve({})
            return
        }
        chrome.storage.local.get(keys, (result) => resolve(result as Record<string, unknown>))
    })
}

const getChromeSession = (keys: string[]): Promise<Record<string, unknown>> => {
    return new Promise((resolve) => {
        if (keys.length === 0 || !chrome.storage.session) {
            resolve({})
            return
        }
        chrome.storage.session.get(keys, (result) => resolve(result as Record<string, unknown>))
    })
}

const setChromeLocal = (data: Record<string, unknown>): Promise<void> => {
    return new Promise((resolve) => {
        if (Object.keys(data).length === 0) {
            resolve()
            return
        }
        chrome.storage.local.set(data, resolve)
    })
}

const setChromeSession = (data: Record<string, unknown>): Promise<void> => {
    return new Promise((resolve) => {
        if (Object.keys(data).length === 0 || !chrome.storage.session) {
            resolve()
            return
        }
        chrome.storage.session.set(data, resolve)
    })
}

const removeChromeLocal = (keys: string[]): Promise<void> => {
    return new Promise((resolve) => {
        if (keys.length === 0) {
            resolve()
            return
        }
        chrome.storage.local.remove(keys, resolve)
    })
}

const removeChromeSession = (keys: string[]): Promise<void> => {
    return new Promise((resolve) => {
        if (keys.length === 0 || !chrome.storage.session) {
            resolve()
            return
        }
        chrome.storage.session.remove(keys, resolve)
    })
}

const readStorageRecords = async (keys: string[], sensitiveKeys: string[] = []): Promise<Record<string, unknown>> => {
    if (isChromeStorageAvailable()) {
        const [localResult, sessionResult] = await Promise.all([
            getChromeLocal(keys),
            getChromeSession(sensitiveKeys),
        ])
        return { ...localResult, ...sessionResult }
    }

    const result: Record<string, unknown> = {}
    keys.forEach((key) => {
        const value = getLocalStorageItem(key)
        if (value !== null) {
            result[key] = value
        }
    })
    return result
}

const writeStorageRecords = async ({
    localData,
    sessionData,
    removeLocalKeys = [],
}: {
    localData?: Record<string, unknown>
    sessionData?: Record<string, unknown>
    removeLocalKeys?: string[]
}): Promise<void> => {
    const localPayload = localData || {}
    const sessionPayload = sessionData || {}

    if (isChromeStorageAvailable()) {
        await Promise.all([
            setChromeLocal(localPayload),
            setChromeSession(sessionPayload),
            removeChromeLocal(removeLocalKeys),
        ])
        return
    }

    Object.entries(localPayload).forEach(([key, value]) => setLocalStorageItem(key, value))
    Object.entries(sessionPayload).forEach(([key, value]) => setLocalStorageItem(key, value))
    removeLocalStorageItems(removeLocalKeys)
}

const removeStorageRecords = async ({
    localKeys,
    sessionKeys,
}: {
    localKeys?: string[]
    sessionKeys?: string[]
}): Promise<void> => {
    const nextLocalKeys = localKeys || []
    const nextSessionKeys = sessionKeys || []

    if (isChromeStorageAvailable()) {
        await Promise.all([
            removeChromeLocal(nextLocalKeys),
            removeChromeSession(nextSessionKeys),
        ])
        return
    }

    removeLocalStorageItems([...nextLocalKeys, ...nextSessionKeys])
}

const parseKnownAccountIds = (value: unknown): string[] => {
    if (typeof value !== 'string' || !value.trim()) {
        return []
    }

    try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
    } catch {
        return []
    }
}

const readCurrentAccountId = async (): Promise<string | undefined> => {
    const metadata = await readStorageRecords(ACCOUNT_METADATA_KEYS.map(String))
    const currentAccountId = metadata.currentAccountId
    return typeof currentAccountId === 'string' && currentAccountId.trim().length > 0
        ? currentAccountId.trim()
        : undefined
}

const ensureAccountScopeReady = async (): Promise<string | undefined> => {
    const currentAccountId = await readCurrentAccountId()
    if (currentAccountId) {
        return currentAccountId
    }

    const rawLegacyKeys = LEGACY_ACCOUNT_MIGRATION_KEYS.map(String)
    const sensitiveLegacyKeys = LEGACY_ACCOUNT_MIGRATION_KEYS.filter(isSensitiveAccountKey).map(String)
    const legacyData = await readStorageRecords(rawLegacyKeys, sensitiveLegacyKeys)
    const legacyPrincipalId = legacyData.principalId

    if (typeof legacyPrincipalId !== 'string' || !legacyPrincipalId.trim()) {
        return undefined
    }

    const migratedAccountId = legacyPrincipalId.trim()
    const localData: Record<string, unknown> = {
        currentAccountId: migratedAccountId,
        knownAccountIds: JSON.stringify([migratedAccountId]),
    }
    const sessionData: Record<string, unknown> = {}

    LEGACY_ACCOUNT_MIGRATION_KEYS.forEach((key) => {
        const value = legacyData[key]
        if (value === undefined) {
            return
        }

        const scopedKey = getAccountStorageKey(migratedAccountId, key)
        if (isSensitiveAccountKey(key)) {
            sessionData[scopedKey] = value
        } else {
            localData[scopedKey] = value
        }
    })

    await writeStorageRecords({
        localData,
        sessionData,
    })

    return migratedAccountId
}

// Get data from storage
export const getStorageData = (keys: (keyof StorageData)[]): Promise<Partial<StorageData>> => {
    return new Promise(async (resolve) => {
        const accountId = await ensureAccountScopeReady()
        const directKeys = keys.filter((key) => !isAccountScopedKey(key))
        const scopedKeys = accountId ? keys.filter((key) => isAccountScopedKey(key)) : []
        const sensitiveDirectKeys = directKeys.filter(isSensitiveAccountKey)
        const scopedReadKeyMap = new Map<keyof StorageData, string[]>()
        for (const key of scopedKeys) {
            scopedReadKeyMap.set(key, await resolveAccountStorageReadKeys(accountId as string, key))
        }
        const scopedStorageKeys = Array.from(scopedReadKeyMap.values()).flat()
        const sensitiveScopedStorageKeys = scopedKeys
            .filter(isSensitiveAccountKey)
            .map((key) => getAccountStorageKey(accountId as string, key))

        const rawResult = await readStorageRecords(
            [...directKeys.map(String), ...scopedStorageKeys],
            [...sensitiveDirectKeys.map(String), ...sensitiveScopedStorageKeys]
        )

        const result: Partial<StorageData> = {}

        directKeys.forEach((key) => {
            const value = rawResult[String(key)]
            if (value !== undefined) {
                result[key] = value as never
            }
        })

        if (accountId) {
            scopedKeys.forEach((key) => {
                const candidateKeys = scopedReadKeyMap.get(key) || [getAccountStorageKey(accountId, key)]
                for (const storageKey of candidateKeys) {
                    const value = rawResult[storageKey]
                    if (value !== undefined) {
                        result[key] = value as never
                        break
                    }
                }
            })
        }

        resolve(result)
    })
}

// Set data in storage
export const setStorageData = (data: Partial<StorageData>): Promise<void> => {
    return new Promise(async (resolve) => {
        const existingAccountId = await ensureAccountScopeReady()
        const targetAccountId =
            (typeof data.principalId === 'string' && data.principalId.trim().length > 0
                ? data.principalId.trim()
                : existingAccountId)

        const localData: Record<string, unknown> = {}
        const sessionData: Record<string, unknown> = {}
        const removeLocalKeys: string[] = []

        for (const [rawKey, value] of Object.entries(data)) {
            const key = rawKey as keyof StorageData
            if (value === undefined) {
                continue
            }

            let storageKey = String(key)
            let legacyKeysToRemove: string[] = []

            if (targetAccountId && isAccountScopedKey(key)) {
                const resolvedKey = await resolveAccountStorageWriteKey(targetAccountId, key, data)
                storageKey = resolvedKey.storageKey
                legacyKeysToRemove = resolvedKey.legacyKeysToRemove
            }

            if (targetAccountId && isAccountScopedKey(key) && isSensitiveAccountKey(key)) {
                sessionData[storageKey] = value
                removeLocalKeys.push(storageKey)
                continue
            }

            if (isSensitiveAccountKey(key)) {
                sessionData[storageKey] = value
                removeLocalKeys.push(storageKey)
                continue
            }

            localData[storageKey] = value
            legacyKeysToRemove.forEach((legacyKey) => removeLocalKeys.push(legacyKey))
        }

        if (targetAccountId) {
            const metadata = await readStorageRecords(ACCOUNT_METADATA_KEYS.map(String))
            const knownAccountIds = parseKnownAccountIds(metadata.knownAccountIds)
            if (!knownAccountIds.includes(targetAccountId)) {
                knownAccountIds.push(targetAccountId)
            }
            localData.currentAccountId = targetAccountId
            localData.knownAccountIds = JSON.stringify(knownAccountIds)
        }

        await writeStorageRecords({
            localData,
            sessionData,
            removeLocalKeys,
        })
        resolve()
    })
}

// Remove data from storage
export const removeStorageData = (keys: (keyof StorageData)[]): Promise<void> => {
    return new Promise(async (resolve) => {
        const accountId = await ensureAccountScopeReady()
        const includesAccountReset = keys.includes('principalId') && Boolean(accountId)
        const directKeys = keys.filter((key) => !isAccountScopedKey(key))
        const scopedKeys = includesAccountReset
            ? LEGACY_ACCOUNT_MIGRATION_KEYS
            : accountId
                ? keys.filter((key) => isAccountScopedKey(key))
                : []

        const localKeys = directKeys.map(String)
        const sessionKeys = directKeys.filter(isSensitiveAccountKey).map(String)

        if (accountId) {
            scopedKeys.forEach((key) => {
                const scopedStorageKey = getAccountStorageKey(accountId, key)
                if (isSensitiveAccountKey(key)) {
                    sessionKeys.push(scopedStorageKey)
                } else {
                    localKeys.push(scopedStorageKey)
                }
            })
        }

        if (includesAccountReset && accountId) {
            const metadata = await readStorageRecords(ACCOUNT_METADATA_KEYS.map(String))
            const remainingAccountIds = parseKnownAccountIds(metadata.knownAccountIds).filter((id) => id !== accountId)
            localKeys.push('currentAccountId', 'knownAccountIds')
            await removeStorageRecords({ localKeys, sessionKeys })
            await writeStorageRecords({
                localData: {
                    currentAccountId: remainingAccountIds[0] || '',
                    knownAccountIds: JSON.stringify(remainingAccountIds),
                },
            })
            if (remainingAccountIds.length === 0) {
                await removeStorageRecords({
                    localKeys: ['currentAccountId', 'knownAccountIds'],
                })
            }
            resolve()
            return
        }

        await removeStorageRecords({ localKeys, sessionKeys })
        resolve()
    })
}

// Helper to get network-specific address key
export const getNetworkAddressKey = (network: string): keyof StorageData => {
    return `btcAddress_${network}` as keyof StorageData
}

// Helper to get network-specific assets key
export const getNetworkAssetsKey = (network: string): keyof StorageData => {
    return `assets_${network}` as keyof StorageData
}

// Helper to get network-specific RGB contract map key
export const getNetworkContractsKey = (network: string): keyof StorageData => {
    return `rgbContracts_${network}` as keyof StorageData
}

// Testnet default assets (testnet3, testnet4, regtest)
export const testnet3DefaultAssets: Asset[] = [
    { id: 'lightning-btc', name: 'Lightning BTC', amount: '0', unit: 'ckBTC', color: '#fbbf24' },
]

// Mainnet default assets
export const mainnetDefaultAssets: Asset[] = [
    { id: 'lightning-btc', name: 'Lightning BTC', amount: '0', unit: 'ckBTC', color: '#fbbf24' },
]

// Default canister IDs (fallback values)
export const DEFAULT_MAINNET_CANISTER = 'oazba-2qaaa-aaaau-ac66a-cai'
export const DEFAULT_TESTNET_CANISTER = 'ja2nc-uiaaa-aaaaf-qc4la-cai'

// Get MainNet canister ID from storage (with fallback to default)
export const getMainnetCanisterId = async (): Promise<string> => {
    const result = await getStorageData(['mainnetCanisterId'])
    return result.mainnetCanisterId || DEFAULT_MAINNET_CANISTER
}

// Get TestNet canister ID from storage (with fallback to default)
export const getTestnetCanisterId = async (): Promise<string> => {
    const result = await getStorageData(['testnetCanisterId'])
    return result.testnetCanisterId || DEFAULT_TESTNET_CANISTER
}
