import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findOrPrepareRgbTaprootUtxo } from './utxoManager'
import type { UTXO } from './bitcoin-transactions'

// Real BIP86 regtest vanilla address for abandon mnemonic at m/86'/1'/0'/0/0
const REAL_COLORED_ADDR = 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg'

vi.mock('./storage', () => ({
    getStorageData: vi.fn(async () => ({
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        selectedNetwork: 'regtest',
        addressIndex: 0,
        coloredAddress_regtest: 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg',
    })),
    setStorageData: vi.fn(async () => {}),
}))

vi.mock('./bitcoin-transactions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./bitcoin-transactions')>()
    return {
        ...actual,
        performDiscoveryScan: vi.fn(),
        broadcastTransaction: vi.fn(async () => 'mockTxid1234'),
        estimateFee: actual.estimateFee,
    }
})

vi.mock('./error-logger', () => ({
    logError: vi.fn(async () => {}),
}))

import * as btcTxns from './bitcoin-transactions'

const makeUtxo = (overrides: Partial<UTXO> = {}): UTXO => ({
    txid: 'aaaa',
    vout: 0,
    value: 3000,
    address: 'bcrt1pcolored',
    derivationPath: "m/86'/1'/1'/0/0",
    account: 'colored',
    chain: 0,
    index: 0,
    ...overrides,
})

beforeEach(() => {
    vi.clearAllMocks()
})

describe('findOrPrepareRgbTaprootUtxo — existing seal path', () => {
    it('returns an existing UTXO in the 2000-5000 sat range', async () => {
        const sealUtxo = makeUtxo({ value: 3000 })
        vi.mocked(btcTxns.performDiscoveryScan).mockResolvedValueOnce({
            utxos: [sealUtxo],
            totalBalance: 3000, maxIndex: 0, maxChangeIndex: 0,
            fundedAddresses: [], allDiscoveredAddresses: [],
            hadUtxoFetchError: false, hadHistoryCheckError: false,
        })

        const result = await findOrPrepareRgbTaprootUtxo()
        expect(result.source).toBe('existing')
        expect(result.txid).toBe('aaaa')
        expect(result.vout).toBe(0)
    })

    it('prefers colored account UTXOs over vanilla when both are in range', async () => {
        const vanilla = makeUtxo({ txid: 'vanilla', account: 'vanilla', derivationPath: "m/86'/1'/0'/0/0", value: 3000 })
        const colored = makeUtxo({ txid: 'colored', account: 'colored', value: 3000 })
        vi.mocked(btcTxns.performDiscoveryScan).mockResolvedValueOnce({
            utxos: [vanilla, colored],
            totalBalance: 6000, maxIndex: 0, maxChangeIndex: 0,
            fundedAddresses: [], allDiscoveredAddresses: [],
            hadUtxoFetchError: false, hadHistoryCheckError: false,
        })

        const result = await findOrPrepareRgbTaprootUtxo()
        expect(result.txid).toBe('colored')
    })

    it('among multiple in-range UTXOs picks the one closest to 3000 sats', async () => {
        const far = makeUtxo({ txid: 'far', value: 2001 })
        const near = makeUtxo({ txid: 'near', value: 2999 })
        vi.mocked(btcTxns.performDiscoveryScan).mockResolvedValueOnce({
            utxos: [far, near],
            totalBalance: 5000, maxIndex: 0, maxChangeIndex: 0,
            fundedAddresses: [], allDiscoveredAddresses: [],
            hadUtxoFetchError: false, hadHistoryCheckError: false,
        })

        const result = await findOrPrepareRgbTaprootUtxo()
        expect(result.txid).toBe('near')
    })
})

describe('findOrPrepareRgbTaprootUtxo — split path', () => {
    it('splits a large UTXO when no in-range seal exists', async () => {
        // Use real BIP86 regtest vanilla address (m/86'/1'/0'/0/0) for the abandon mnemonic
        // so bitcoinjs-lib can parse it and build the PSBT input
        const realAddress = 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg'
        const realTxid = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        const largeUtxo = makeUtxo({
            txid: realTxid,
            value: 100_000,
            account: 'vanilla',
            address: realAddress,
            derivationPath: "m/86'/1'/0'/0/0",
        })
        vi.mocked(btcTxns.performDiscoveryScan).mockResolvedValueOnce({
            utxos: [largeUtxo],
            totalBalance: 100_000, maxIndex: 0, maxChangeIndex: 0,
            fundedAddresses: [], allDiscoveredAddresses: [],
            hadUtxoFetchError: false, hadHistoryCheckError: false,
        })
        vi.mocked(btcTxns.broadcastTransaction).mockResolvedValueOnce('splitTxid99')

        const result = await findOrPrepareRgbTaprootUtxo()
        expect(result.source).toBe('split')
        expect(result.txid).toBe('splitTxid99')
        expect(result.vout).toBe(0)
        expect(result.value).toBe(3000)
    })
})

describe('findOrPrepareRgbTaprootUtxo — error cases', () => {
    it('throws when no UTXOs exist at all', async () => {
        vi.mocked(btcTxns.performDiscoveryScan).mockResolvedValueOnce({
            utxos: [], totalBalance: 0, maxIndex: 0, maxChangeIndex: 0,
            fundedAddresses: [], allDiscoveredAddresses: [],
            hadUtxoFetchError: false, hadHistoryCheckError: false,
        })

        await expect(findOrPrepareRgbTaprootUtxo()).rejects.toThrow('No Taproot UTXOs')
    })

    it('throws when UTXOs exist but none large enough to split', async () => {
        const tinyUtxo = makeUtxo({ value: 600, account: 'colored' })
        vi.mocked(btcTxns.performDiscoveryScan).mockResolvedValueOnce({
            utxos: [tinyUtxo], totalBalance: 600, maxIndex: 0, maxChangeIndex: 0,
            fundedAddresses: [], allDiscoveredAddresses: [],
            hadUtxoFetchError: false, hadHistoryCheckError: false,
        })

        await expect(findOrPrepareRgbTaprootUtxo()).rejects.toThrow()
    })
})
