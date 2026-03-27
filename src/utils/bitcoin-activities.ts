// src/utils/bitcoin-activities.ts

import { resolveBitcoinApiBase, type WalletNetwork } from './backend-config';

export interface BitcoinActivity {
    type: 'Receive' | 'Send';
    txid: string | null;
    amount: number;
    status: 'Confirmed' | 'Pending' | 'Confirming';
    transferStatus?: string;
    date: string;
    blockHeight?: number;
    timestamp?: number;
    unit?: string;
    route?: 'onchain' | 'lightning';
    settlementLabel?: string;
    note?: string;
}

export const fetchBtcActivities = async (
    address: string,
    network: WalletNetwork,
    allWalletAddresses: string[] = []
): Promise<BitcoinActivity[]> => {
    try {
        const baseUrl = await resolveBitcoinApiBase(network, 'activities');

        const response = await fetch(`${baseUrl}/address/${address}/txs`);

        if (!response.ok) {
            return [];
        }

        const txs = await response.json();

        // Ensure the current address is included in the wallet addresses list
        const walletAddresses = new Set([address, ...allWalletAddresses]);

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
                // For sends, calculate total spent (inputs from this address - change back to ANY wallet address)
                // The amount sent to others is the sum of outputs NOT going to our wallet
                const sentToOthers = tx.vout
                    .filter((out: any) => !walletAddresses.has(out?.scriptpubkey_address))
                    .reduce((sum: number, out: any) => sum + (out?.value || 0), 0);

                // Total "Send" amount usually includes the fee
                amount = sentToOthers + (tx.fee || 0);
            }

            return {
                type: isReceive ? 'Receive' : 'Send',
                txid: tx.txid || 'unknown',
                amount: amount / 100_000_000, // Convert satoshis to BTC
                status: tx.status?.confirmed ? 'Confirmed' : 'Pending',
                date: tx.status?.block_time
                    ? new Date(tx.status.block_time * 1000).toLocaleDateString()
                    : 'Pending',
                blockHeight: tx.status?.block_height,
                timestamp: tx.status?.block_time || 0,
                unit: 'BTC',
                route: 'onchain'
            };
        }).filter(Boolean); // Remove any null entries from invalid transactions
    } catch (error) {
        console.error('Error fetching BTC activities:', error);
        return [];
    }
};
