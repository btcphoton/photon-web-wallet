import { getStorageData } from './storage';

/**
 * RGB Allocation - represents an RGB asset allocation on a UTXO
 */
export interface RgbAllocation {
    assetId: string;      // RGB asset contract ID
    amount: bigint;       // Amount of the asset
    assetName?: string;   // Optional asset name
    ticker?: string;      // Optional asset ticker
}

/**
 * UTXO with RGB status information
 */
export interface UtxoWithRgbStatus {
    txid: string;
    vout: number;
    value: bigint;
    isOccupied: boolean;
    isLocked?: boolean; // Isolation Wall: Locked UTXOs cannot be spent as BTC fees
    account?: 'vanilla' | 'colored';
    chain?: 0 | 1;
    index?: number;
    rgbAllocations?: RgbAllocation[];
}

/**
 * Result of UTXO classification
 */
export interface ClassifiedUtxos {
    unoccupied: UtxoWithRgbStatus[];  // Bitcoin UTXOs available for RGB binding
    occupied: UtxoWithRgbStatus[];     // UTXOs with RGB assets bound
}

/**
 * RGB Proxy JSON-RPC request structure
 */
interface RgbProxyRequest {
    jsonrpc: '2.0';
    id: number | string;
    method: string;
    params?: any;
}

/**
 * RGB Proxy JSON-RPC response structure
 */
interface RgbProxyResponse<T = any> {
    jsonrpc: '2.0';
    id: number | string;
    result?: T;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

/**
 * Query RGB proxy server with JSON-RPC 2.0
 * 
 * @param method - RPC method name
 * @param params - Optional parameters for the method
 * @returns Response data or null on error
 */
export const queryRgbProxy = async <T = any>(
    method: string,
    params?: any
): Promise<T | null> => {
    try {
        // Get RGB proxy URL from storage
        const storage = await getStorageData(['rgbProxy']);
        const rgbProxyUrl = storage.rgbProxy || 'http://89.117.52.115:3000/json-rpc';

        // Construct JSON-RPC 2.0 request
        const request: RgbProxyRequest = {
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params: params || {}
        };

        console.log(`[RGB] Querying proxy: ${method}`, params);

        // Make HTTP request to RGB proxy
        const response = await fetch(rgbProxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            console.error(`[RGB] HTTP error: ${response.status} ${response.statusText}`);
            return null;
        }

        const data: RgbProxyResponse<T> = await response.json();

        // Check for JSON-RPC error
        if (data.error) {
            console.error(`[RGB] RPC error: ${data.error.message} (code: ${data.error.code})`);
            return null;
        }

        console.log(`[RGB] Response from ${method}:`, data.result);
        return data.result || null;
    } catch (error) {
        console.error(`[RGB] Query failed for ${method}:`, error);
        return null;
    }
};

/**
 * Check if a specific UTXO has RGB assets bound to it
 * 
 * @param txid - Transaction ID
 * @param vout - Output index
 * @returns RGB allocations if found, empty array if unoccupied, null on error
 */
export const checkUtxoRgbStatus = async (
    txid: string,
    vout: number
): Promise<RgbAllocation[] | null> => {
    try {
        // Query RGB proxy for allocations on this UTXO
        // Common RGB methods: 'rgb.outpoint_allocations', 'rgb.utxo_allocations', 'listAllocations'
        // We'll try multiple methods as different RGB implementations may vary

        const outpoint = `${txid}:${vout}`;

        // Try method 1: rgb.outpoint_allocations
        let allocations = await queryRgbProxy<any>('rgb.outpoint_allocations', {
            outpoint
        });

        // Try method 2: rgb.allocations if method 1 failed
        if (!allocations) {
            allocations = await queryRgbProxy<any>('rgb.allocations', {
                txid,
                vout
            });
        }

        // Try method 3: listAllocations (older RGB implementations)
        if (!allocations) {
            allocations = await queryRgbProxy<any>('listAllocations', {
                outpoint
            });
        }

        // If no allocations found or error, return empty array (unoccupied)
        if (!allocations || (Array.isArray(allocations) && allocations.length === 0)) {
            return [];
        }

        // Parse allocations into our format
        const rgbAllocations: RgbAllocation[] = [];

        // Handle different response formats
        if (Array.isArray(allocations)) {
            for (const alloc of allocations) {
                rgbAllocations.push({
                    assetId: alloc.assetId || alloc.asset_id || alloc.contractId || 'unknown',
                    amount: BigInt(alloc.amount || alloc.value || 0),
                    assetName: alloc.assetName || alloc.name,
                    ticker: alloc.ticker || alloc.symbol
                });
            }
        } else if (typeof allocations === 'object') {
            // Handle single allocation or object response
            rgbAllocations.push({
                assetId: allocations.assetId || allocations.asset_id || allocations.contractId || 'unknown',
                amount: BigInt(allocations.amount || allocations.value || 0),
                assetName: allocations.assetName || allocations.name,
                ticker: allocations.ticker || allocations.symbol
            });
        }

        return rgbAllocations;
    } catch (error) {
        console.error(`[RGB] Error checking UTXO ${txid}:${vout}:`, error);
        return null;
    }
};

/**
 * Classify an array of UTXOs into occupied and unoccupied categories
 * 
 * @param utxos - Array of UTXOs to classify
 * @returns Classified UTXOs split into occupied and unoccupied
 */
export const classifyUtxos = async (
    utxos: Array<{ txid: string; vout: number; value: bigint }>
): Promise<ClassifiedUtxos> => {
    const unoccupied: UtxoWithRgbStatus[] = [];
    const occupied: UtxoWithRgbStatus[] = [];

    console.log(`[RGB] Classifying ${utxos.length} UTXOs...`);

    // Check each UTXO for RGB allocations
    for (const utxo of utxos) {
        const rgbAllocations = await checkUtxoRgbStatus(utxo.txid, utxo.vout);

        // If error or null, treat as unoccupied (fail-safe)
        if (rgbAllocations === null) {
            console.warn(`[RGB] Error checking ${utxo.txid}:${utxo.vout}, treating as unoccupied`);
            unoccupied.push({
                ...utxo,
                isOccupied: false
            });
            continue;
        }

        // If allocations found, it's occupied
        if (rgbAllocations.length > 0) {
            console.log(`[RGB] ✓ Occupied: ${utxo.txid}:${utxo.vout} (${rgbAllocations.length} allocations)`);
            occupied.push({
                ...utxo,
                isOccupied: true,
                rgbAllocations
            });
        } else {
            console.log(`[RGB] ○ Unoccupied: ${utxo.txid}:${utxo.vout}`);
            unoccupied.push({
                ...utxo,
                isOccupied: false
            });
        }
    }

    console.log(`[RGB] Classification complete: ${unoccupied.length} unoccupied, ${occupied.length} occupied`);

    return { unoccupied, occupied };
};

/**
 * Check if RGB proxy is accessible
 * 
 * @returns true if proxy is accessible, false otherwise
 */
export const checkRgbProxyHealth = async (): Promise<boolean> => {
    try {
        // Try to get server info
        const info = await queryRgbProxy('server.info');
        return info !== null;
    } catch {
        return false;
    }
};
