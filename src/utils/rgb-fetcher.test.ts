import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchRgbOccupiedUtxos } from './rgb-fetcher'

vi.mock('./bitcoin-transactions', () => ({
    fetchUTXOsFromBlockchain: vi.fn(),
}))

import * as btcTxns from './bitcoin-transactions'

global.fetch = vi.fn()

beforeEach(() => {
    vi.clearAllMocks()
})

const PROXY_URL = 'https://proxy.example.com/json-rpc'
const ADDRESS = 'bc1qtest'

const mockBtcUtxos = [
    { txid: 'txA', vout: 0, value: 3000, address: ADDRESS, derivationPath: "m/86'/0'/1'/0/0", account: 'colored', chain: 0, index: 0 },
    { txid: 'txB', vout: 1, value: 5000, address: ADDRESS, derivationPath: "m/86'/0'/1'/0/1", account: 'colored', chain: 0, index: 1 },
]

describe('fetchRgbOccupiedUtxos', () => {
    it('returns only UTXOs that carry RGB assets', async () => {
        vi.mocked(btcTxns.fetchUTXOsFromBlockchain).mockResolvedValueOnce(mockBtcUtxos as any)
        vi.mocked(fetch).mockResolvedValueOnce({
            json: async () => ({
                result: {
                    assets: [
                        { outpoint: 'txA:0', assetId: 'rgb:abc', name: 'TestToken', amount: 10, ticker: 'TST' },
                    ],
                },
            }),
        } as any)

        const result = await fetchRgbOccupiedUtxos(ADDRESS, PROXY_URL, 'mainnet')
        expect(result).toHaveLength(1)
        expect(result[0].txid).toBe('txA')
        expect(result[0].assets).toHaveLength(1)
        expect(result[0].assets[0].ticker).toBe('TST')
    })

    it('returns empty array when no UTXOs carry RGB assets', async () => {
        vi.mocked(btcTxns.fetchUTXOsFromBlockchain).mockResolvedValueOnce(mockBtcUtxos as any)
        vi.mocked(fetch).mockResolvedValueOnce({
            json: async () => ({ result: { assets: [] } }),
        } as any)

        const result = await fetchRgbOccupiedUtxos(ADDRESS, PROXY_URL, 'mainnet')
        expect(result).toEqual([])
    })

    it('returns empty array on fetch error', async () => {
        vi.mocked(btcTxns.fetchUTXOsFromBlockchain).mockResolvedValueOnce(mockBtcUtxos as any)
        vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))

        const result = await fetchRgbOccupiedUtxos(ADDRESS, PROXY_URL, 'mainnet')
        expect(result).toEqual([])
    })

    it('returns empty array when BTC UTXO fetch fails', async () => {
        vi.mocked(btcTxns.fetchUTXOsFromBlockchain).mockRejectedValueOnce(new Error('UTXO fetch failed'))

        const result = await fetchRgbOccupiedUtxos(ADDRESS, PROXY_URL, 'mainnet')
        expect(result).toEqual([])
    })

    it('maps asset fields correctly', async () => {
        vi.mocked(btcTxns.fetchUTXOsFromBlockchain).mockResolvedValueOnce(mockBtcUtxos as any)
        vi.mocked(fetch).mockResolvedValueOnce({
            json: async () => ({
                result: {
                    assets: [
                        { outpoint: 'txA:0', assetId: 'rgb:XYZ', name: 'CoolCoin', amount: 999, ticker: 'CCN' },
                    ],
                },
            }),
        } as any)

        const result = await fetchRgbOccupiedUtxos(ADDRESS, PROXY_URL)
        expect(result[0].btcAmount).toBe(3000)
        expect(result[0].assets[0]).toEqual({
            assetId: 'rgb:XYZ',
            name: 'CoolCoin',
            amount: 999,
            ticker: 'CCN',
        })
    })

    it('sends a JSON-RPC call with the address as param', async () => {
        vi.mocked(btcTxns.fetchUTXOsFromBlockchain).mockResolvedValueOnce([])
        vi.mocked(fetch).mockResolvedValueOnce({
            json: async () => ({ result: { assets: [] } }),
        } as any)

        await fetchRgbOccupiedUtxos(ADDRESS, PROXY_URL)

        expect(fetch).toHaveBeenCalledWith(PROXY_URL, expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }))

        const body = JSON.parse((fetch as any).mock.calls[0][1].body)
        expect(body.params.address).toBe(ADDRESS)
        expect(body.method).toBe('rgb_list_assets')
    })
})
