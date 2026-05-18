import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateBlindedSeal, isValidRgbProxyUrl, createRgbInvoice } from './rgb-invoice'

vi.mock('./storage', () => {
    let _store: Record<string, any> = {}
    return {
        getStorageData: vi.fn(async (keys: string[]) => {
            const result: Record<string, any> = {}
            keys.forEach(k => { if (_store[k] !== undefined) result[k] = _store[k] })
            return result
        }),
        setStorageData: vi.fn(async (data: Record<string, any>) => { Object.assign(_store, data) }),
        _reset: () => { _store = {} },
        _set: (k: string, v: any) => { _store[k] = v },
    }
})

vi.mock('./utxoManager', () => ({
    findOrPrepareRgbTaprootUtxo: vi.fn(async () => ({
        txid: 'deadbeef00000000000000000000000000000000000000000000000000000000',
        vout: 0,
        value: 3000,
        address: 'bcrt1p...',
        derivationPath: "m/86'/1'/1'/0/0",
        account: 'colored',
        chain: 0 as const,
        index: 0,
        source: 'existing' as const,
    })),
}))

import * as storageMod from './storage'

beforeEach(() => {
    ;(storageMod as any)._reset()
    vi.clearAllMocks()
})

describe('isValidRgbProxyUrl', () => {
    it('accepts http:// URLs', () => {
        expect(isValidRgbProxyUrl('http://example.com/json-rpc')).toBe(true)
    })

    it('accepts https:// URLs', () => {
        expect(isValidRgbProxyUrl('https://dev-proxy.photonbolt.xyz/json-rpc')).toBe(true)
    })

    it('accepts rpc:// scheme (rgb-lib native transport)', () => {
        expect(isValidRgbProxyUrl('rpc://127.0.0.1:3000/json-rpc')).toBe(true)
    })

    it('accepts rpcs:// scheme (rgb-lib HTTPS transport)', () => {
        expect(isValidRgbProxyUrl('rpcs://dev-proxy.photonbolt.xyz/json-rpc')).toBe(true)
    })

    it('rejects empty string', () => {
        expect(isValidRgbProxyUrl('')).toBe(false)
    })

    it('rejects a plain hostname with no protocol', () => {
        expect(isValidRgbProxyUrl('example.com/json-rpc')).toBe(false)
    })

    it('rejects ftp:// scheme', () => {
        expect(isValidRgbProxyUrl('ftp://example.com')).toBe(false)
    })
})

describe('generateBlindedSeal', () => {
    it('returns non-empty blindedSeal and secret strings', async () => {
        const { blindedSeal, secret } = await generateBlindedSeal('txid123', 0)
        expect(typeof blindedSeal).toBe('string')
        expect(blindedSeal.length).toBeGreaterThan(0)
        expect(typeof secret).toBe('string')
        expect(secret.length).toBeGreaterThan(0)
    })

    it('secret is 16 hex characters (8 bytes)', async () => {
        const { secret } = await generateBlindedSeal('txid123', 0)
        expect(secret).toMatch(/^[0-9a-f]{16}$/)
    })

    it('blindedSeal is 64 hex characters (SHA-256)', async () => {
        const { blindedSeal } = await generateBlindedSeal('txid123', 0)
        expect(blindedSeal).toMatch(/^[0-9a-f]{64}$/)
    })

    it('different calls produce different secrets (randomness)', async () => {
        const r1 = await generateBlindedSeal('txid', 0)
        const r2 = await generateBlindedSeal('txid', 0)
        expect(r1.secret).not.toBe(r2.secret)
        expect(r1.blindedSeal).not.toBe(r2.blindedSeal)
    })

    it('different vout produces different blindedSeal for same txid and same secret concept', async () => {
        const r0 = await generateBlindedSeal('txid', 0)
        const r1 = await generateBlindedSeal('txid', 1)
        expect(r0.blindedSeal).not.toBe(r1.blindedSeal)
    })
})

describe('createRgbInvoice', () => {
    const ASSET_ID = 'EitLfBPYSzBGBayxAbcdef12345678901234567890'

    it('returns an invoice string', async () => {
        const result = await createRgbInvoice(ASSET_ID, 100)
        expect(typeof result.invoice).toBe('string')
        expect(result.invoice.length).toBeGreaterThan(0)
    })

    it('invoice starts with rgb:', async () => {
        const result = await createRgbInvoice(ASSET_ID, 100)
        expect(result.invoice.startsWith('rgb:')).toBe(true)
    })

    it('invoice contains /RGB20/', async () => {
        const result = await createRgbInvoice(ASSET_ID, 100)
        expect(result.invoice).toContain('/RGB20/')
    })

    it('invoice embeds the transport endpoint', async () => {
        const result = await createRgbInvoice(ASSET_ID, 100)
        expect(result.invoice).toContain('endpoints=')
    })

    it('strips rgb: prefix from assetId in invoice', async () => {
        const result = await createRgbInvoice(`rgb:${ASSET_ID}`, 100)
        // Should not double the prefix
        expect(result.invoice).not.toContain('rgb:rgb:')
    })

    it('truncates fractional amounts to integer', async () => {
        const result = await createRgbInvoice(ASSET_ID, 99.9)
        expect(result.invoice).toContain('/99+')
    })

    it('negative amount is treated as 0', async () => {
        const result = await createRgbInvoice(ASSET_ID, -5)
        expect(result.invoice).toContain('/0+')
    })

    it('returns txid, vout, blindedSeal, secret from the mocked UTXO', async () => {
        const result = await createRgbInvoice(ASSET_ID, 50)
        expect(result.txid).toBe('deadbeef00000000000000000000000000000000000000000000000000000000')
        expect(result.vout).toBe(0)
        expect(result.source).toBe('existing')
        expect(result.blindedSeal.length).toBeGreaterThan(0)
    })

    it('persists seal secret to storage', async () => {
        await createRgbInvoice(ASSET_ID, 10)
        expect(storageMod.setStorageData).toHaveBeenCalled()
        const calls = vi.mocked(storageMod.setStorageData).mock.calls
        const sealCall = calls.find(([data]) => 'rgbSealSecrets' in data)
        expect(sealCall).toBeDefined()
    })
})
