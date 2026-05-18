import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    getDefaultElectrumServer,
    getDefaultRgbProxy,
    getBackendProfileById,
    getActiveBackendProfileId,
    getActiveRegtestRgbBackendMode,
    getRegtestRgbBackendConfig,
    resolveBitcoinApiBase,
    BACKEND_PROFILES,
    DEFAULT_BACKEND_PROFILE_ID,
    PUBLIC_ELECTRUM_DEFAULT,
    PUBLIC_RGB_PROXY_DEFAULT,
    PHOTON_REGTEST_ELECTRUM,
    PHOTON_REGTEST_RGB_PROXY,
    PHOTON_REGTEST_API_BASE,
} from './backend-config'

vi.mock('./storage', () => {
    let _store: Record<string, any> = {}
    return {
        getStorageData: vi.fn(async (keys: string[]) => {
            const result: Record<string, any> = {}
            keys.forEach(k => { if (_store[k] !== undefined) result[k] = _store[k] })
            return result
        }),
        setStorageData: vi.fn(async (data: Record<string, any>) => {
            Object.assign(_store, data)
        }),
        _reset: () => { _store = {} },
        _set: (k: string, v: any) => { _store[k] = v },
    }
})

import * as storageMod from './storage'

beforeEach(() => {
    ;(storageMod as any)._reset()
    vi.clearAllMocks()
})

describe('BACKEND_PROFILES constant', () => {
    it('contains exactly 2 profiles', () => {
        expect(BACKEND_PROFILES).toHaveLength(2)
    })

    it('first profile is legacy-public', () => {
        expect(BACKEND_PROFILES[0].id).toBe('legacy-public')
    })

    it('second profile is photon-dev-regtest', () => {
        expect(BACKEND_PROFILES[1].id).toBe('photon-dev-regtest')
    })

    it('default profile is legacy-public', () => {
        expect(DEFAULT_BACKEND_PROFILE_ID).toBe('legacy-public')
    })
})

describe('getDefaultElectrumServer', () => {
    it('returns public default for mainnet regardless of profile', () => {
        expect(getDefaultElectrumServer('mainnet', 'legacy-public')).toBe(PUBLIC_ELECTRUM_DEFAULT)
        expect(getDefaultElectrumServer('mainnet', 'photon-dev-regtest')).toBe(PUBLIC_ELECTRUM_DEFAULT)
    })

    it('returns photon regtest electrum for regtest + photon-dev-regtest profile', () => {
        expect(getDefaultElectrumServer('regtest', 'photon-dev-regtest')).toBe(PHOTON_REGTEST_ELECTRUM)
    })

    it('returns public default for regtest + legacy-public profile', () => {
        expect(getDefaultElectrumServer('regtest', 'legacy-public')).toBe(PUBLIC_ELECTRUM_DEFAULT)
    })

    it('returns public default for testnet3', () => {
        expect(getDefaultElectrumServer('testnet3', 'legacy-public')).toBe(PUBLIC_ELECTRUM_DEFAULT)
    })
})

describe('getDefaultRgbProxy', () => {
    it('returns photon regtest proxy for regtest + photon-dev-regtest', () => {
        expect(getDefaultRgbProxy('regtest', 'photon-dev-regtest')).toBe(PHOTON_REGTEST_RGB_PROXY)
    })

    it('returns public default for regtest + legacy-public', () => {
        expect(getDefaultRgbProxy('regtest', 'legacy-public')).toBe(PUBLIC_RGB_PROXY_DEFAULT)
    })

    it('returns public default for mainnet', () => {
        expect(getDefaultRgbProxy('mainnet', 'photon-dev-regtest')).toBe(PUBLIC_RGB_PROXY_DEFAULT)
    })
})

describe('getBackendProfileById', () => {
    it('returns legacy-public profile by ID', () => {
        const p = getBackendProfileById('legacy-public')
        expect(p.id).toBe('legacy-public')
        expect(p.name).toBeTruthy()
    })

    it('returns photon-dev-regtest profile by ID', () => {
        const p = getBackendProfileById('photon-dev-regtest')
        expect(p.id).toBe('photon-dev-regtest')
    })

    it('falls back to first profile for unknown ID', () => {
        const p = getBackendProfileById(undefined)
        expect(p.id).toBe('legacy-public')
    })
})

describe('getActiveBackendProfileId', () => {
    it('returns default when storage is empty', async () => {
        const id = await getActiveBackendProfileId()
        expect(id).toBe('legacy-public')
    })

    it('returns photon-dev-regtest when stored', async () => {
        ;(storageMod as any)._set('backendProfileId', 'photon-dev-regtest')
        const id = await getActiveBackendProfileId()
        expect(id).toBe('photon-dev-regtest')
    })

    it('returns legacy-public when stored', async () => {
        ;(storageMod as any)._set('backendProfileId', 'legacy-public')
        const id = await getActiveBackendProfileId()
        expect(id).toBe('legacy-public')
    })

    it('falls back to default for unknown stored value', async () => {
        ;(storageMod as any)._set('backendProfileId', 'unknown-profile')
        const id = await getActiveBackendProfileId()
        expect(id).toBe('legacy-public')
    })
})

describe('getActiveRegtestRgbBackendMode', () => {
    it('returns faucet by default', async () => {
        const mode = await getActiveRegtestRgbBackendMode()
        expect(mode).toBe('faucet')
    })

    it('returns prism when stored', async () => {
        ;(storageMod as any)._set('regtestRgbBackendMode', 'prism')
        const mode = await getActiveRegtestRgbBackendMode()
        expect(mode).toBe('prism')
    })

    it('returns faucet for unknown stored value', async () => {
        ;(storageMod as any)._set('regtestRgbBackendMode', 'invalid')
        const mode = await getActiveRegtestRgbBackendMode()
        expect(mode).toBe('faucet')
    })
})

describe('getRegtestRgbBackendConfig', () => {
    it('returns faucet mode with PHOTON_REGTEST_API_BASE by default', async () => {
        const config = await getRegtestRgbBackendConfig()
        expect(config.mode).toBe('faucet')
        expect(config.apiBase).toBe(PHOTON_REGTEST_API_BASE)
        expect(config.authToken).toBe('')
    })

    it('returns prism mode with configured base URL', async () => {
        ;(storageMod as any)._set('regtestRgbBackendMode', 'prism')
        ;(storageMod as any)._set('rgbitsPrismApiBase', 'https://custom.prism.xyz')
        const config = await getRegtestRgbBackendConfig()
        expect(config.mode).toBe('prism')
        expect(config.apiBase).toBe('https://custom.prism.xyz')
    })
})

describe('resolveBitcoinApiBase', () => {
    it('mainnet fees → mempool.space', async () => {
        const url = await resolveBitcoinApiBase('mainnet', 'fees')
        expect(url).toContain('mempool.space')
        expect(url).toContain('fees/recommended')
    })

    it('testnet3 fees → mempool testnet', async () => {
        const url = await resolveBitcoinApiBase('testnet3', 'fees')
        expect(url).toContain('testnet')
        expect(url).toContain('fees/recommended')
    })

    it('testnet4 fees → mempool testnet4', async () => {
        const url = await resolveBitcoinApiBase('testnet4', 'fees')
        expect(url).toContain('testnet4')
    })

    it('regtest fees → photon faucet', async () => {
        const url = await resolveBitcoinApiBase('regtest', 'fees')
        expect(url).toContain(PHOTON_REGTEST_API_BASE)
    })

    it('mainnet address → mempool.space/api', async () => {
        const url = await resolveBitcoinApiBase('mainnet', 'address')
        expect(url).toContain('mempool.space/api')
        expect(url).not.toContain('testnet')
    })

    it('testnet3 address → mempool testnet api', async () => {
        const url = await resolveBitcoinApiBase('testnet3', 'address')
        expect(url).toContain('testnet/api')
    })

    it('regtest address → photon faucet (always)', async () => {
        const url = await resolveBitcoinApiBase('regtest', 'address')
        expect(url).toBe(PHOTON_REGTEST_API_BASE)
    })

    it('photon-dev-regtest profile uses faucet for regtest activities', async () => {
        ;(storageMod as any)._set('backendProfileId', 'photon-dev-regtest')
        const url = await resolveBitcoinApiBase('regtest', 'activities')
        expect(url).toBe(PHOTON_REGTEST_API_BASE)
    })
})
