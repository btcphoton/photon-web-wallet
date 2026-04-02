import {
  approveConnection,
  buildConnectApproval,
  executeSendTransaction,
  getRegtestExtensionWalletKey,
  importAssetForOrigin,
  getStoredAssetBalanceForOrigin,
  getStoredAssetsForOrigin,
  getLiveBalance,
  isConnectedOrigin,
  loadWalletContext,
  prepareTransaction,
  removeConnection,
  signMessageForOrigin,
  type ApprovalRequest,
  type ApprovalResult,
} from './executors'
import { decodeRegtestLightningInvoice, payRegtestLightningInvoice } from '../utils/rgb-wallet'

interface PendingApproval {
  resolve: (result: ApprovalResult) => void
  requestData: ApprovalRequest
}

const pendingApprovals = new Map<string, PendingApproval>()

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PHOTON_REQUEST') {
    handleRequest(message, sender)
      .then(sendResponse)
      .catch((error: Error) => sendResponse({ error: error.message || 'Unknown error' }))
    return true
  }

  if (message?.type === 'APPROVAL_RESPONSE') {
    handleApprovalResponse(message)
    return false
  }

  return false
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'approval') {
    return
  }

  port.onMessage.addListener((message) => {
    if (message?.type !== 'GET_APPROVAL_DATA') {
      return
    }

    const pending = pendingApprovals.get(message.approvalId)
    if (!pending) {
      return
    }

    port.postMessage({
      type: 'APPROVAL_DATA',
      data: pending.requestData,
    })
  })
})

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'local') {
    return
  }

  if (changes.walletAddress) {
    await notifyAllConnectedTabs('accountsChanged', changes.walletAddress.newValue ? [changes.walletAddress.newValue] : [])
  }

  if (changes.selectedNetwork) {
    await notifyAllConnectedTabs('networkChanged', changes.selectedNetwork.newValue)
  }
})

async function handleRequest(message: any, sender: chrome.runtime.MessageSender) {
  const method = typeof message.method === 'string' ? message.method : ''
  const origin = typeof message.origin === 'string' ? message.origin : ''
  const params = (message.params || {}) as Record<string, unknown>

  switch (method) {
    case 'connect':
      return handleConnect(origin, sender.tab?.id)
    case 'disconnect':
      return handleDisconnect(origin, sender.tab?.id)
    case 'getAccounts':
      return handleGetAccounts(origin)
    case 'getNetwork':
      return handleGetNetwork(origin)
    case 'getBalance':
      return handleGetBalance(origin)
    case 'getAssets':
      return handleGetAssets(origin)
    case 'getAssetBalance':
      return handleGetAssetBalance(origin, params)
    case 'importAsset':
      return handleImportAsset(origin, params)
    case 'signTransaction':
      return handleSignTransaction(origin, params, sender.tab?.id)
    case 'sendTransaction':
      return handleSendTransaction(origin, params, sender.tab?.id)
    case 'sendBtcFunding':
      return handleSendBtcFunding(origin, params, sender.tab?.id)
    case 'payRgbInvoice':
      return handlePayRgbInvoice(origin, params, sender.tab?.id)
    case 'signMessage':
      return handleSignMessage(origin, params, sender.tab?.id)
    default:
      return { error: `Unknown method: ${method}` }
  }
}

async function handleConnect(origin: string, tabId?: number) {
  if (await isConnectedOrigin(origin)) {
    const context = await loadWalletContext()
    await notifyOrigin(origin, 'accountsChanged', [context.address])
    await notifyOrigin(origin, 'networkChanged', context.network)
    return {
      result: {
        address: context.address,
        network: context.network,
        connected: true,
      },
    }
  }

  const approvalData = await buildConnectApproval(origin)
  const approval = await requestApproval({
    type: 'connect',
    origin,
    tabId,
    data: approvalData,
  })

  if (!approval.approved) {
    return { error: 'User rejected connection' }
  }

  const context = await loadWalletContext()
  await approveConnection(origin, context.network)
  await notifyOrigin(origin, 'accountsChanged', [context.address])
  await notifyOrigin(origin, 'networkChanged', context.network)

  return {
    result: {
      address: context.address,
      network: context.network,
      connected: true,
    },
  }
}

async function handleDisconnect(origin: string, tabId?: number) {
  await removeConnection(origin)
  await notifyTab(tabId, 'accountsChanged', [])
  await notifyTab(tabId, 'disconnect', { origin })
  return { result: { success: true } }
}

async function handleGetAccounts(origin: string) {
  if (!(await isConnectedOrigin(origin))) {
    return { result: { accounts: [] } }
  }

  const context = await loadWalletContext()
  return {
    result: {
      accounts: context.address ? [context.address] : [],
    },
  }
}

async function handleGetNetwork(origin: string) {
  if (!(await isConnectedOrigin(origin))) {
    return { error: 'Not connected. Please call connect() first.' }
  }

  const context = await loadWalletContext()
  return {
    result: {
      network: context.network,
    },
  }
}

async function handleGetBalance(origin: string) {
  const result = await getLiveBalance(origin)
  return {
    result: {
      balance: result.balance,
      network: result.network,
    },
  }
}

async function handleGetAssets(origin: string) {
  const result = await getStoredAssetsForOrigin(origin)
  return {
    result: {
      assets: result.assets,
      network: result.network,
    },
  }
}

async function handleGetAssetBalance(origin: string, params: Record<string, unknown>) {
  const assetId = typeof params.assetId === 'string' ? params.assetId : ''
  const result = await getStoredAssetBalanceForOrigin(origin, assetId)
  return {
    result: {
      assetId: result.assetId,
      balance: result.balance,
      asset: result.asset,
      network: result.network,
    },
  }
}

async function handleImportAsset(origin: string, params: Record<string, unknown>) {
  const result = await importAssetForOrigin(origin, params)
  return {
    result: {
      asset: result.asset,
      network: result.network,
      imported: result.imported,
      alreadyImported: result.alreadyImported,
    },
  }
}

async function handleSignTransaction(origin: string, params: Record<string, unknown>, tabId?: number) {
  const prepared = await prepareTransaction(origin, params)

  const approval = await requestApproval({
    type: 'signTransaction',
    origin,
    tabId,
    data: {
      domain: new URL(origin).hostname,
      origin,
      network: prepared.network,
      from: prepared.senderAddress,
      to: prepared.recipientAddress,
      amountBtc: prepared.amountBtc,
      amountSats: prepared.amountSats.toString(),
      feeRate: prepared.feeRate,
      feeBtc: prepared.estimatedFeeBtc,
      feeSats: String(prepared.estimatedFeeSats),
      totalSpendBtc: prepared.totalSpendBtc,
      totalSpendSats: prepared.totalSpendSats.toString(),
      inputs: prepared.inputCount,
      changeAddress: prepared.changeAddress,
      changeBtc: prepared.changeBtc,
      changeSats: prepared.changeSats.toString(),
    },
  })

  if (!approval.approved) {
    return { error: 'User rejected transaction signing' }
  }

  return {
    result: {
      signedTx: prepared.txHex,
      network: prepared.network,
      feeSats: prepared.estimatedFeeSats,
      feeBtc: prepared.estimatedFeeBtc,
      from: prepared.senderAddress,
      to: prepared.recipientAddress,
      amountSats: prepared.amountSats.toString(),
      amountBtc: prepared.amountBtc,
      totalSpendSats: prepared.totalSpendSats.toString(),
      totalSpendBtc: prepared.totalSpendBtc,
    },
  }
}

async function handleSendTransaction(origin: string, params: Record<string, unknown>, tabId?: number) {
  const prepared = await prepareTransaction(origin, params)

  const approval = await requestApproval({
    type: 'sendTransaction',
    origin,
    tabId,
    data: {
      domain: new URL(origin).hostname,
      origin,
      network: prepared.network,
      from: prepared.senderAddress,
      to: prepared.recipientAddress,
      amountBtc: prepared.amountBtc,
      amountSats: prepared.amountSats.toString(),
      feeRate: prepared.feeRate,
      feeBtc: prepared.estimatedFeeBtc,
      feeSats: String(prepared.estimatedFeeSats),
      totalSpendBtc: prepared.totalSpendBtc,
      totalSpendSats: prepared.totalSpendSats.toString(),
      inputs: prepared.inputCount,
      changeAddress: prepared.changeAddress,
      changeBtc: prepared.changeBtc,
      changeSats: prepared.changeSats.toString(),
    },
  })

  if (!approval.approved) {
    return { error: 'User rejected transaction' }
  }

  const { txId } = await executeSendTransaction(prepared)
  return {
    result: {
      txId,
      network: prepared.network,
      feeSats: prepared.estimatedFeeSats,
      feeBtc: prepared.estimatedFeeBtc,
      amountSats: prepared.amountSats.toString(),
      amountBtc: prepared.amountBtc,
      from: prepared.senderAddress,
      to: prepared.recipientAddress,
    },
  }
}

async function handleSendBtcFunding(origin: string, params: Record<string, unknown>, tabId?: number) {
  const prepared = await prepareTransaction(origin, params)

  const approval = await requestApproval({
    type: 'sendBtcFunding',
    origin,
    tabId,
    data: {
      domain: new URL(origin).hostname,
      origin,
      network: prepared.network,
      from: prepared.senderAddress,
      to: prepared.recipientAddress,
      amountBtc: prepared.amountBtc,
      amountSats: prepared.amountSats.toString(),
      feeRate: prepared.feeRate,
      feeBtc: prepared.estimatedFeeBtc,
      feeSats: String(prepared.estimatedFeeSats),
      totalSpendBtc: prepared.totalSpendBtc,
      totalSpendSats: prepared.totalSpendSats.toString(),
      inputs: prepared.inputCount,
      changeAddress: prepared.changeAddress,
      changeBtc: prepared.changeBtc,
      changeSats: prepared.changeSats.toString(),
      purpose: 'Channel Funding',
    },
  })

  if (!approval.approved) {
    return { error: 'User rejected BTC funding transaction' }
  }

  const { txId } = await executeSendTransaction(prepared)
  return {
    result: {
      txId,
      network: prepared.network,
      feeSats: prepared.estimatedFeeSats,
      feeBtc: prepared.estimatedFeeBtc,
      amountSats: prepared.amountSats.toString(),
      amountBtc: prepared.amountBtc,
      from: prepared.senderAddress,
      to: prepared.recipientAddress,
      purpose: 'channel_funding',
    },
  }
}

async function handlePayRgbInvoice(origin: string, params: Record<string, unknown>, tabId?: number) {
  if (!(await isConnectedOrigin(origin))) {
    return { error: 'Not connected. Please call connect() first.' }
  }

  const invoice = typeof params.invoice === 'string' ? params.invoice.trim() : ''
  if (!invoice) {
    return { error: 'invoice is required' }
  }

  const context = await loadWalletContext()
  if (context.network !== 'regtest') {
    return { error: 'payRgbInvoice is currently supported only on regtest.' }
  }

  const walletKey = await getRegtestExtensionWalletKey()
  const decoded = await decodeRegtestLightningInvoice({
    invoice,
    walletKey,
  })

  const approval = await requestApproval({
    type: 'payRgbInvoice',
    origin,
    tabId,
    data: {
      domain: new URL(origin).hostname,
      origin,
      network: context.network,
      address: context.address,
      invoice,
      assetId: decoded.decoded?.asset_id || '',
      assetAmount: decoded.decoded?.asset_amount ?? null,
      amtMsat: decoded.decoded?.amt_msat ?? null,
      expiry: decoded.decoded?.expiry_sec ?? null,
      purpose: 'RGB Liquidity Funding',
    },
  })

  if (!approval.approved) {
    return { error: 'User rejected RGB invoice payment' }
  }

  const result = await payRegtestLightningInvoice({
    invoice,
    walletKey,
  })

  return {
    result: {
      ok: true,
      assetId: result.assetId,
      balance: result.balance,
      payment: result.payment,
      decoded: result.decoded,
      walletKey,
    },
  }
}

async function handleSignMessage(origin: string, params: Record<string, unknown>, tabId?: number) {
  const message = typeof params.message === 'string' ? params.message : ''
  const context = await loadWalletContext()
  const approval = await requestApproval({
    type: 'signMessage',
    origin,
    tabId,
    data: {
      domain: new URL(origin).hostname,
      origin,
      network: context.network,
      address: context.address,
      message,
      bytes: new TextEncoder().encode(message).byteLength,
      signatureType: 'photon-schnorr-sha256-v1',
    },
  })

  if (!approval.approved) {
    return { error: 'User rejected message signing' }
  }

  const result = await signMessageForOrigin(origin, params)
  return { result }
}

function requestApproval(requestData: ApprovalRequest): Promise<ApprovalResult> {
  return new Promise((resolve) => {
    const approvalId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    pendingApprovals.set(approvalId, { resolve, requestData })

    chrome.windows.create(
      {
        url: chrome.runtime.getURL(`approval.html?id=${approvalId}`),
        type: 'popup',
        width: 420,
        height: 640,
        focused: true,
      },
      (windowInfo) => {
        if (chrome.runtime.lastError || !windowInfo) {
          pendingApprovals.delete(approvalId)
          resolve({ approved: false, reason: 'popup_failed' })
          return
        }

        const onWindowRemoved = (windowId: number) => {
          if (windowId !== windowInfo.id) {
            return
          }
          if (pendingApprovals.has(approvalId)) {
            pendingApprovals.delete(approvalId)
            resolve({ approved: false, reason: 'window_closed' })
          }
          chrome.windows.onRemoved.removeListener(onWindowRemoved)
        }

        chrome.windows.onRemoved.addListener(onWindowRemoved)
      },
    )

    setTimeout(() => {
      if (!pendingApprovals.has(approvalId)) {
        return
      }
      pendingApprovals.delete(approvalId)
      resolve({ approved: false, reason: 'timeout' })
    }, 300000)
  })
}

function handleApprovalResponse(message: any) {
  const pending = pendingApprovals.get(message.approvalId)
  if (!pending) {
    return
  }

  pendingApprovals.delete(message.approvalId)
  pending.resolve({ approved: Boolean(message.approved) })
}

async function notifyAllConnectedTabs(event: string, data: unknown) {
  const tabs = await chrome.tabs.query({})
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.url) {
        return
      }

      try {
        const origin = new URL(tab.url).origin
        if (await isConnectedOrigin(origin)) {
          await notifyTab(tab.id, event, data)
        }
      } catch {
        return
      }
    }),
  )
}

async function notifyOrigin(origin: string, event: string, data: unknown) {
  const tabs = await chrome.tabs.query({})
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.url) {
        return
      }

      try {
        if (new URL(tab.url).origin === origin) {
          await notifyTab(tab.id, event, data)
        }
      } catch {
        return
      }
    }),
  )
}

async function notifyTab(tabId: number | undefined, event: string, data: unknown) {
  if (!tabId) {
    return
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'PHOTON_EVENT',
      event,
      data,
    })
  } catch {
    return
  }
}
