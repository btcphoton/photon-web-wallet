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
    created_at?: string | null
    updated_at?: string | null
    settled_at?: string | null
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

export interface RgbWalletLightningInvoiceResponse {
    ok: true
    walletKey: string
    invoice: string
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

export interface RgbIssueAssetReadinessResponse {
    ok: true
    walletKey: string
    network: string
    nodeAccountRef: string
    utxoFundingAddress: string | null
    confirmedFundingSats: number
    confirmedUtxoCount: number
    freeSlotCount: number
    minimumFundingSats: number
    issuanceFundingReady: boolean
    channelFundingTiming: 'during_issuance' | 'after_issuance'
    requestedChannelFundingSats: number
    requiredFundingSats: number
    channelFundingReady: boolean
    channelFundingShortfallSats: number
    isReady: boolean
}

export interface RgbIssueAssetResponse {
    ok: true
    walletKey: string
    issuanceId: string
    asset: RgbRegistryAsset
    registryListed: boolean
    ownership?: {
        walletKey: string
        nodeAccountRef: string
        initialSupplyAssigned: string
    }
    bootstrapPlan?: {
        enabled: boolean
        liquidityPercentage: number | null
        reservedAssetAmount: number
        requestedChannelBtcSats: number | null
        channelFundingTiming: 'during_issuance' | 'after_issuance' | null
        lifecycleStatus: string
        channelApplicationId?: string | null
        channelId?: string | null
        error?: string | null
    }
}

export interface RgbChannelDashboardNode {
    nodeLabel: string
    accountRef: string
    peerPubkey?: string | null
    assetLocalAmount: number
    assetRemoteAmount: number
    outboundBalanceMsat: number
    inboundBalanceMsat: number
    nextOutboundHtlcLimitMsat: number
    ready: boolean
    isUsable: boolean
    status: string
}

export interface RgbChannelDashboardChannel {
    channelId: string
    assetId?: string | null
    assetName?: string | null
    assetTicker?: string | null
    status: string
    ready: boolean
    isUsable: boolean
    maxLocalAssetAmount: number
    maxRemoteAssetAmount: number
    totalAssetLiquidity: number
    nodes: RgbChannelDashboardNode[]
}

export interface RgbChannelDashboardResponse {
    ok: true
    refreshedAt: string
    channels: RgbChannelDashboardChannel[]
}

type RegtestRgbFeature =
    | 'health'
    | 'onchain invoice'
    | 'invoice secret registration'
    | 'balance lookup'
    | 'transfer lookup'
    | 'invoice decode'
    | 'onchain send'
    | 'lightning invoice decode'
    | 'lightning payment'
    | 'lightning invoice creation'
    | 'registry lookup'
    | 'channel dashboard'
    | 'issue asset readiness'
    | 'issue asset'
    | 'transfer refresh'
    | 'regtest mining'
    | 'UTXO funding address'
    | 'UTXO slot listing'
    | 'UTXO slot redeem';

async function getRegtestRgbBackend(_feature: RegtestRgbFeature): Promise<{
    apiBase: string
    mode: 'faucet' | 'prism'
    headers: Record<string, string>
}> {
    const { getRegtestRgbBackendConfig } = await import('./backend-config')
    const { getStorageData } = await import('./storage')
    const config = await getRegtestRgbBackendConfig()
    const headers: Record<string, string> = {}

    if (config.mode === 'prism') {
        const stored = await getStorageData(['mnemonic', 'selectedNetwork'])
        const mnemonic = stored.mnemonic
        if (!mnemonic) {
            throw new Error('Wallet is locked. Unlock the wallet to use Prism mode.')
        }
        const network = ((stored.selectedNetwork as string) || 'regtest') as import('./backend-config').WalletNetwork
        const { getValidAccessToken } = await import('./prism-auth')
        const accessToken = await getValidAccessToken(mnemonic, network, config.apiBase)
        headers.Authorization = `Bearer ${accessToken}`
    }

    return {
        apiBase: config.apiBase,
        mode: config.mode,
        headers,
    }
}

export async function checkLocalRgbNode(): Promise<boolean> {
    try {
        const { apiBase, mode, headers } = await getRegtestRgbBackend('health')
        const healthPath = mode === 'prism' ? '/health' : '/rgb/health'
        const response = await fetch(`${apiBase}${healthPath}`, { headers })
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

    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('onchain invoice')
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...baseHeaders,
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
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('invoice secret registration')
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...baseHeaders,
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
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('balance lookup')
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...baseHeaders,
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
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('transfer lookup')
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...baseHeaders,
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
    const { apiBase, headers } = await getRegtestRgbBackend('invoice decode')
    const response = await fetch(`${apiBase}/rgb/decode-invoice`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
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
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('onchain send')
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...baseHeaders,
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
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('lightning invoice decode')
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...baseHeaders,
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
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('lightning payment')
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...baseHeaders,
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

export async function createRegtestLightningInvoice(params: {
    assetId: string
    amount: number
    expirySec?: number
    amtMsat?: number
    walletKey?: string
}): Promise<RgbWalletLightningInvoiceResponse> {
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('lightning invoice creation')
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...baseHeaders,
    }

    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }

    const response = await fetch(`${apiBase}/rgb/ln-invoice`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            assetId: params.assetId,
            amount: params.amount,
            expirySec: params.expirySec ?? 420,
            amtMsat: params.amtMsat ?? 3000000,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Lightning invoice creation failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'Lightning invoice creation failed')
    }

    return data as RgbWalletLightningInvoiceResponse
}

export async function fetchRegtestRgbRegistry(): Promise<RgbRegistryAsset[]> {
    const { apiBase, headers } = await getRegtestRgbBackend('registry lookup')
    const response = await fetch(`${apiBase}/rgb/registry`, { headers })

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

export async function fetchRegtestChannelDashboard(): Promise<RgbChannelDashboardResponse> {
    const { apiBase, headers } = await getRegtestRgbBackend('channel dashboard')
    const response = await fetch(`${apiBase}/rgb/channel-dashboard`, { headers })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB channel dashboard lookup failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'RGB channel dashboard lookup failed')
    }

    return data as RgbChannelDashboardResponse
}

export async function fetchRegtestIssueAssetReadiness(params: {
    walletKey?: string
    channelFundingSats?: number | null
    channelFundingTiming?: 'during_issuance' | 'after_issuance'
}): Promise<RgbIssueAssetReadinessResponse> {
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('issue asset readiness')
    const headers: Record<string, string> = { ...baseHeaders }
    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }
    const query = new URLSearchParams()
    if (params.channelFundingSats && params.channelFundingSats > 0) {
        query.set('channelFundingSats', String(params.channelFundingSats))
    }
    if (params.channelFundingTiming) {
        query.set('channelFundingTiming', params.channelFundingTiming)
    }

    const response = await fetch(`${apiBase}/rgb/issue-asset-readiness${query.toString() ? `?${query.toString()}` : ''}`, {
        method: 'GET',
        headers,
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB asset issuance readiness failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'RGB asset issuance readiness failed')
    }

    return data as RgbIssueAssetReadinessResponse
}

export async function issueRegtestRgbAsset(params: {
    walletKey?: string
    name: string
    ticker: string
    precision: number
    totalSupply: number
    description?: string
    publicRegistry?: boolean
    bootstrapLightning?: boolean
    liquidityPercentage?: number | null
    channelFundingSats?: number | null
    channelFundingTiming?: 'during_issuance' | 'after_issuance'
}): Promise<RgbIssueAssetResponse> {
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('issue asset')
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...baseHeaders,
    }

    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }

    const response = await fetch(`${apiBase}/rgb/issue-asset`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            schema: 'NIA',
            name: params.name,
            ticker: params.ticker,
            precision: params.precision,
            totalSupply: params.totalSupply,
            description: params.description,
            publicRegistry: params.publicRegistry ?? true,
            bootstrapLightning: params.bootstrapLightning ?? false,
            liquidityPercentage: params.liquidityPercentage ?? null,
            channelFundingSats: params.channelFundingSats ?? null,
            channelFundingTiming: params.channelFundingTiming ?? 'after_issuance',
            network: 'regtest',
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB asset issuance failed with status ${response.status}`)
    }

    const data = await response.json()
    if (!data.ok) {
        throw new Error(data.error || 'RGB asset issuance failed')
    }

    return data as RgbIssueAssetResponse
}

export async function refreshRegtestRgbTransfers(params: {
    assetId: string
    walletKey?: string
}): Promise<void> {
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('transfer refresh')
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...baseHeaders,
    }

    if (params.walletKey) {
        headers['x-photon-wallet-key'] = params.walletKey
    }

    const response = await fetch(`${apiBase}/rgb/refresh`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            assetId: params.assetId,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `RGB refresh failed with status ${response.status}`)
    }
}

export async function mineRegtestBlocks(blocks: number = 1): Promise<void> {
    const { apiBase, headers } = await getRegtestRgbBackend('regtest mining')
    const response = await fetch(`${apiBase}/regtest/mine`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
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

// ─── UTXO Slot API ───────────────────────────────────────────────────────────

export interface UtxoFundingAddressResponse {
    ok: true
    fundingAddress: string
    expectedSats: number
    expectedBtc: string
    label: string
    walletKey: string
}

export type UtxoSlotState = 'FREE' | 'OCCUPIED' | 'EMPTY' | 'REDEEMED'

export interface UtxoSlot {
    id: string
    outpoint: string
    state: UtxoSlotState
    satsValue: number | null
    nodeAccountRef: string | null
    transferId: string | null
    invoiceId: string | null
    redeemedTxid: string | null
    createdAt: string
    updatedAt: string
    redeemedAt: string | null
}

export async function fetchUtxoFundingAddress(params: { walletKey: string }): Promise<UtxoFundingAddressResponse> {
    const { apiBase, headers } = await getRegtestRgbBackend('UTXO funding address')
    const response = await fetch(`${apiBase}/utxo/funding-address`, {
        method: 'GET',
        headers: { ...headers, 'x-photon-wallet-key': params.walletKey },
    })
    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Failed to fetch funding address (${response.status})`)
    }
    const data = await response.json()
    if (!data.ok) throw new Error(data.error || 'Failed to fetch funding address')
    return data as UtxoFundingAddressResponse
}

export async function fetchUtxoSlots(params: { walletKey: string }): Promise<UtxoSlot[]> {
    const { apiBase, headers } = await getRegtestRgbBackend('UTXO slot listing')
    const response = await fetch(`${apiBase}/utxo/slots`, {
        method: 'GET',
        headers: { ...headers, 'x-photon-wallet-key': params.walletKey },
    })
    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Failed to fetch UTXO slots (${response.status})`)
    }
    const data = await response.json()
    if (!data.ok) throw new Error(data.error || 'Failed to fetch UTXO slots')
    return (data.slots || []) as UtxoSlot[]
}

export async function redeemUtxoSlot(params: {
    walletKey: string
    slotId: string
    mainBtcAddress?: string
}): Promise<{ txid: string; sentSats: number; returnAddress: string }> {
    const { apiBase, headers } = await getRegtestRgbBackend('UTXO slot redeem')
    const response = await fetch(`${apiBase}/utxo/redeem`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
            'x-photon-wallet-key': params.walletKey,
        },
        body: JSON.stringify({
            slotId: params.slotId,
            mainBtcAddress: params.mainBtcAddress,
        }),
    })
    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Redeem failed (${response.status})`)
    }
    const data = await response.json()
    if (!data.ok) throw new Error(data.error || 'Redeem failed')
    return { txid: data.txid, sentSats: data.sentSats, returnAddress: data.returnAddress }
}
