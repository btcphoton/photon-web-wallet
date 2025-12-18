import { describe, it, expect } from 'vitest';
import { generateMnemonic, deriveIdentity, validateMnemonic } from './crypto';

describe('Crypto Utils', () => {
    it('should generate a valid 12-word mnemonic', () => {
        const mnemonic = generateMnemonic();
        expect(mnemonic.split(' ').length).toBe(12);
        expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should derive the same Principal ID from the same mnemonic', async () => {
        const mnemonic = generateMnemonic();
        const id1 = await deriveIdentity(mnemonic);
        const id2 = await deriveIdentity(mnemonic);
        expect(id1).toBe(id2);
    });

    it('should derive a valid Principal ID', async () => {
        const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
        const id = await deriveIdentity(mnemonic);
        console.log('Derived ID:', id);
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
    });
});
