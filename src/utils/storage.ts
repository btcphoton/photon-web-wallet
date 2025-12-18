// Storage utility that works in both Chrome extension and regular browser environments
// Uses chrome.storage when available (extension), falls back to localStorage (dev mode)

export interface Asset {
    id: string
    name: string
    amount: string
    unit: string
    color: string
}

interface StorageData {
    mnemonic?: string
    walletPassword?: string
    principalId?: string
    btcAddress?: string
    selectedNetwork?: string
    // Two-address system
    walletAddress?: string  // Main BTC wallet address
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

// Get data from storage
export const getStorageData = (keys: (keyof StorageData)[]): Promise<Partial<StorageData>> => {
    return new Promise((resolve) => {
        if (isChromeStorageAvailable()) {
            chrome.storage.local.get(keys, (result) => {
                resolve(result as Partial<StorageData>)
            })
        } else {
            // Fallback to localStorage
            const result: Partial<StorageData> = {}
            keys.forEach((key) => {
                const value = localStorage.getItem(`photon_${key}`)
                if (value) {
                    result[key] = value
                }
            })
            resolve(result)
        }
    })
}

// Set data in storage
export const setStorageData = (data: Partial<StorageData>): Promise<void> => {
    return new Promise((resolve) => {
        if (isChromeStorageAvailable()) {
            chrome.storage.local.set(data, () => {
                resolve()
            })
        } else {
            // Fallback to localStorage
            Object.entries(data).forEach(([key, value]) => {
                if (value !== undefined) {
                    localStorage.setItem(`photon_${key}`, value)
                }
            })
            resolve()
        }
    })
}

// Remove data from storage
export const removeStorageData = (keys: (keyof StorageData)[]): Promise<void> => {
    return new Promise((resolve) => {
        if (isChromeStorageAvailable()) {
            chrome.storage.local.remove(keys, () => {
                resolve()
            })
        } else {
            // Fallback to localStorage
            keys.forEach((key) => {
                localStorage.removeItem(`photon_${key}`)
            })
            resolve()
        }
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

// Testnet3 default assets
export const testnet3DefaultAssets: Asset[] = [
    { id: 'puliyal', name: 'PULIYAL20', amount: '21,000,000', unit: 'Puliyal', color: '#a855f7' },
    { id: 'bitcoin', name: 'BITCOIN', amount: '210,000,000', unit: 'BTC', color: '#f7931a' },
    { id: 'xiao', name: 'XIAOTANG68', amount: '0', unit: 'Xiaotan', color: '#22c55e' },
]
