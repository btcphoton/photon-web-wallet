import { describe, it, expect } from 'vitest';
import { deriveBitcoinAddress } from './bitcoin-address';

describe('Bitcoin Address Derivation', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('should derive correct BIP84 (Native SegWit) mainnet receive address', async () => {
        const address = await deriveBitcoinAddress(mnemonic, 'mainnet', 84, 0, 0, 0);
        // m/84'/0'/0'/0/0 for 'abandon...'
        expect(address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
        expect(address.startsWith('bc1q')).toBe(true);
    });

    it('should derive correct BIP84 (Native SegWit) mainnet change address', async () => {
        const address = await deriveBitcoinAddress(mnemonic, 'mainnet', 84, 0, 1, 0);
        // m/84'/0'/0'/1/0 for 'abandon...'
        expect(address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
        expect(address.startsWith('bc1q')).toBe(true);
    });

    it('should derive correct BIP84 (Native SegWit) testnet receive address', async () => {
        const address = await deriveBitcoinAddress(mnemonic, 'testnet3', 84, 0, 0, 0);
        // m/84'/1'/0'/0/0 for 'abandon...'
        expect(address).toBe('tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl');
        expect(address.startsWith('tb1q')).toBe(true);
    });

    it('should derive correct BIP86 (Taproot) mainnet receive address', async () => {
        const address = await deriveBitcoinAddress(mnemonic, 'mainnet', 86, 0, 0, 0);
        // m/86'/0'/0'/0/0 for 'abandon...'
        expect(address).toBe('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
        expect(address.startsWith('bc1p')).toBe(true);
    });

    it('should derive correct BIP86 (Taproot) mainnet Colored account address', async () => {
        const address = await deriveBitcoinAddress(mnemonic, 'mainnet', 86, 1, 0, 0);
        // m/86'/0'/1'/0/0 for 'abandon...'
        expect(address).toBe('bc1pkq6ayylfpe5hn05550ry25pkakuf72x9qkjc2sl06dfcet8sg25q9y3j3y');
        expect(address.startsWith('bc1p')).toBe(true);
    });
});
