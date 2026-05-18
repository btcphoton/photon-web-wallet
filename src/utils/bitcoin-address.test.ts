import { describe, it, expect } from 'vitest'
import { deriveBitcoinAddress, isLikelyRegtestAddress, deriveMultipleBitcoinAddresses, getBitcoinJsNetwork } from './bitcoin-address'
import * as bitcoin from 'bitcoinjs-lib'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('getBitcoinJsNetwork', () => {
    it('returns mainnet network for mainnet', () => {
        const net = getBitcoinJsNetwork('mainnet')
        expect(net).toBe(bitcoin.networks.bitcoin)
    })

    it('returns testnet network for testnet3', () => {
        const net = getBitcoinJsNetwork('testnet3')
        expect(net).toBe(bitcoin.networks.testnet)
    })

    it('returns testnet network for testnet4', () => {
        const net = getBitcoinJsNetwork('testnet4')
        expect(net).toBe(bitcoin.networks.testnet)
    })

    it('returns custom regtest network with bcrt bech32 prefix', () => {
        const net = getBitcoinJsNetwork('regtest')
        expect(net.bech32).toBe('bcrt')
    })
})

describe('isLikelyRegtestAddress', () => {
    it('detects bcrt1 native-segwit regtest address', () => {
        expect(isLikelyRegtestAddress('bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk')).toBe(true)
    })

    it('detects bcrt1p taproot regtest address', () => {
        expect(isLikelyRegtestAddress('bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg')).toBe(true)
    })

    it('detects testnet m-prefix legacy address', () => {
        expect(isLikelyRegtestAddress('mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef')).toBe(true)
    })

    it('detects testnet n-prefix legacy address', () => {
        expect(isLikelyRegtestAddress('n3GNqMveyvaPvUbH469vDRadqpJMPc84JA')).toBe(true)
    })

    it('detects testnet 2-prefix P2SH address', () => {
        expect(isLikelyRegtestAddress('2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2')).toBe(true)
    })

    it('rejects mainnet bc1q address', () => {
        expect(isLikelyRegtestAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toBe(false)
    })

    it('rejects mainnet bc1p taproot address', () => {
        expect(isLikelyRegtestAddress('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr')).toBe(false)
    })

    it('trims and lowercases before checking', () => {
        expect(isLikelyRegtestAddress('  BCRT1Qabc123  ')).toBe(true)
    })
})

describe('deriveBitcoinAddress — BIP84 (P2WPKH)', () => {
    it('mainnet external index 0 → known address', async () => {
        const addr = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 84, 0, 0, 0)
        expect(addr).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')
        expect(addr.startsWith('bc1q')).toBe(true)
    })

    it('mainnet internal (change) index 0', async () => {
        const addr = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 84, 0, 1, 0)
        expect(addr).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el')
    })

    it('testnet3 external index 0 → known address', async () => {
        const addr = await deriveBitcoinAddress(MNEMONIC, 'testnet3', 84, 0, 0, 0)
        expect(addr).toBe('tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl')
        expect(addr.startsWith('tb1q')).toBe(true)
    })

    it('testnet4 uses same derivation as testnet3 (coin type 1)', async () => {
        const addr3 = await deriveBitcoinAddress(MNEMONIC, 'testnet3', 84, 0, 0, 0)
        const addr4 = await deriveBitcoinAddress(MNEMONIC, 'testnet4', 84, 0, 0, 0)
        expect(addr3).toBe(addr4)
    })

    it('regtest address starts with bcrt1q', async () => {
        const addr = await deriveBitcoinAddress(MNEMONIC, 'regtest', 84, 0, 0, 0)
        expect(addr.startsWith('bcrt1q')).toBe(true)
        expect(isLikelyRegtestAddress(addr)).toBe(true)
    })

    it('different address index produces different address', async () => {
        const addr0 = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 84, 0, 0, 0)
        const addr1 = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 84, 0, 0, 1)
        expect(addr0).not.toBe(addr1)
    })

    it('throws on invalid mnemonic', async () => {
        await expect(deriveBitcoinAddress('not valid mnemonic', 'mainnet', 84, 0, 0, 0))
            .rejects.toThrow('Invalid mnemonic')
    })
})

describe('deriveBitcoinAddress — BIP86 (P2TR / Taproot)', () => {
    it('mainnet Vanilla account index 0 → known address', async () => {
        const addr = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 86, 0, 0, 0)
        expect(addr).toBe('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr')
        expect(addr.startsWith('bc1p')).toBe(true)
    })

    it('mainnet Colored account index 0 → known address', async () => {
        const addr = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 86, 1, 0, 0)
        expect(addr).toBe('bc1pkq6ayylfpe5hn05550ry25pkakuf72x9qkjc2sl06dfcet8sg25q9y3j3y')
        expect(addr.startsWith('bc1p')).toBe(true)
    })

    it('Vanilla and Colored accounts produce different addresses at the same index', async () => {
        const vanilla = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 86, 0, 0, 0)
        const colored = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 86, 1, 0, 0)
        expect(vanilla).not.toBe(colored)
    })

    it('regtest taproot starts with bcrt1p', async () => {
        const addr = await deriveBitcoinAddress(MNEMONIC, 'regtest', 86, 0, 0, 0)
        expect(addr.startsWith('bcrt1p')).toBe(true)
    })

    it('deterministic — same inputs always give same address', async () => {
        const addr1 = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 86, 0, 0, 5)
        const addr2 = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 86, 0, 0, 5)
        expect(addr1).toBe(addr2)
    })
})

describe('deriveMultipleBitcoinAddresses', () => {
    it('returns correct count of addresses', async () => {
        const addrs = await deriveMultipleBitcoinAddresses(MNEMONIC, 'mainnet', 5)
        expect(addrs).toHaveLength(5)
    })

    it('each address is unique', async () => {
        const addrs = await deriveMultipleBitcoinAddresses(MNEMONIC, 'mainnet', 5)
        const unique = new Set(addrs)
        expect(unique.size).toBe(5)
    })

    it('default count of 1 returns one address', async () => {
        const addrs = await deriveMultipleBitcoinAddresses(MNEMONIC, 'mainnet')
        expect(addrs).toHaveLength(1)
    })

    it('first address matches deriveBitcoinAddress(index=0)', async () => {
        const [first] = await deriveMultipleBitcoinAddresses(MNEMONIC, 'mainnet', 3)
        const expected = await deriveBitcoinAddress(MNEMONIC, 'mainnet', 84, 0, 0, 0)
        expect(first).toBe(expected)
    })

    it('uses BIP84 (P2WPKH) — addresses start with bc1q on mainnet', async () => {
        const addrs = await deriveMultipleBitcoinAddresses(MNEMONIC, 'mainnet', 3)
        addrs.forEach(a => expect(a.startsWith('bc1q')).toBe(true))
    })
})
