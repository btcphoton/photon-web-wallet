// src/utils/rgb-fetcher.ts

import { fetchUTXOsFromBlockchain } from './bitcoin-transactions';
import type { WalletNetwork } from './backend-config';

interface RgbUtxo {
    txid: string;
    vout: number;
    btcAmount: number;
    assets: Array<{
        assetId: string;
        name: string;
        amount: number;
        ticker: string;
    }>;
}

/**
 * Fetches UTXOs and filters them based on whether they contain RGB assets
 * by cross-referencing a proxy or local RGB state.
 */
export const fetchRgbOccupiedUtxos = async (
    address: string,
    proxyUrl: string = 'https://proxy.iriswallet.com/0.2/json-rpc',
    network: WalletNetwork = 'mainnet'
): Promise<RgbUtxo[]> => {
    try {
        // 1. Get all BTC UTXOs via the configured Bitcoin backend for the active network
        const btcUtxos = await fetchUTXOsFromBlockchain(address, network);

        // 2. Query the RGB Proxy for asset assignments linked to this address
        // Note: In a real RGB-lib integration, this uses the 'list_unspent' method
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'rgb_list_assets', // This depends on your specific proxy API
                params: { address }
            }),
        });

        const rgbData = await response.json();

        // 3. Map the assets to their specific Outpoints (TXID:VOUT)
        // This creates the "Occupied" view
        return btcUtxos.map((utxo: any) => {
            const outpoint = `${utxo.txid}:${utxo.vout}`;
            const foundAssets = rgbData.result?.assets.filter(
                (a: any) => a.outpoint === outpoint
            ) || [];

            return {
                txid: utxo.txid,
                vout: utxo.vout,
                btcAmount: utxo.value,
                assets: foundAssets.map((a: any) => ({
                    assetId: a.assetId,
                    name: a.name,
                    amount: a.amount,
                    ticker: a.ticker
                }))
            };
        }).filter((u: RgbUtxo) => u.assets.length > 0); // Only return UTXOs with RGB assets

    } catch (error) {
        console.error("Failed to fetch RGB UTXOs:", error);
        return [];
    }
};
