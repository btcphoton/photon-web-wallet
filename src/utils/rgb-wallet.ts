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
    payment_hash?: string | null
    route?: string | null
    node_account_ref?: string | null
    lightning_invoice?: string | null
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
    | 'UTXO slot redeem'
    | 'Issue auth token'
    | 'List auth tokens'
    | 'Revoke auth token'
    | 'upload asset media';

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

// ─────────────────────────────────────────────────────────────────────────────
// Bearer token storage + auth header helpers
// ─────────────────────────────────────────────────────────────────────────────

const BEARER_TOKEN_STORAGE_KEY = 'photon_bearer_token'

async function getStoredBearerToken(): Promise<string | null> {
    try {
        const result = await chrome.storage.local.get(BEARER_TOKEN_STORAGE_KEY)
        const token = result[BEARER_TOKEN_STORAGE_KEY]
        return typeof token === 'string' && token.length === 64 ? token : null
    } catch {
        return null
    }
}

async function storeBearerToken(token: string): Promise<void> {
    try {
        await chrome.storage.local.set({ [BEARER_TOKEN_STORAGE_KEY]: token })
    } catch {}
}

async function clearBearerToken(): Promise<void> {
    try {
        await chrome.storage.local.remove(BEARER_TOKEN_STORAGE_KEY)
    } catch {}
}

/**
 * Returns the correct auth headers for a request:
 *   - Uses a stored bearer token if available
 *   - Issues a new token (via x-photon-wallet-key) and stores it if not
 *   - Falls back to x-photon-wallet-key if token issuance fails
 */
async function getAuthHeaders(
    walletKey: string,
    apiBase: string
): Promise<Record<string, string>> {
    if (!walletKey) return {}

    const stored = await getStoredBearerToken()
    if (stored) {
        return { Authorization: `Bearer ${stored}` }
    }

    // No stored token — issue one
    try {
        const resp = await fetch(`${apiBase}/api/wallet/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-photon-wallet-key': walletKey,
            },
            body: JSON.stringify({ label: 'extension' }),
        })
        if (resp.ok) {
            const data = await resp.json()
            if (data.ok && typeof data.token === 'string') {
                await storeBearerToken(data.token)
                return { Authorization: `Bearer ${data.token}` }
            }
        }
    } catch {}

    // Fallback — token issuance failed, use wallet key directly
    return { 'x-photon-wallet-key': walletKey }
}

/**
 * fetch wrapper that injects auth headers and retries once on 401
 * by rotating the bearer token.
 */
async function fetchWithAuth(
    url: string,
    init: RequestInit,
    walletKey: string,
    apiBase: string
): Promise<Response> {
    const doFetch = async () => {
        const authHeaders = await getAuthHeaders(walletKey, apiBase)
        return fetch(url, {
            ...init,
            headers: { ...(init.headers as Record<string, string> ?? {}), ...authHeaders },
        })
    }

    const res = await doFetch()
    if (res.status === 401) {
        await clearBearerToken()
        return doFetch()
    }
    return res
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
    const response = await fetchWithAuth(`${apiBase}/rgb/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: JSON.stringify(payload),
    }, params.walletKey || '', apiBase)

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
    const response = await fetchWithAuth(`${apiBase}/rgb/invoice/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: JSON.stringify({
            network: params.network || 'regtest',
            assetId: params.assetId,
            amount: params.amount,
            invoice: params.invoice,
            recipientId: params.recipientId,
            blindingSecret: params.blindingSecret,
        }),
    }, params.walletKey || '', apiBase)

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
    const response = await fetchWithAuth(`${apiBase}/rgb/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: JSON.stringify({ assetId: params.assetId }),
    }, params.walletKey || '', apiBase)

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
    const response = await fetchWithAuth(`${apiBase}/rgb/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: JSON.stringify({ assetId: params.assetId }),
    }, params.walletKey || '', apiBase)

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
    // Use the thin backend's /decode-invoice endpoint (rgb_lib direct parse,
    // no external RGB node hop, not subject to the faucet rate-limit zone).
    const { decodeRgbInvoiceDirect } = await import('./photon-api')
    const data = await decodeRgbInvoiceDirect(params.invoice)
    if (!data.ok) {
        throw new Error('RGB invoice decode failed')
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
    const response = await fetchWithAuth(`${apiBase}/rgb/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: JSON.stringify({
            invoice: params.invoice,
            feeRate: params.feeRate ?? 5,
            minConfirmations: params.minConfirmations ?? 1,
        }),
    }, params.walletKey || '', apiBase)

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
    const response = await fetchWithAuth(`${apiBase}/rgb/decode-lightning-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: JSON.stringify({ invoice: params.invoice }),
    }, params.walletKey || '', apiBase)

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
    const response = await fetchWithAuth(`${apiBase}/rgb/pay-lightning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: JSON.stringify({ invoice: params.invoice }),
    }, params.walletKey || '', apiBase)

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
    const response = await fetchWithAuth(`${apiBase}/rgb/ln-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: JSON.stringify({
            assetId: params.assetId,
            amount: params.amount,
            expirySec: params.expirySec ?? 420,
            amtMsat: params.amtMsat ?? 3000000,
        }),
    }, params.walletKey || '', apiBase)

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
    const query = new URLSearchParams()
    if (params.channelFundingSats && params.channelFundingSats > 0) {
        query.set('channelFundingSats', String(params.channelFundingSats))
    }
    if (params.channelFundingTiming) {
        query.set('channelFundingTiming', params.channelFundingTiming)
    }
    const response = await fetchWithAuth(
        `${apiBase}/rgb/issue-asset-readiness${query.toString() ? `?${query.toString()}` : ''}`,
        { method: 'GET', headers: { ...baseHeaders } },
        params.walletKey || '', apiBase
    )

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

export async function uploadRegtestRgbAssetMedia(params: {
    file: File
    walletKey?: string
}): Promise<{ digest: string }> {
    const { apiBase } = await getRegtestRgbBackend('upload asset media')
    const formData = new FormData()
    formData.append('file', params.file)
    // Do NOT set Content-Type — the browser sets it with the multipart boundary automatically.
    const response = await fetchWithAuth(`${apiBase}/rgb/upload-asset-media`, {
        method: 'POST',
        body: formData,
    }, params.walletKey || '', apiBase)
    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Asset media upload failed with status ${response.status}`)
    }
    const data = await response.json()
    if (!data.ok || typeof data.digest !== 'string') {
        throw new Error(data.error || 'Asset media upload did not return a digest')
    }
    return { digest: data.digest }
}

export async function issueRegtestRgbAsset(params: {
    walletKey?: string
    schema?: 'NIA' | 'CFA' | 'UDA'
    name: string
    ticker?: string
    precision?: number
    totalSupply?: number
    description?: string
    fileDigest?: string
    attachmentDigests?: string[]
    publicRegistry?: boolean
    bootstrapLightning?: boolean
    liquidityPercentage?: number | null
    channelFundingSats?: number | null
    channelFundingTiming?: 'during_issuance' | 'after_issuance'
}): Promise<RgbIssueAssetResponse> {
    const { apiBase, headers: baseHeaders } = await getRegtestRgbBackend('issue asset')
    const response = await fetchWithAuth(`${apiBase}/rgb/issue-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: JSON.stringify({
            schema: params.schema ?? 'NIA',
            name: params.name,
            ticker: params.ticker ?? '',
            precision: params.precision ?? 0,
            totalSupply: params.totalSupply ?? 1,
            description: params.description,
            ...(params.fileDigest ? { fileDigest: params.fileDigest } : {}),
            ...(params.attachmentDigests?.length ? { attachmentDigests: params.attachmentDigests } : {}),
            publicRegistry: params.publicRegistry ?? true,
            bootstrapLightning: params.bootstrapLightning ?? false,
            liquidityPercentage: params.liquidityPercentage ?? null,
            channelFundingSats: params.channelFundingSats ?? null,
            channelFundingTiming: params.channelFundingTiming ?? 'after_issuance',
            network: 'regtest',
        }),
    }, params.walletKey || '', apiBase)

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
    const response = await fetchWithAuth(`${apiBase}/rgb/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: JSON.stringify({ assetId: params.assetId }),
    }, params.walletKey || '', apiBase)

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
    const response = await fetchWithAuth(`${apiBase}/utxo/funding-address`, {
        method: 'GET',
        headers: { ...headers },
    }, params.walletKey, apiBase)
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
    const response = await fetchWithAuth(`${apiBase}/utxo/slots`, {
        method: 'GET',
        headers: { ...headers },
    }, params.walletKey, apiBase)
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
    const response = await fetchWithAuth(`${apiBase}/utxo/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
            slotId: params.slotId,
            mainBtcAddress: params.mainBtcAddress,
        }),
    }, params.walletKey, apiBase)
    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Redeem failed (${response.status})`)
    }
    const data = await response.json()
    if (!data.ok) throw new Error(data.error || 'Redeem failed')
    return { txid: data.txid, sentSats: data.sentSats, returnAddress: data.returnAddress }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet Auth Token helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface WalletAuthToken {
    id: string
    label: string | null
    scope: string[]
    tokenType: 'api_key' | 'session' | 'dev'
    expiresAt: string | null
    createdIp: string | null
    createdAt: string
    lastUsedAt: string | null
}

export interface IssueAuthTokenResponse extends WalletAuthToken {
    token: string   // raw token — shown ONCE, must be stored by the client
}

/**
 * Issue a new api_key token for `walletKey`.
 * Returns the raw token — it will NOT be returned again by any subsequent call.
 */
export async function issueWalletAuthToken(params: {
    walletKey: string
    label?: string
    scope?: string[]
    expiresInDays?: number
}): Promise<IssueAuthTokenResponse> {
    const { apiBase, headers } = await getRegtestRgbBackend('Issue auth token')
    const response = await fetch(`${apiBase}/wallet/auth/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
            'x-photon-wallet-key': params.walletKey,
        },
        body: JSON.stringify({
            label: params.label,
            scope: params.scope ?? [],
            expiresInDays: params.expiresInDays,
        }),
    })
    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Token issue failed (${response.status})`)
    }
    const data = await response.json()
    if (!data.ok) throw new Error(data.error || 'Token issue failed')
    return data as IssueAuthTokenResponse
}

/**
 * List all active tokens for `walletKey` (does not return raw tokens).
 */
export async function listWalletAuthTokens(params: {
    walletKey: string
}): Promise<WalletAuthToken[]> {
    const { apiBase, headers } = await getRegtestRgbBackend('List auth tokens')
    const response = await fetchWithAuth(`${apiBase}/wallet/auth/tokens`, {
        headers: { ...headers },
    }, params.walletKey, apiBase)
    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `List tokens failed (${response.status})`)
    }
    const data = await response.json()
    if (!data.ok) throw new Error(data.error || 'List tokens failed')
    return data.tokens as WalletAuthToken[]
}

/**
 * Revoke a specific token by ID. Must belong to `walletKey`.
 */
export async function revokeWalletAuthToken(params: {
    walletKey: string
    tokenId: string
}): Promise<void> {
    const { apiBase, headers } = await getRegtestRgbBackend('Revoke auth token')
    const response = await fetchWithAuth(`${apiBase}/wallet/auth/token/${params.tokenId}`, {
        method: 'DELETE',
        headers: { ...headers },
    }, params.walletKey, apiBase)
    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Revoke token failed (${response.status})`)
    }
    const data = await response.json()
    if (!data.ok) throw new Error(data.error || 'Revoke token failed')
}
