export interface RgbWalletInvoiceResponse {
    recipient_id: string
    invoice: string
    expiration_timestamp?: number | null
    batch_transfer_idx: number
}

export interface RgbWalletBalanceResponse {
    ok: true
    walletKey: string
    asset: {
        assetId: string
        ticker?: string | null
        name: string
        precision: number
    }
    balance: {
        settled: number | string
        future: number | string
        spendable: number | string
        offchain_outbound: number | string
        offchain_inbound: number | string
        locked_missing_secret?: number | string
        locked_unconfirmed?: number | string
        spendability_status?: string
    }
}

export interface RgbWalletTransfer {
    idx: number | null
    status: string
    kind: string
    direction?: string | null
    txid?: string | null
    recipient_id?: string | null
    receive_utxo?: string | null
    change_utxo?: string | null
    assignments?: Array<{
        type: string
        value: number | string
    }>
    requested_assignment?: {
        type: string
        value: number | string
    } | null
    metadata?: Record<string, unknown> | null
}

export interface DecodedRgbInvoice {
    recipient_id: string
    recipient_type?: string
    asset_schema?: string
    asset_id: string
    assignment?: {
        type: string
        value: number | string
    }
    network?: string
    expiration_timestamp?: number | null
    transport_endpoints?: string[]
}

export interface RgbWalletTransfersResponse {
    ok: true
    walletKey: string
    assetId: string
    balance: RgbWalletBalanceResponse['balance']
    transfers: RgbWalletTransfer[]
}

export interface RgbInvoiceSecretRegistrationResponse {
    ok: true
    walletKey: string
    invoiceId?: string | null
    consignmentId?: string | null
    recipientId: string
    blindingSecretStatus: 'active'
}

export interface RgbWalletDecodeInvoiceResponse {
    ok: true
    decoded: DecodedRgbInvoice
}

export interface DecodedLightningInvoice {
    amt_msat?: number | null
    expiry_sec: number
    timestamp: number
    asset_id?: string | null
    asset_amount?: number | null
    payment_hash: string
    payment_secret: string
    payee_pubkey?: string | null
    network: string
}

export interface RgbWalletDecodeLightningInvoiceResponse {
    ok: true
    walletKey: string
    decoded: DecodedLightningInvoice
}

export interface RgbWalletSendResponse {
    ok: true
    walletKey: string
    assetId: string
    txid?: string | null
    decoded: DecodedRgbInvoice
    balance: RgbWalletBalanceResponse['balance']
    transfer?: RgbWalletTransfer | null
}

export interface RgbWalletLightningPayResponse {
    ok: true
    walletKey: string
    assetId: string
    balance: RgbWalletBalanceResponse['balance']
    payment: {
        payment_hash?: string | null
        status: string
        asset_amount?: number | string | null
        amt_msat?: number | string | null
    }
    decoded: DecodedLightningInvoice
}

export interface RgbRegistryAsset {
    token_name: string
    ticker: string
    total_supply: string
    precision: number
    issuer_ref?: string | null
    creation_date?: string | null
    block_height?: string | null
    contract_id: string
    schema_id?: string | null
}

async function getRegtestRgbApiBase(): Promise<string> {
    const { PHOTON_REGTEST_API_BASE } = await import('./backend-config')
    return PHOTON_REGTEST_API_BASE
}

export async function checkLocalRgbNode(): Promise<boolean> {
    try {
        const apiBase = await getRegtestRgbApiBase()
        const response = await fetch(`${apiBase}/rgb/health`)
        return response.ok
    } catch {
        return false
    }
}

export async function createRegtestRgbInvoice(params: {
    assetId?: string
    amount?: number
    openAmount: boolean
    durationSeconds?: number
    walletKey?: string
}): Promise<RgbWalletInvoiceResponse> {
    const payload = {
        assetId: params.assetId || null,
        amount: params.amount || 0,
        openAmount: params.openAmount,
    }

    const apiBase = await getRegtestRgbApiBase()
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }

    const response = await fetch(`${apiBase}/rgb/invoice`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB wallet responded with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'RGB invoice generation failed')
    }

    return data as RgbWalletInvoiceResponse
}

export async function registerRgbInvoiceSecret(params: {
    walletKey?: string
    network?: string
    assetId: string
    amount: number
    invoice: string
    recipientId: string
    blindingSecret: string
}): Promise<RgbInvoiceSecretRegistrationResponse> {
    const apiBase = await getRegtestRgbApiBase()
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }

    const response = await fetch(`${apiBase}/rgb/invoice/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            network: params.network || 'regtest',
            assetId: params.assetId,
            amount: params.amount,
            invoice: params.invoice,
            recipientId: params.recipientId,
            blindingSecret: params.blindingSecret,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB invoice secret registration failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'RGB invoice secret registration failed')
    }

    return data as RgbInvoiceSecretRegistrationResponse
}

export async function fetchRegtestRgbBalance(params: {
    assetId: string
    walletKey?: string
}): Promise<RgbWalletBalanceResponse> {
    const apiBase = await getRegtestRgbApiBase()
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }

    const response = await fetch(`${apiBase}/rgb/balance`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            assetId: params.assetId,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB balance lookup failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'RGB balance lookup failed')
    }

    return data as RgbWalletBalanceResponse
}

export async function fetchRegtestRgbTransfers(params: {
    assetId: string
    walletKey?: string
}): Promise<RgbWalletTransfersResponse> {
    const apiBase = await getRegtestRgbApiBase()
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }

    const response = await fetch(`${apiBase}/rgb/transfers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            assetId: params.assetId,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB transfer lookup failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'RGB transfer lookup failed')
    }

    return data as RgbWalletTransfersResponse
}

export async function decodeRegtestRgbInvoice(params: {
    invoice: string
}): Promise<RgbWalletDecodeInvoiceResponse> {
    const apiBase = await getRegtestRgbApiBase()
    const response = await fetch(`${apiBase}/rgb/decode-invoice`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            invoice: params.invoice,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB invoice decode failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'RGB invoice decode failed')
    }

    return data as RgbWalletDecodeInvoiceResponse
}

export async function sendRegtestRgbInvoice(params: {
    invoice: string
    feeRate?: number
    minConfirmations?: number
    walletKey?: string
}): Promise<RgbWalletSendResponse> {
    const apiBase = await getRegtestRgbApiBase()
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }

    const response = await fetch(`${apiBase}/rgb/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            invoice: params.invoice,
            feeRate: params.feeRate ?? 5,
            minConfirmations: params.minConfirmations ?? 1,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB send failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'RGB send failed')
    }

    return data as RgbWalletSendResponse
}

export async function decodeRegtestLightningInvoice(params: {
    invoice: string
    walletKey?: string
}): Promise<RgbWalletDecodeLightningInvoiceResponse> {
    const apiBase = await getRegtestRgbApiBase()
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }

    const response = await fetch(`${apiBase}/rgb/decode-lightning-invoice`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            invoice: params.invoice,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Lightning invoice decode failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'Lightning invoice decode failed')
    }

    return data as RgbWalletDecodeLightningInvoiceResponse
}

export async function payRegtestLightningInvoice(params: {
    invoice: string
    walletKey?: string
}): Promise<RgbWalletLightningPayResponse> {
    const apiBase = await getRegtestRgbApiBase()
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }

    const response = await fetch(`${apiBase}/rgb/pay-lightning`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            invoice: params.invoice,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Lightning payment failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'Lightning payment failed')
    }

    return data as RgbWalletLightningPayResponse
}

export async function fetchRegtestRgbRegistry(): Promise<RgbRegistryAsset[]> {
    const apiBase = await getRegtestRgbApiBase()
    const response = await fetch(`${apiBase}/rgb/registry`)

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB registry lookup failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'RGB registry lookup failed')
    }

    return Array.isArray(data.assets) ? data.assets as RgbRegistryAsset[] : []
}

export async function mineRegtestBlocks(blocks: number = 1): Promise<void> {
    const apiBase = await getRegtestRgbApiBase()
    const response = await fetch(`${apiBase}/regtest/mine`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            blocks: Math.max(1, Math.trunc(blocks || 1)),
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Regtest mining failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'Regtest mining failed')
    }
}
