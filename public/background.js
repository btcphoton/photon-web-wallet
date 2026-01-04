/**
 * Photon Wallet Background Service Worker
 * This script manages wallet state, handles requests from content scripts,
 * and coordinates user approval flows.
 */

// Connected dApps storage (origin -> { approved: boolean, timestamp: number })
const connectedDApps = new Map();

// Pending approval requests
const pendingApprovals = new Map();

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PHOTON_REQUEST') {
        handleRequest(message, sender).then(sendResponse);
        return true; // Keep channel open for async response
    }

    if (message.type === 'APPROVAL_RESPONSE') {
        handleApprovalResponse(message);
        return false;
    }
});

/**
 * Handle incoming requests from dApps
 */
async function handleRequest(message, sender) {
    const { method, params, origin, id } = message;

    try {
        switch (method) {
            case 'connect':
                return await handleConnect(origin, sender.tab);

            case 'disconnect':
                return await handleDisconnect(origin);

            case 'getAccounts':
                return await handleGetAccounts(origin);

            case 'getNetwork':
                return await handleGetNetwork(origin);

            case 'getBalance':
                return await handleGetBalance(origin);

            case 'signTransaction':
                return await handleSignTransaction(origin, params, sender.tab);

            case 'signMessage':
                return await handleSignMessage(origin, params, sender.tab);

            case 'sendTransaction':
                return await handleSendTransaction(origin, params, sender.tab);

            default:
                return { error: `Unknown method: ${method}` };
        }
    } catch (error) {
        console.error('Error handling request:', error);
        return { error: error.message || 'Unknown error' };
    }
}

/**
 * Handle connection request
 */
async function handleConnect(origin, tab) {
    console.log('handleConnect called for origin:', origin);

    // Check if already connected
    if (connectedDApps.has(origin)) {
        const connection = connectedDApps.get(origin);
        if (connection.approved) {
            const walletData = await getWalletData();
            console.log('Already connected, returning wallet data');
            return {
                result: {
                    address: walletData.address,
                    network: walletData.network,
                    connected: true
                }
            };
        }
    }

    // Request user approval
    console.log('Requesting user approval');
    const approval = await requestApproval({
        type: 'connect',
        origin,
        tabId: tab.id,
        data: {
            domain: new URL(origin).hostname
        }
    });

    console.log('Approval result:', approval);

    if (approval.approved) {
        // Store connection
        connectedDApps.set(origin, {
            approved: true,
            timestamp: Date.now()
        });

        const walletData = await getWalletData();

        // Notify content script
        notifyTab(tab.id, 'accountsChanged', [walletData.address]);

        return {
            result: {
                address: walletData.address,
                network: walletData.network,
                connected: true
            }
        };
    } else {
        console.log('User rejected connection, reason:', approval.reason);
        return { error: 'User rejected connection' };
    }
}

/**
 * Handle disconnection request
 */
async function handleDisconnect(origin) {
    connectedDApps.delete(origin);
    return { result: { success: true } };
}

/**
 * Handle get accounts request
 */
async function handleGetAccounts(origin) {
    // Check if connected
    if (!isConnected(origin)) {
        return { result: { accounts: [] } };
    }

    const walletData = await getWalletData();
    return {
        result: {
            accounts: [walletData.address]
        }
    };
}

/**
 * Handle get network request
 */
async function handleGetNetwork(origin) {
    const walletData = await getWalletData();
    return {
        result: {
            network: walletData.network || 'mainnet'
        }
    };
}

/**
 * Handle get balance request
 */
async function handleGetBalance(origin) {
    if (!isConnected(origin)) {
        return { error: 'Not connected. Please call connect() first.' };
    }

    const walletData = await getWalletData();
    return {
        result: {
            balance: walletData.balance || '0.00000000'
        }
    };
}

/**
 * Handle sign transaction request
 */
async function handleSignTransaction(origin, params, tab) {
    if (!isConnected(origin)) {
        return { error: 'Not connected. Please call connect() first.' };
    }

    // Request user approval
    const approval = await requestApproval({
        type: 'signTransaction',
        origin,
        tabId: tab.id,
        data: {
            domain: new URL(origin).hostname,
            to: params.to,
            amount: params.amount,
            fee: params.fee || 'Network fee will be calculated'
        }
    });

    if (approval.approved) {
        // TODO: Implement actual transaction signing using wallet utilities
        // For now, return a mock signed transaction
        return {
            result: {
                signedTx: 'mock_signed_transaction_hex'
            }
        };
    } else {
        return { error: 'User rejected transaction' };
    }
}

/**
 * Handle sign message request
 */
async function handleSignMessage(origin, params, tab) {
    if (!isConnected(origin)) {
        return { error: 'Not connected. Please call connect() first.' };
    }

    // Request user approval
    const approval = await requestApproval({
        type: 'signMessage',
        origin,
        tabId: tab.id,
        data: {
            domain: new URL(origin).hostname,
            message: params.message
        }
    });

    if (approval.approved) {
        // TODO: Implement actual message signing
        return {
            result: {
                signature: 'mock_signature'
            }
        };
    } else {
        return { error: 'User rejected signing' };
    }
}

/**
 * Handle send transaction request
 */
async function handleSendTransaction(origin, params, tab) {
    if (!isConnected(origin)) {
        return { error: 'Not connected. Please call connect() first.' };
    }

    // Request user approval
    const approval = await requestApproval({
        type: 'sendTransaction',
        origin,
        tabId: tab.id,
        data: {
            domain: new URL(origin).hostname,
            to: params.to,
            amount: params.amount,
            fee: params.fee || 'Network fee will be calculated'
        }
    });

    if (approval.approved) {
        // TODO: Implement actual transaction sending
        return {
            result: {
                txId: 'mock_transaction_id'
            }
        };
    } else {
        return { error: 'User rejected transaction' };
    }
}

/**
 * Request user approval via popup
 */
function requestApproval(requestData) {
    return new Promise((resolve) => {
        const approvalId = Date.now().toString();

        console.log('Creating approval request:', approvalId, requestData.type);

        // Store pending approval
        pendingApprovals.set(approvalId, { resolve, requestData });

        // Create approval popup
        const width = 400;
        const height = 600;

        chrome.windows.create({
            url: chrome.runtime.getURL(`approval.html?id=${approvalId}`),
            type: 'popup',
            width,
            height,
            
            
            focused: true
        }, (window) => {
            if (chrome.runtime.lastError) {
                console.error('Error creating approval window:', chrome.runtime.lastError);
                pendingApprovals.delete(approvalId);
                resolve({ approved: false, reason: 'popup_failed' });
                return;
            }

            if (!window) {
                console.error('No window created');
                pendingApprovals.delete(approvalId);
                resolve({ approved: false, reason: 'popup_failed' });
                return;
            }

            console.log('Approval window created:', window.id);

            // Listen for window close
            const onWindowRemoved = (windowId) => {
                if (windowId === window.id && pendingApprovals.has(approvalId)) {
                    console.log('Approval window closed without response');
                    pendingApprovals.delete(approvalId);
                    chrome.windows.onRemoved.removeListener(onWindowRemoved);
                    resolve({ approved: false, reason: 'window_closed' });
                }
            };

            chrome.windows.onRemoved.addListener(onWindowRemoved);
        });

        // Timeout after 5 minutes
        setTimeout(() => {
            if (pendingApprovals.has(approvalId)) {
                console.log('Approval request timeout:', approvalId);
                pendingApprovals.delete(approvalId);
                resolve({ approved: false, reason: 'timeout' });
            }
        }, 300000);
    });
}

/**
 * Handle approval response from popup
 */
function handleApprovalResponse(message) {
    const { approvalId, approved } = message;
    console.log('Received approval response:', approvalId, 'approved:', approved);

    const pending = pendingApprovals.get(approvalId);

    if (pending) {
        pendingApprovals.delete(approvalId);
        pending.resolve({ approved });
        console.log('Approval resolved successfully');
    } else {
        console.warn('No pending approval found for ID:', approvalId);
    }
}

/**
 * Get approval request data
 */
chrome.runtime.onConnect.addListener((port) => {
    console.log('Port connected:', port.name);

    if (port.name === 'approval') {
        port.onMessage.addListener((message) => {
            console.log('Approval port message:', message);

            if (message.type === 'GET_APPROVAL_DATA') {
                const pending = pendingApprovals.get(message.approvalId);
                if (pending) {
                    console.log('Sending approval data for:', message.approvalId);
                    port.postMessage({
                        type: 'APPROVAL_DATA',
                        data: pending.requestData
                    });
                } else {
                    console.warn('No pending approval found for ID:', message.approvalId);
                }
            }
        });
    }
});

/**
 * Check if origin is connected
 */
function isConnected(origin) {
    const connection = connectedDApps.get(origin);
    return connection && connection.approved;
}

/**
 * Get wallet data from storage
 */
async function getWalletData() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            'walletAddress',
            'selectedNetwork',
            'walletBalance'
        ], (result) => {
            console.log('Retrieved wallet data from storage:', {
                address: result.walletAddress ? 'present' : 'missing',
                network: result.selectedNetwork || 'none',
                balance: result.walletBalance || 'none'
            });
            resolve({
                address: result.walletAddress || '',
                network: result.selectedNetwork || 'mainnet',
                balance: result.walletBalance || '0.00000000'
            });
        });
    });
}

/**
 * Notify tab of event
 */
function notifyTab(tabId, event, data) {
    chrome.tabs.sendMessage(tabId, {
        type: 'PHOTON_EVENT',
        event,
        data
    }).catch(() => {
        // Tab might be closed
    });
}

/**
 * Notify all connected dApps of account change
 */
function notifyAccountChange(address) {
    connectedDApps.forEach((connection, origin) => {
        if (connection.approved) {
            chrome.tabs.query({ url: origin + '/*' }, (tabs) => {
                tabs.forEach(tab => {
                    notifyTab(tab.id, 'accountsChanged', [address]);
                });
            });
        }
    });
}

/**
 * Notify all connected dApps of network change
 */
function notifyNetworkChange(network) {
    connectedDApps.forEach((connection, origin) => {
        if (connection.approved) {
            chrome.tabs.query({ url: origin + '/*' }, (tabs) => {
                tabs.forEach(tab => {
                    notifyTab(tab.id, 'networkChanged', network);
                });
            });
        }
    });
}

// Listen for storage changes to notify dApps
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
        if (changes.walletAddress) {
            notifyAccountChange(changes.walletAddress.newValue);
        }
        if (changes.selectedNetwork) {
            notifyNetworkChange(changes.selectedNetwork.newValue);
        }
    }
});

console.log('Photon Wallet background service worker started');
