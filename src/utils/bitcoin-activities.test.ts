import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchBtcActivities } from './bitcoin-activities'

vi.mock('./backend-config', () => ({
    resolveBitcoinApiBase: vi.fn(async () => 'https://mempool.space/api'),
}))

global.fetch = vi.fn()

beforeEach(() => {
    vi.clearAllMocks()
})

const ADDRESS = 'bc1qtest'

const makeTx = (overrides: Record<string, any> = {}) => ({
    txid: 'abc123',
    vout: [{ scriptpubkey_address: ADDRESS, value: 50_000 }],
    vin: [{ prevout: { scriptpubkey_address: 'bc1qother', value: 60_000 } }],
    fee: 1000,
    status: { confirmed: true, block_time: 1_700_000_000, block_height: 800_000 },
    ...overrides,
})

describe('fetchBtcActivities', () => {
    it('returns empty array on HTTP error', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as any)
        const result = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(result).toEqual([])
    })

    it('returns empty array on network failure', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
        const result = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(result).toEqual([])
    })

    it('returns empty array for empty transaction list', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as any)
        const result = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(result).toEqual([])
    })

    it('classifies a payment to this address as Receive', async () => {
        const tx = makeTx()
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [tx] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(activity.type).toBe('Receive')
    })

    it('receive amount sums outputs to this address in BTC', async () => {
        const tx = makeTx({
            vout: [
                { scriptpubkey_address: ADDRESS, value: 30_000 },
                { scriptpubkey_address: ADDRESS, value: 20_000 },
            ],
        })
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [tx] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(activity.amount).toBeCloseTo(50_000 / 100_000_000, 8)
    })

    it('classifies a spend from this address as Send', async () => {
        const tx = makeTx({
            vout: [
                { scriptpubkey_address: 'bc1qother', value: 49_000 },
            ],
        })
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [tx] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(activity.type).toBe('Send')
    })

    it('send amount includes fee and value sent to non-wallet outputs', async () => {
        const fee = 1000
        const tx = makeTx({
            vout: [
                { scriptpubkey_address: 'bc1qthirdparty', value: 49_000 },
            ],
            fee,
        })
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [tx] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(activity.amount).toBeCloseTo((49_000 + fee) / 100_000_000, 8)
    })

    it('change outputs to wallet addresses are excluded from Send amount', async () => {
        const fee = 1000
        const walletChangeAddress = 'bc1qwalletchange'
        const tx = makeTx({
            vout: [
                { scriptpubkey_address: 'bc1qthirdparty', value: 30_000 },
                { scriptpubkey_address: walletChangeAddress, value: 19_000 },
            ],
            fee,
        })
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [tx] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet', [walletChangeAddress])
        expect(activity.amount).toBeCloseTo((30_000 + fee) / 100_000_000, 8)
    })

    it('confirmed transaction has Confirmed status', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [makeTx()] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(activity.status).toBe('Confirmed')
    })

    it('unconfirmed transaction has Pending status', async () => {
        const tx = makeTx({ status: { confirmed: false, block_time: null } })
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [tx] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(activity.status).toBe('Pending')
    })

    it('includes blockHeight for confirmed transactions', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [makeTx()] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(activity.blockHeight).toBe(800_000)
    })

    it('date is Pending for unconfirmed', async () => {
        const tx = makeTx({ status: { confirmed: false, block_time: null } })
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [tx] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(activity.date).toBe('Pending')
    })

    it('unit is BTC', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [makeTx()] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(activity.unit).toBe('BTC')
    })

    it('route is onchain', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [makeTx()] } as any)
        const [activity] = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(activity.route).toBe('onchain')
    })

    it('filters out null entries from invalid transactions', async () => {
        const validTx = makeTx()
        const invalidTx = { txid: 'invalid', vout: null, status: null }
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [invalidTx, validTx] } as any)
        const result = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(result).toHaveLength(1)
        expect(result[0].txid).toBe('abc123')
    })

    it('handles multiple transactions', async () => {
        const txs = [
            makeTx({ txid: 'tx1' }),
            makeTx({ txid: 'tx2', vout: [{ scriptpubkey_address: 'bc1qother', value: 10_000 }] }),
        ]
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => txs } as any)
        const result = await fetchBtcActivities(ADDRESS, 'mainnet')
        expect(result).toHaveLength(2)
    })
})
