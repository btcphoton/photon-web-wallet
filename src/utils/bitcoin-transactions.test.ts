import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performDiscoveryScan } from './bitcoin-transactions';

// Mock fetch
global.fetch = vi.fn();

describe('performDiscoveryScan', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should aggregate UTXOs from multiple addresses', async () => {
        // Mock fetch to return different UTXOs for different addresses
        // Index 0 External: bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu
        // Index 0 Internal: bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el
        (global.fetch as any).mockImplementation((url: string) => {
            if (url.includes('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([{ txid: '1', vout: 0, value: 1000 }])
                });
            } else if (url.includes('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([{ txid: '2', vout: 0, value: 2000 }])
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([])
            });
        });

        const { totalBalance, utxos } = await performDiscoveryScan(mnemonic, 'mainnet', 0);

        expect(totalBalance).toBe(3000);
        expect(utxos.length).toBe(2);
        expect(utxos.some(u => u.txid === '1')).toBe(true);
        expect(utxos.some(u => u.txid === '2')).toBe(true);
    });

    it('should handle multiple indices', async () => {
        (global.fetch as any).mockImplementation(() => {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([{ txid: 'test', vout: 0, value: 500 }])
            });
        });

        // changeIndex = 1 means 2 external and 2 internal addresses = 4 addresses total
        const { totalBalance, utxos } = await performDiscoveryScan(mnemonic, 'mainnet', 1);

        expect(totalBalance).toBe(2000); // 4 * 500
        expect(utxos.length).toBe(4);
    });
});
