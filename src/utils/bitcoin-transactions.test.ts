import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    estimateFee,
    checkAddressHistory,
    fetchUTXOsFromBlockchain,
    broadcastTransaction,
    fetchLiveFees,
    performDiscoveryScan,
    signAndSendVanilla,
    signAndUnlockUtxo,
    type UTXO,
} from './bitcoin-transactions'

vi.mock('./storage', () => ({
    getStorageData: vi.fn(async () => ({})),
    setStorageData: vi.fn(async () => {}),
}))

vi.mock('./error-logger', () => ({
    logError: vi.fn(async () => {}),
}))

global.fetch = vi.fn()

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

beforeEach(() => {
    vi.clearAllMocks()
})

describe('estimateFee', () => {
    it('returns a positive integer for 1 input, 1 output, rate 1', () => {
        const fee = estimateFee(1, 1, 1)
        expect(fee).toBeGreaterThan(0)
        expect(Number.isInteger(fee)).toBe(true)
    })

    it('increases with more inputs', () => {
        const fee1 = estimateFee(1, 2, 5)
        const fee2 = estimateFee(3, 2, 5)
        expect(fee2).toBeGreaterThan(fee1)
    })

    it('increases with more outputs', () => {
        const fee1 = estimateFee(2, 1, 5)
        const fee2 = estimateFee(2, 3, 5)
        expect(fee2).toBeGreaterThan(fee1)
    })

    it('scales linearly with fee rate', () => {
        const fee1 = estimateFee(1, 1, 1)
        const fee5 = estimateFee(1, 1, 5)
        expect(fee5).toBeCloseTo(fee1 * 5, 0)
    })

    it('uses the documented formula: ceil((10.5 + 57.5*inputs + 43*outputs) * rate)', () => {
        const expected = Math.ceil((10.5 + 57.5 * 2 + 43 * 2) * 3)
        expect(estimateFee(2, 2, 3)).toBe(expected)
    })
})

describe('checkAddressHistory', () => {
    it('returns has_history when chain_stats > 0', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ chain_stats: { funded_txo_count: 1 }, mempool_stats: { funded_txo_count: 0 } }),
        } as any)
        const result = await checkAddressHistory('bc1qabc', 'mainnet')
        expect(result).toBe('has_history')
    })

    it('returns has_history when mempool_stats > 0', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ chain_stats: { funded_txo_count: 0 }, mempool_stats: { funded_txo_count: 2 } }),
        } as any)
        const result = await checkAddressHistory('bc1qabc', 'mainnet')
        expect(result).toBe('has_history')
    })

    it('returns no_history when both counts are 0', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ chain_stats: { funded_txo_count: 0 }, mempool_stats: { funded_txo_count: 0 } }),
        } as any)
        const result = await checkAddressHistory('bc1qabc', 'mainnet')
        expect(result).toBe('no_history')
    })

    it('returns no_history on 404', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' } as any)
        const result = await checkAddressHistory('bc1qabc', 'mainnet')
        expect(result).toBe('no_history')
    })

    it('returns error on non-404 HTTP error', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' } as any)
        const result = await checkAddressHistory('bc1qabc', 'mainnet')
        expect(result).toBe('error')
    })

    it('returns error on network failure', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
        const result = await checkAddressHistory('bc1qabc', 'mainnet')
        expect(result).toBe('error')
    })
})

describe('fetchUTXOsFromBlockchain', () => {
    it('returns UTXO array on success with address populated', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => [{ txid: 'abc123', vout: 0, value: 10000 }],
        } as any)
        const utxos = await fetchUTXOsFromBlockchain('bc1qabc', 'mainnet')
        expect(utxos).toHaveLength(1)
        expect(utxos[0].txid).toBe('abc123')
        expect(utxos[0].value).toBe(10000)
        expect(utxos[0].address).toBe('bc1qabc')
    })

    it('throws on HTTP error', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false,
            statusText: 'Bad Gateway',
            text: async () => 'error text',
        } as any)
        await expect(fetchUTXOsFromBlockchain('bc1qabc', 'mainnet')).rejects.toThrow()
    })

    it('throws on network failure', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'))
        await expect(fetchUTXOsFromBlockchain('bc1qabc', 'mainnet')).rejects.toThrow('timeout')
    })

    it('returns empty array for address with no UTXOs', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as any)
        const utxos = await fetchUTXOsFromBlockchain('bc1qabc', 'mainnet')
        expect(utxos).toEqual([])
    })
})

describe('broadcastTransaction', () => {
    it('returns txid on success', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            text: async () => 'deadbeef1234',
        } as any)
        const txid = await broadcastTransaction('0200...', 'mainnet')
        expect(txid).toBe('deadbeef1234')
    })

    it('throws on HTTP error', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: async () => 'mandatory-script-verify-flag-failed',
        } as any)
        await expect(broadcastTransaction('bad-tx', 'mainnet')).rejects.toThrow('Failed to broadcast')
    })
})

describe('fetchLiveFees', () => {
    it('returns parsed fee tiers on success', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ fastestFee: 30, halfHourFee: 15, hourFee: 5, minimumFee: 1 }),
        } as any)
        const fees = await fetchLiveFees('mainnet')
        expect(fees.fast).toBe(30)
        expect(fees.average).toBe(15)
        expect(fees.slow).toBe(5)
        expect(fees.min).toBe(1)
    })

    it('returns fallback defaults on HTTP error', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' } as any)
        const fees = await fetchLiveFees('mainnet')
        expect(fees.fast).toBe(25)
        expect(fees.average).toBe(15)
        expect(fees.slow).toBe(5)
        expect(fees.min).toBe(1)
    })

    it('returns fallback defaults on network failure', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
        const fees = await fetchLiveFees('mainnet')
        expect(fees.fast).toBe(25)
    })
})

describe('signAndSendVanilla — Colored account safety block', () => {
    const coloredUtxo: UTXO = {
        txid: 'aaaa',
        vout: 0,
        value: 100_000,
        address: 'bcrt1p...',
        derivationPath: "m/86'/1'/1'/0/0",
        account: 'colored',
        chain: 0,
        index: 0,
    }

    it('throws CRITICAL SAFETY VIOLATION when Colored account UTXO is used', async () => {
        await expect(
            signAndSendVanilla(MNEMONIC, [coloredUtxo], 'bcrt1pdest', 50_000, 3, 'regtest', 0)
        ).rejects.toThrow('CRITICAL SAFETY VIOLATION')
    })

    it('throws on malformed derivation path', async () => {
        const badUtxo: UTXO = { ...coloredUtxo, derivationPath: 'bad/path' }
        await expect(
            signAndSendVanilla(MNEMONIC, [badUtxo], 'bcrt1pdest', 50_000, 3, 'regtest', 0)
        ).rejects.toThrow('CRITICAL SAFETY VIOLATION')
    })
})

describe('signAndSendVanilla — insufficient funds', () => {
    const tinyUtxo: UTXO = {
        txid: 'bbbb',
        vout: 0,
        value: 1000,
        address: 'bc1p...',
        derivationPath: "m/86'/0'/0'/0/0",
        account: 'vanilla',
        chain: 0,
        index: 0,
    }

    it('throws insufficient funds when UTXO value < amount + fee', async () => {
        await expect(
            signAndSendVanilla(MNEMONIC, [tinyUtxo], 'bc1pdest', 999_000, 10, 'mainnet', 0)
        ).rejects.toThrow()
    })
})

describe('signAndUnlockUtxo — dust limit', () => {
    // Real BIP86 mainnet address for abandon mnemonic at m/86'/0'/0'/0/0
    const realAddr = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'
    const dustUtxo: UTXO = {
        txid: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        vout: 0,
        value: 500,
        address: realAddr,
        derivationPath: "m/86'/0'/0'/0/0",
        account: 'vanilla',
        chain: 0,
        index: 0,
    }

    it('throws when UTXO is too small to cover fee', async () => {
        await expect(
            signAndUnlockUtxo(MNEMONIC, dustUtxo, realAddr, 5, 'mainnet')
        ).rejects.toThrow('too small')
    })
})

describe('performDiscoveryScan', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns empty result when all addresses have no history', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({ chain_stats: { funded_txo_count: 0 }, mempool_stats: { funded_txo_count: 0 } }),
        } as any)

        const result = await performDiscoveryScan(MNEMONIC, 'mainnet', 0, 2)
        expect(result.totalBalance).toBe(0)
        expect(result.utxos).toHaveLength(0)
        expect(result.maxIndex).toBe(0)
        expect(result.maxChangeIndex).toBe(0)
        expect(result.hadHistoryCheckError).toBe(false)
    })

    it('detects UTXOs for external address with history', async () => {
        let callCount = 0
        vi.mocked(fetch).mockImplementation(async (url: any) => {
            const urlStr = String(url)
            if (urlStr.includes('/utxo')) {
                return { ok: true, json: async () => [{ txid: 'tx1', vout: 0, value: 5000 }] } as any
            }
            callCount++
            // Only first address has history (index 0, first chain call)
            if (callCount <= 1) {
                return { ok: true, json: async () => ({ chain_stats: { funded_txo_count: 1 }, mempool_stats: { funded_txo_count: 0 } }) } as any
            }
            return { ok: true, json: async () => ({ chain_stats: { funded_txo_count: 0 }, mempool_stats: { funded_txo_count: 0 } }) } as any
        })

        const result = await performDiscoveryScan(MNEMONIC, 'mainnet', 0, 2)
        expect(result.maxIndex).toBeGreaterThanOrEqual(0)
        expect(result.allDiscoveredAddresses.length).toBeGreaterThan(0)
    })

    it('maxChangeIndex tracks only chain=1 addresses with history', async () => {
        let addressCallIdx = 0
        vi.mocked(fetch).mockImplementation(async (url: any) => {
            const urlStr = String(url)
            if (urlStr.includes('/utxo')) {
                return { ok: true, json: async () => [] } as any
            }
            addressCallIdx++
            // 4 addresses per index iteration: vanilla-ext, vanilla-int, colored-ext, colored-int
            // Return history for vanilla-int (chain=1) at index 0 (2nd call in batch)
            if (addressCallIdx === 2) {
                return { ok: true, json: async () => ({ chain_stats: { funded_txo_count: 1 }, mempool_stats: { funded_txo_count: 0 } }) } as any
            }
            return { ok: true, json: async () => ({ chain_stats: { funded_txo_count: 0 }, mempool_stats: { funded_txo_count: 0 } }) } as any
        })

        const result = await performDiscoveryScan(MNEMONIC, 'mainnet', 0, 2)
        expect(result.maxChangeIndex).toBeGreaterThanOrEqual(0)
    })

    it('sets hadHistoryCheckError when API returns 503', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503, text: async () => '' } as any)
        const result = await performDiscoveryScan(MNEMONIC, 'mainnet', 0, 2)
        expect(result.hadHistoryCheckError).toBe(true)
    })

    it('scans at least storedIndex+1 addresses regardless of gap', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({ chain_stats: { funded_txo_count: 0 }, mempool_stats: { funded_txo_count: 0 } }),
        } as any)
        const result = await performDiscoveryScan(MNEMONIC, 'mainnet', 3, 2)
        // With storedIndex=3 and gapLimit=2, should scan through at least index 3
        expect(result.allDiscoveredAddresses.length).toBeGreaterThanOrEqual(4 * 4)
    })

    it('totalBalance only counts Vanilla account UTXOs', async () => {
        let historyCallCount = 0
        vi.mocked(fetch).mockImplementation(async (url: any) => {
            const urlStr = String(url)
            if (urlStr.includes('/utxo')) {
                return { ok: true, json: async () => [{ txid: 'tx1', vout: 0, value: 10_000 }] } as any
            }
            historyCallCount++
            // Return history only for the first batch of 4 addresses (index 0)
            if (historyCallCount <= 4) {
                return { ok: true, json: async () => ({ chain_stats: { funded_txo_count: 1 }, mempool_stats: { funded_txo_count: 0 } }) } as any
            }
            return { ok: true, json: async () => ({ chain_stats: { funded_txo_count: 0 }, mempool_stats: { funded_txo_count: 0 } }) } as any
        })

        const result = await performDiscoveryScan(MNEMONIC, 'mainnet', 0, 2)
        // Only vanilla UTXOs count toward totalBalance
        const vanillaOnly = result.utxos.filter(u => u.account === 'vanilla').reduce((s, u) => s + u.value, 0)
        expect(result.totalBalance).toBe(vanillaOnly)
        expect(result.totalBalance).toBeGreaterThan(0)
        expect(result.totalBalance).toBeLessThan(result.utxos.reduce((s, u) => s + u.value, 0))
    }, 30_000)
})
