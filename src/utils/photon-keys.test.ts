import { describe, it, expect } from 'vitest'
import { derivePhotonKeys } from './photon-keys'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const MNEMONIC2 = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'

describe('derivePhotonKeys', () => {
    it('returns an object with all required fields', async () => {
        const keys = await derivePhotonKeys(MNEMONIC)
        expect(keys).toHaveProperty('fingerprint')
        expect(keys).toHaveProperty('xpub_vanilla')
        expect(keys).toHaveProperty('xpub_colored')
        expect(keys).toHaveProperty('auth_pubkey_hex')
        expect(keys).toHaveProperty('_authPrivkey')
    })

    it('fingerprint is 8 lowercase hex characters', async () => {
        const { fingerprint } = await derivePhotonKeys(MNEMONIC)
        expect(fingerprint).toMatch(/^[0-9a-f]{8}$/)
    })

    it('xpub_vanilla is a valid base58 xpub (starts with xpub)', async () => {
        const { xpub_vanilla } = await derivePhotonKeys(MNEMONIC)
        expect(xpub_vanilla.startsWith('xpub')).toBe(true)
        expect(xpub_vanilla.length).toBeGreaterThan(100)
    })

    it('xpub_colored is a valid base58 xpub (starts with xpub)', async () => {
        const { xpub_colored } = await derivePhotonKeys(MNEMONIC)
        expect(xpub_colored.startsWith('xpub')).toBe(true)
    })

    it('xpub_vanilla and xpub_colored are different', async () => {
        const { xpub_vanilla, xpub_colored } = await derivePhotonKeys(MNEMONIC)
        expect(xpub_vanilla).not.toBe(xpub_colored)
    })

    it('auth_pubkey_hex is 66 hex characters (compressed pubkey)', async () => {
        const { auth_pubkey_hex } = await derivePhotonKeys(MNEMONIC)
        expect(auth_pubkey_hex).toMatch(/^[0-9a-f]{66}$/)
    })

    it('auth_pubkey_hex starts with 02 or 03 (compressed point prefix)', async () => {
        const { auth_pubkey_hex } = await derivePhotonKeys(MNEMONIC)
        expect(['02', '03']).toContain(auth_pubkey_hex.slice(0, 2))
    })

    it('_authPrivkey is a 32-byte Uint8Array', async () => {
        const { _authPrivkey } = await derivePhotonKeys(MNEMONIC)
        expect(_authPrivkey).toBeInstanceOf(Uint8Array)
        expect(_authPrivkey.length).toBe(32)
    })

    it('is deterministic — same mnemonic yields same keys', async () => {
        const k1 = await derivePhotonKeys(MNEMONIC)
        const k2 = await derivePhotonKeys(MNEMONIC)
        expect(k1.fingerprint).toBe(k2.fingerprint)
        expect(k1.xpub_vanilla).toBe(k2.xpub_vanilla)
        expect(k1.xpub_colored).toBe(k2.xpub_colored)
        expect(k1.auth_pubkey_hex).toBe(k2.auth_pubkey_hex)
    })

    it('different mnemonics produce different keys', async () => {
        const k1 = await derivePhotonKeys(MNEMONIC)
        const k2 = await derivePhotonKeys(MNEMONIC2)
        expect(k1.fingerprint).not.toBe(k2.fingerprint)
        expect(k1.xpub_vanilla).not.toBe(k2.xpub_vanilla)
        expect(k1.auth_pubkey_hex).not.toBe(k2.auth_pubkey_hex)
    })
})
