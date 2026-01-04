/**
 * dApp Bridge Utilities
 * Type definitions and helper functions for dApp integration
 */

export type Network = 'mainnet' | 'testnet3' | 'testnet4' | 'regtest';

export interface PhotonRequest {
    type: 'PHOTON_REQUEST';
    id: number;
    method: string;
    params: any;
    origin: string;
}

export interface PhotonResponse {
    type: 'PHOTON_RESPONSE';
    id: number;
    result?: any;
    error?: string;
}

export interface PhotonEvent {
    type: 'PHOTON_EVENT';
    event: string;
    data: any;
}

export interface ConnectResult {
    address: string;
    network: Network;
    connected: boolean;
}

export interface TransactionData {
    to: string;
    amount: string | number;
    fee?: string | number;
}

export interface SignedTransaction {
    signedTx: string;
    txId?: string;
}

export interface MessageSignature {
    signature: string;
    address: string;
}

/**
 * Validate Bitcoin address format
 */
export function isValidBitcoinAddress(address: string, network: Network = 'mainnet'): boolean {
    if (!address || typeof address !== 'string') {
        return false;
    }

    // Mainnet addresses
    if (network === 'mainnet') {
        // P2PKH (1...)
        if (address.match(/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/)) return true;
        // P2SH (3...)
        if (address.match(/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/)) return true;
        // Bech32 (bc1...)
        if (address.match(/^bc1[a-z0-9]{39,87}$/)) return true;
    }

    // Testnet addresses
    if (network === 'testnet3' || network === 'testnet4') {
        // P2PKH (m... or n...)
        if (address.match(/^[mn][a-km-zA-HJ-NP-Z1-9]{25,34}$/)) return true;
        // P2SH (2...)
        if (address.match(/^2[a-km-zA-HJ-NP-Z1-9]{25,34}$/)) return true;
        // Bech32 (tb1...)
        if (address.match(/^tb1[a-z0-9]{39,87}$/)) return true;
    }

    // Regtest addresses
    if (network === 'regtest') {
        // Bech32 (bcrt1...)
        if (address.match(/^bcrt1[a-z0-9]{39,87}$/)) return true;
    }

    return false;
}

/**
 * Validate transaction amount
 */
export function isValidAmount(amount: string | number): boolean {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return !isNaN(num) && num > 0 && num < 21000000; // Max BTC supply
}

/**
 * Format BTC amount to satoshis
 */
export function btcToSatoshis(btc: string | number): number {
    const num = typeof btc === 'string' ? parseFloat(btc) : btc;
    return Math.floor(num * 100000000);
}

/**
 * Format satoshis to BTC
 */
export function satoshisToBtc(satoshis: number): string {
    return (satoshis / 100000000).toFixed(8);
}

/**
 * Validate transaction data
 */
export function validateTransactionData(txData: TransactionData, network: Network): { valid: boolean; error?: string } {
    if (!txData) {
        return { valid: false, error: 'Transaction data is required' };
    }

    if (!txData.to) {
        return { valid: false, error: 'Recipient address is required' };
    }

    if (!isValidBitcoinAddress(txData.to, network)) {
        return { valid: false, error: 'Invalid recipient address' };
    }

    if (!txData.amount) {
        return { valid: false, error: 'Amount is required' };
    }

    if (!isValidAmount(txData.amount)) {
        return { valid: false, error: 'Invalid amount' };
    }

    return { valid: true };
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, startChars: number = 8, endChars: number = 6): string {
    if (!address || address.length <= startChars + endChars) {
        return address;
    }
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format network name for display
 */
export function formatNetworkName(network: Network): string {
    const names: Record<Network, string> = {
        mainnet: 'Bitcoin Mainnet',
        testnet3: 'Bitcoin Testnet 3',
        testnet4: 'Bitcoin Testnet 4',
        regtest: 'Bitcoin Regtest'
    };
    return names[network] || network;
}

/**
 * Check if origin is allowed
 * For now, all origins are allowed, but this could be extended with a whitelist
 */
export function isAllowedOrigin(origin: string): boolean {
    try {
        const url = new URL(origin);
        // Block local files and chrome extensions (except ourselves)
        if (url.protocol === 'file:' || (url.protocol === 'chrome-extension:' && !url.href.includes(chrome.runtime.id))) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Sanitize origin for display
 */
export function sanitizeOrigin(origin: string): string {
    try {
        const url = new URL(origin);
        return url.hostname;
    } catch {
        return origin;
    }
}
