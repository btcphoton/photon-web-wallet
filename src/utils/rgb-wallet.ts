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

export interface RgbInvoiceSecretRegistrationResponse {
    ok: true
    walletKey: string
    invoiceId?: string | null
    consignmentId?: string | null
    recipientId: string
    blindingSecretStatus: 'active'
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
}): Promise<RgbWalletInvoiceResponse> {
    const payload = {
        assetId: params.assetId || null,
        amount: params.amount || 0,
        openAmount: params.openAmount,
    }

    const apiBase = await getRegtestRgbApiBase()
    const response = await fetch(`${apiBase}/rgb/invoice`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
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
