# Photon Labs Wallet - Implementation Summary

This document summarizes the key features and security enhancements implemented in the Photon Labs Wallet.

## 1. Discovery Scan with Gap Limit Rule
*   **Mechanism**: Implemented an iterative scanning process in `src/utils/bitcoin-transactions.ts`.
*   **Gap Limit**: Set to **20**, meaning the scan continues until 20 consecutive unused addresses are found across all four chains (Vanilla External/Internal, Colored External/Internal).
*   **Index Persistence**: The wallet integrates and updates the `addressIndex` in Chrome storage to ensure robust address discovery across sessions.

## 2. Security & Verification Fixes
*   **Taproot Signing (BIP341/342)**: Fixed the transaction signing logic to correctly tweak private keys using `TapTweak` tagged hashes before signing Taproot (BIP86) inputs.
*   **Secure Mnemonic Storage**: 
    *   Sensitive data (`mnemonic`, `walletPassword`) is now stored in `chrome.storage.session`.
    *   Data is proactively moved from persistent local storage to session-only storage upon wallet unlock or creation.
    *   Ensures sensitive information is cleared when the browser session ends.

## 3. Funded Addresses Display (Admin Section)
*   **Transparency**: Added a "Funded Addresses Found" list to the Network Settings (Admin) section.
*   **Details**: Displays the address index, chain type (External/Internal), the address itself, and the balance in BTC for all "Vanilla" addresses found during the discovery scan.

## 4. Activity Balance Fix (Comprehensive Change Detection)
*   **Problem**: "Send" transactions previously showed the total input balance instead of the actual amount sent.
*   **Solution**: 
    *   Updated `performDiscoveryScan` to return *all* scanned addresses (up to the gap limit).
    *   These addresses are persisted in storage and used by `fetchBtcActivities` to identify change.
    *   The activities list is refreshed immediately after a discovery scan to ensure accuracy.
*   **Result**: Transaction history now accurately reflects the amount sent to the recipient plus the network fee.

## 5. External Servers Documentation
*   **File**: `docs/external-servers.md`
*   **Content**: Detailed documentation of all external APIs and servers used (Blockstream, Mempool.space, ICP, CoinGecko, etc.).
*   **Update**: Electrum Server updated to `ssl://electrum.iriswallet.com:50013`.
