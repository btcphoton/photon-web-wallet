export interface RgbWalletInvoiceResponse {
    recipient_id: string
    invoice: string
    expiration_timestamp?: number | null
    batch_transfer_idx: number
}

async function getRegtestRgbApiBase(): Promise<string> {
    const { resolveBitcoinApiBase } = await import('./backend-config')
    return await resolveBitcoinApiBase('regtest', 'address')
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
