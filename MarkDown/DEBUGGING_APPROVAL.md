# Debugging the Approval Popup Issue

## Issue
Getting "User rejected the connection" error when trying to connect from a dApp.

## Changes Made
1. Added comprehensive logging throughout `background.js`
2. Fixed popup URL to use `chrome.runtime.getURL()`
3. Added error handling for window creation failures
4. Added window close detection

## How to Debug

### Step 1: Check Browser Console
Open Chrome DevTools for the **background page**:
1. Go to `chrome://extensions/`
2. Find "Photon Labs Wallet"
3. Click "service worker" link (under "Inspect views")
4. This opens the background script console

### Step 2: Check Logs When Connecting
When you click "Connect Wallet" on the test dApp, you should see these logs in the background console:

```
handleConnect called for origin: http://localhost:8000
Requesting user approval
Creating approval request: <timestamp> connect
Approval window created: <windowId>
```

If you see an error instead, note what it says.

### Step 3: Check if Popup Opens
- Does the approval popup window actually appear?
- If YES, but it's blank → issue with approval.html loading
- If NO → issue with popup creation (check for popup blocker)

### Step 4: Check Approval Popup Console
If the popup opens:
1. Right-click inside the popup window
2. Select "Inspect"
3. Check the Console tab for errors
4. You should see:
   - "Port connected: approval"
   - "Approval port message: {type: 'GET_APPROVAL_DATA', ...}"
   - "Sending approval data: <id>"

### Step 5: Common Issues

**Issue: Popup doesn't open**
- **Cause**: Popup blocker or permissions issue
- **Fix**: Check browser popup settings, ensure activeTab permission is granted

**Issue: Popup is blank**
- **Cause**: approval.html file not found or not copied to dist
- **Fix**: Check that `/dist/approval.html` and `/dist/approval.js` exist

**Issue: "No pending approval found"**
- **Cause**: Timing issue or popup opened too slowly
- **Fix**: Check if approvalId in URL matches what background script created

**Issue: Popup closes immediately**
- **Cause**: JavaScript error in approval.js
- **Fix**: Check approval popup console for errors

## Files to Check

1. **Dist folder**: Ensure these files exist:
   - `/dist/approval.html`
   - `/dist/approval.js`
   - `/dist/background.js`
   - `/dist/provider.js`
   - `/dist/content.js`

2. **manifest.json**: Ensure it's properly configured in `/dist/manifest.json`

## Manual Test in Background Console

You can manually test the approval flow by running this in the background console:

```javascript
// Test creating approval popup
chrome.windows.create({
  url: chrome.runtime.getURL('approval.html?id=test123'),
  type: 'popup',
  width: 400,
  height: 600,
  focused: true
}, (window) => {
  console.log('Test window created:', window);
  if (chrome.runtime.lastError) {
    console.error('Error:', chrome.runtime.lastError);
  }
});
```

This should open the approval popup. If it doesn't work, you'll see the error.

## Expected Result

When everything works correctly, the flow should be:
1. User clicks "Connect" on dApp
2. Background service worker creates approval popup
3. Popup loads and requests approval data
4. User clicks "Approve" or "Reject"
5. Popup sends response to background
6. Background resolves promise and returns result to dApp
7. dApp receives connection confirmation

## Next Steps After Debugging

Once you identify the specific error from the console logs, we can fix it. Common fixes:
- Adjust manifest permissions
- Fix file paths
- Handle async timing better
- Add retry logic for popup creation
