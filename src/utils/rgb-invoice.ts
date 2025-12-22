/**
 * RGB Invoice Generation Utilities
 * 
 * Generates RGB invoices using Web Crypto API (browser-compatible)
 * Integrates with ICP canister for UTXO management and RGB Proxy for blinded UTXO registration
 */

export interface Utxo {
    txid: string
    vout: number
    value: bigint
}

export interface RgbInvoiceResult {
    invoice: string
    blindedUtxo: string
    salt: string
}

/**
 * Generate cryptographically secure 8-byte salt
 * @returns BigInt representation of the salt
 */
function generateSalt(): bigint {
    const saltArray = new Uint8Array(8)
    crypto.getRandomValues(saltArray)
    const dataView = new DataView(saltArray.buffer)
    return dataView.getBigUint64(0, false) // big-endian
}

/**
 * Generate SHA-256 hash and return as hex string
 * @param input - String to hash
 * @returns Hex string of the hash
 */
async function sha256Hex(input: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate blinded UTXO by hashing txid:vout:salt
 * @param txid - Transaction ID
 * @param vout - Output index
 * @param salt - Random salt
 * @returns Hex string of blinded UTXO
 */
async function generateBlindedUtxo(
    txid: string,
    vout: number,
    salt: bigint
): Promise<string> {
    const input = `${txid}:${vout}:${salt.toString()}`
    return await sha256Hex(input)
}

/**
 * Generate RGB Invoice URN
 * 
 * Format: urn:rgb:<contractId>/<amount>@<blindedUtxo>?transport=<encodedProxyUrl>
 * 
 * @param txid - Bitcoin TXID of the seal UTXO
 * @param vout - Output index of the UTXO
 * @param contractId - RGB Contract ID (e.g., "rgb:2ae...")
 * @param amount - Amount of the asset (use 0 for open amount)
 * @param proxyUrl - RGB Proxy URL (e.g., "http://89.117.52.115:3000/json-rpc")
 * @returns Invoice URN string, blinded UTXO, and salt
 */
export async function generateRgbInvoice(
    txid: string,
    vout: number,
    contractId: string,
    amount: number,
    proxyUrl: string
): Promise<RgbInvoiceResult> {
    // Generate random salt for blinding
    const salt = generateSalt()

    // Generate blinded UTXO
    const blindedUtxo = await generateBlindedUtxo(txid, vout, salt)

    // Format the invoice according to LNP/BP standards
    // Using RGB20 interface for fungible tokens
    const invoice = `urn:rgb:${contractId}/${amount}@${blindedUtxo}?transport=${encodeURIComponent(proxyUrl)}`

    return {
        invoice,
        blindedUtxo,
        salt: salt.toString()
    }
}

/**
 * Notify RGB Proxy about new blinded UTXO
 * 
 * @param proxyUrl - RGB Proxy URL
 * @param blindedUtxo - The blinded UTXO hash
 * @param contractId - RGB Contract ID
 * @param amount - Amount of the asset
 * @returns Response from RGB Proxy
 */
export async function notifyRgbProxy(
    proxyUrl: string,
    blindedUtxo: string,
    contractId: string,
    amount: number
): Promise<any> {
    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'register_blinded_utxo',
                params: {
                    blindedUtxo,
                    contractId,
                    amount
                },
                id: Date.now()
            })
        })

        if (!response.ok) {
            throw new Error(`RGB Proxy responded with status: ${response.status}`)
        }

        const data = await response.json()

        if (data.error) {
            throw new Error(`RGB Proxy error: ${data.error.message || JSON.stringify(data.error)}`)
        }

        return data.result
    } catch (error) {
        console.error('Error notifying RGB Proxy:', error)
        throw error
    }
}

/**
 * Validate RGB Proxy URL format
 * @param url - URL to validate
 * @returns true if valid
 */
export function isValidRgbProxyUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}
