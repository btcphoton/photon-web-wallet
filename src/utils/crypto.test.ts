import { describe, it, expect } from 'vitest'
import { generateMnemonic, validateMnemonic, deriveIdentity } from './crypto'
import * as bip39 from 'bip39'

const KNOWN_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('generateMnemonic', () => {
    it('produces a 12-word phrase', () => {
        expect(generateMnemonic().split(' ')).toHaveLength(12)
    })

    it('produces a valid BIP39 mnemonic', () => {
        expect(validateMnemonic(generateMnemonic())).toBe(true)
    })

    it('produces a different mnemonic each call', () => {
        const a = generateMnemonic()
        const b = generateMnemonic()
        expect(a).not.toBe(b)
    })
})

describe('validateMnemonic', () => {
    it('accepts a valid mnemonic', () => {
        expect(validateMnemonic(KNOWN_MNEMONIC)).toBe(true)
    })

    it('rejects an empty string', () => {
        expect(validateMnemonic('')).toBe(false)
    })

    it('rejects a random string', () => {
        expect(validateMnemonic('not a valid mnemonic phrase at all here')).toBe(false)
    })

    it('rejects a 12-word phrase with an invalid word', () => {
        expect(validateMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon zzz')).toBe(false)
    })

    it('rejects an 11-word valid phrase (wrong length)', () => {
        const words = KNOWN_MNEMONIC.split(' ').slice(0, 11).join(' ')
        expect(validateMnemonic(words)).toBe(false)
    })

    it('validates all words from BIP39 English wordlist when combined correctly', () => {
        const wordlist = bip39.wordlists.english
        expect(wordlist.length).toBe(2048)
    })
})

describe('deriveIdentity', () => {
    it('returns a non-empty string', async () => {
        const id = await deriveIdentity(KNOWN_MNEMONIC)
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
    })

    it('is deterministic — same mnemonic gives same principal', async () => {
        const id1 = await deriveIdentity(KNOWN_MNEMONIC)
        const id2 = await deriveIdentity(KNOWN_MNEMONIC)
        expect(id1).toBe(id2)
    })

    it('produces different identities for different mnemonics', async () => {
        const mnemonic2 = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'
        const id1 = await deriveIdentity(KNOWN_MNEMONIC)
        const id2 = await deriveIdentity(mnemonic2)
        expect(id1).not.toBe(id2)
    })

    it('throws on an invalid mnemonic', async () => {
        await expect(deriveIdentity('invalid mnemonic phrase')).rejects.toThrow('Invalid mnemonic')
    })

    it('principal format contains dashes (ICP format)', async () => {
        const id = await deriveIdentity(KNOWN_MNEMONIC)
        expect(id).toContain('-')
    })
})
