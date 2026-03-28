/**
 * Photon Wallet Approval Popup Script
 * Handles user approval/rejection of dApp requests
 */

let approvalId = null;
let requestData = null;

// Get approval ID from URL
const urlParams = new URLSearchParams(window.location.search);
approvalId = urlParams.get('id');

if (!approvalId) {
    showError('Invalid approval request');
} else {
    // Connect to background script to get approval data
    const port = chrome.runtime.connect({ name: 'approval' });

    port.postMessage({
        type: 'GET_APPROVAL_DATA',
        approvalId: approvalId
    });

    port.onMessage.addListener((message) => {
        if (message.type === 'APPROVAL_DATA') {
            requestData = message.data;
            displayRequest(requestData);
        }
    });
}

/**
 * Display the approval request
 */
function displayRequest(data) {
    const container = document.getElementById('container');
    const actions = document.getElementById('actions');

    let content = '';

    switch (data.type) {
        case 'connect':
            content = renderConnectRequest(data.data);
            break;
        case 'signTransaction':
            content = renderSignTransactionRequest(data.data);
            break;
        case 'signMessage':
            content = renderSignMessageRequest(data.data);
            break;
        case 'sendTransaction':
            content = renderSendTransactionRequest(data.data);
            break;
        case 'sendBtcFunding':
            content = renderSendTransactionRequest(data.data, 'BTC Funding Approval', 'This will send Bitcoin from your wallet to fund a channel application.');
            break;
        default:
            content = renderGenericRequest(data);
    }

    container.innerHTML = content;
    actions.style.display = 'flex';

    // Attach event listeners
    document.getElementById('approveBtn').addEventListener('click', handleApprove);
    document.getElementById('rejectBtn').addEventListener('click', handleReject);
}

/**
 * Render connect request
 */
function renderConnectRequest(data) {
    return `
    <div class="approval-card">
      <div class="approval-type">Connection Request</div>
      <div class="domain-info">
        <div class="domain-label">Website requesting access:</div>
        <div class="domain-value">${escapeHtml(data.domain)}</div>
      </div>
      <div class="warning-box">
        <div class="warning-icon">⚠️</div>
        <div class="warning-text">
          This site is requesting access to view your wallet address and balance. 
          Only connect to websites you trust.
        </div>
      </div>
    </div>
    <div class="approval-card">
      <div class="details-label">Permissions requested:</div>
      <div class="detail-row">
        <div class="detail-label">Active address</div>
        <div class="detail-value">${escapeHtml(data.address || 'Unavailable')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Active network</div>
        <div class="detail-value">${escapeHtml(data.network || 'Unknown')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">View address</div>
        <div class="detail-value">✓</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">View balance</div>
        <div class="detail-value">✓</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Request transaction approvals</div>
        <div class="detail-value">✓</div>
      </div>
    </div>
  `;
}

/**
 * Render sign transaction request
 */
function renderSignTransactionRequest(data) {
    return `
    <div class="approval-card">
      <div class="approval-type">Sign Transaction</div>
      <div class="domain-info">
        <div class="domain-label">Requested by:</div>
        <div class="domain-value">${escapeHtml(data.domain)}</div>
      </div>
    </div>
    <div class="approval-card">
      <div class="details-label">Transaction Details:</div>
      <div class="detail-row">
        <div class="detail-label">Network</div>
        <div class="detail-value">${escapeHtml(data.network || 'Unknown')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">From</div>
        <div class="detail-value">${escapeHtml(data.from || 'Unavailable')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">To</div>
        <div class="detail-value">${escapeHtml(data.to)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Amount</div>
        <div class="detail-value">${escapeHtml(data.amountBtc || data.amount || '0')} BTC</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Amount (sats)</div>
        <div class="detail-value">${escapeHtml(data.amountSats || '0')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Fee Rate</div>
        <div class="detail-value">${escapeHtml(String(data.feeRate || ''))} sat/vB</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Estimated Fee</div>
        <div class="detail-value">${escapeHtml(data.feeBtc || '0')} BTC (${escapeHtml(data.feeSats || '0')} sats)</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Inputs</div>
        <div class="detail-value">${escapeHtml(String(data.inputs || '0'))}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Total Spend</div>
        <div class="detail-value">${escapeHtml(data.totalSpendBtc || '0')} BTC</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Change</div>
        <div class="detail-value">${escapeHtml(data.changeBtc || '0')} BTC</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Change Address</div>
        <div class="detail-value">${escapeHtml(data.changeAddress || 'No change output')}</div>
      </div>
      <div class="warning-box">
        <div class="warning-icon">⚠️</div>
        <div class="warning-text">
          Carefully review the transaction details before signing. 
          This action will create a signed transaction that can be broadcast to the network.
        </div>
      </div>
    </div>
  `;
}

/**
 * Render send transaction request
 */
function renderSendTransactionRequest(data, title = 'Send Transaction', warning = 'Important: This will immediately send Bitcoin from your wallet. Double-check the recipient address and amount before approving.') {
    return `
    <div class="approval-card">
      <div class="approval-type">${escapeHtml(title)}</div>
      <div class="domain-info">
        <div class="domain-label">Requested by:</div>
        <div class="domain-value">${escapeHtml(data.domain)}</div>
      </div>
    </div>
    <div class="approval-card">
      <div class="details-label">Transaction Details:</div>
      <div class="detail-row">
        <div class="detail-label">Network</div>
        <div class="detail-value">${escapeHtml(data.network || 'Unknown')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">From</div>
        <div class="detail-value">${escapeHtml(data.from || 'Unavailable')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">To</div>
        <div class="detail-value">${escapeHtml(data.to)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Amount</div>
        <div class="detail-value">${escapeHtml(data.amountBtc || data.amount || '0')} BTC</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Amount (sats)</div>
        <div class="detail-value">${escapeHtml(data.amountSats || '0')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Fee Rate</div>
        <div class="detail-value">${escapeHtml(String(data.feeRate || ''))} sat/vB</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Estimated Fee</div>
        <div class="detail-value">${escapeHtml(data.feeBtc || '0')} BTC (${escapeHtml(data.feeSats || '0')} sats)</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Inputs</div>
        <div class="detail-value">${escapeHtml(String(data.inputs || '0'))}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Total Spend</div>
        <div class="detail-value">${escapeHtml(data.totalSpendBtc || '0')} BTC</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Change</div>
        <div class="detail-value">${escapeHtml(data.changeBtc || '0')} BTC</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Change Address</div>
        <div class="detail-value">${escapeHtml(data.changeAddress || 'No change output')}</div>
      </div>
      <div class="warning-box">
        <div class="warning-icon">⚠️</div>
        <div class="warning-text">
          <strong>Important:</strong> ${escapeHtml(warning)}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render sign message request
 */
function renderSignMessageRequest(data) {
    return `
    <div class="approval-card">
      <div class="approval-type">Sign Message</div>
      <div class="domain-info">
        <div class="domain-label">Requested by:</div>
        <div class="domain-value">${escapeHtml(data.domain)}</div>
      </div>
    </div>
    <div class="approval-card">
      <div class="details-label">Signing Details:</div>
      <div class="detail-row">
        <div class="detail-label">Network</div>
        <div class="detail-value">${escapeHtml(data.network || 'Unknown')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Address</div>
        <div class="detail-value">${escapeHtml(data.address || 'Unavailable')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Signature Type</div>
        <div class="detail-value">${escapeHtml(data.signatureType || 'Unknown')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Message Size</div>
        <div class="detail-value">${escapeHtml(String(data.bytes || '0'))} bytes</div>
      </div>
      <div class="details-label">Message to sign:</div>
      <div class="message-box">${escapeHtml(data.message)}</div>
      <div class="warning-box">
        <div class="warning-icon">⚠️</div>
        <div class="warning-text">
          Signing this message proves you own this wallet address. 
          Only sign messages you understand and trust.
        </div>
      </div>
    </div>
  `;
}

/**
 * Render generic request
 */
function renderGenericRequest(data) {
    return `
    <div class="approval-card">
      <div class="approval-type">Approval Required</div>
      <div class="domain-info">
        <div class="domain-label">Request Type:</div>
        <div class="domain-value">${escapeHtml(data.type)}</div>
      </div>
      <div class="warning-box">
        <div class="warning-icon">⚠️</div>
        <div class="warning-text">
          This website is requesting an action from your wallet.
        </div>
      </div>
    </div>
  `;
}

/**
 * Handle approve button click
 */
function handleApprove() {
    sendResponse(true);
}

/**
 * Handle reject button click
 */
function handleReject() {
    sendResponse(false);
}

/**
 * Send response to background script
 */
function sendResponse(approved) {
    // Disable buttons
    document.getElementById('approveBtn').disabled = true;
    document.getElementById('rejectBtn').disabled = true;

    // Send response
    chrome.runtime.sendMessage({
        type: 'APPROVAL_RESPONSE',
        approvalId: approvalId,
        approved: approved
    });

    // Close popup after short delay
    setTimeout(() => {
        window.close();
    }, 300);
}

/**
 * Show error message
 */
function showError(message) {
    const container = document.getElementById('container');
    container.innerHTML = `
    <div class="approval-card">
      <div class="approval-type">Error</div>
      <div class="domain-info">
        <div class="domain-value">${escapeHtml(message)}</div>
      </div>
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        return String(unsafe);
    }
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
