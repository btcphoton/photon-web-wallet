// src/utils/bitcoin-activities.ts

export interface BitcoinActivity {
    type: 'Receive' | 'Send';
    txid: string;
    amount: number;
    status: 'Confirmed' | 'Pending';
    date: string;
    blockHeight?: number;
}

export const fetchBtcActivities = async (
    address: string,
    network: string
): Promise<BitcoinActivity[]> => {
    try {
        const baseUrl = network === 'testnet3' || network === 'testnet4' || network === 'regtest'
            ? 'https://mempool.space/testnet/api'
            : 'https://mempool.space/api';

        const response = await fetch(`${baseUrl}/address/${address}/txs`);

        if (!response.ok) {
            return [];
        }

        const txs = await response.json();

        return txs.map((tx: any) => {
            // Validate transaction structure
            if (!tx || !tx.vout || !tx.status) {
                console.warn('Invalid transaction structure:', tx);
                return null;
            }

            // Check if address is in outputs (receiving)
            const isReceive = tx.vout.some((out: any) => out?.scriptpubkey_address === address);

            // Calculate amount
            let amount = 0;
            if (isReceive) {
                // Sum all outputs to this address
                amount = tx.vout
                    .filter((out: any) => out?.scriptpubkey_address === address)
                    .reduce((sum: number, out: any) => sum + (out?.value || 0), 0);
            } else {
                // For sends, calculate total spent (inputs from this address - change back to this address)
                const totalOut = tx.vout.reduce((sum: number, out: any) => sum + (out?.value || 0), 0);
                const changeBack = tx.vout
                    .filter((out: any) => out?.scriptpubkey_address === address)
                    .reduce((sum: number, out: any) => sum + (out?.value || 0), 0);
                amount = totalOut - changeBack + (tx.fee || 0);
            }

            return {
                type: isReceive ? 'Receive' : 'Send',
                txid: tx.txid || 'unknown',
                amount: amount / 100_000_000, // Convert satoshis to BTC
                status: tx.status?.confirmed ? 'Confirmed' : 'Pending',
                date: tx.status?.block_time
                    ? new Date(tx.status.block_time * 1000).toLocaleDateString()
                    : 'Pending',
                blockHeight: tx.status?.block_height
            };
        }).filter(Boolean); // Remove any null entries from invalid transactions
    } catch (error) {
        console.error('Error fetching BTC activities:', error);
        return [];
    }
};
