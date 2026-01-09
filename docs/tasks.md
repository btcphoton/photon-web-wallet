# Photon Wallet - Task List

This document tracks the completed and pending tasks for the Photon Wallet project.

## ✅ Completed Tasks

### Core Functionality & Security
- [x] **Bitcoin Transfer (Send/Receive)**: Implemented full flow for sending BTC with fee estimation, local/canister signing, and instant balance deduction.
- [x] **Internal Transfers (UTXO Management)**: Implemented logic to move BTC between internal accounts (e.g., to UTXO Holder for RGB fees).
- [x] **Discovery Scan with Gap Limit**: Implemented iterative scanning with a gap limit of 20 to find all funded addresses.
- [x] **Taproot Signing (BIP341/342)**: Fixed transaction signing logic for Taproot (BIP86) inputs.
- [x] **Secure Mnemonic Storage**: Migrated sensitive data to `chrome.storage.session` for enhanced security.
- [x] **Activity Balance Fix**: Implemented comprehensive change detection to accurately show "Send" amounts in transaction history.
- [x] **Package Rename Refactor**: Successfully renamed package from `net.photon` to `xyz.photonbolt`.

### UI & UX Enhancements
- [x] **UTXO Scroll UX**: Implemented a full-page vertical scroll experience for the RGB UTXOs page.
- [x] **Activities Redesign**: Grouped activities by date with new icons and formatted amounts.
- [x] **Faucet Modal Refinement**: Centered the Bitcoin TestNet Faucet modal and updated the emoji to 🚰.
- [x] **Recycle Bin Emoji**: Replaced "Clear All" button with 🗑️ in the TO-DO section.
- [x] **Metal Price Indicators**: Added Silver (USD/oz), 24k Gold (AED/g), and Silver (INR/kg) prices to the header.
- [x] **Active TO-DO Count**: Added a glowing gold superscript next to category names showing active items.
- [x] **Scrollbar Removal**: Removed visible vertical scrollbars while maintaining scrollability in the TO-DO list.

### Integration & Tools
- [x] **DApp Connector**: Initial implementation of the browser extension provider for dApp connections.
- [x] **Funded Addresses List**: Added a transparency view in the Admin section to show all addresses with balances.
- [x] **External Servers Documentation**: Created `docs/external-servers.md` to track all third-party API dependencies.

---

## 📋 To-Do / In-Progress Tasks

### ICP & Lightning Integration
- [ ] **Transition Data Storage**: Complete the transition of extension data storage from Chrome local storage to an Internet Computer (ICP) canister for decentralized storage.
- [ ] **Lightning BTC (ckBTC) Support**:
    - [ ] Implement `icrc1_balance_of` to fetch ckBTC/ckTESTBTC balances.
    - [ ] Add "Lightning BTC" asset to the Assets section with a custom logo (Lightning striking Bitcoin).
    - [ ] Implement LBTC to BTC conversion flow (Approval + Withdrawal via Minter).
- [ ] **Dynamic Canister Configuration**: Add settings to allow users to input custom MainNet and TestNet canister IDs, stored in Chrome storage.
- [ ] **Canister Wallet Address**: Implement `get_wallet_address` to fetch and store the canister-generated address.
- [ ] **Sync changeIndex to ICP canister**: Ensure the local `changeIndex` is synchronized with the ICP canister after updates.

### DApp Connector
- [ ] **Extended API Support**: Add more methods to the DApp provider API (e.g., `signMessage`, `getExtendedPublicKey`).
- [ ] **DApp Whitelisting**: Implement a permission system for dApps to request access to specific wallet features.

### Advanced Features
- [ ] **RGB Asset Management**: Further refine the display and management of RGB assets (Occupied UTXOs).
- [ ] **Mainnet Readiness**: Conduct thorough testing and security audits for Mainnet deployment.
- [ ] **Multi-Language Support**: Implement localization for different regions (e.g., UAE, India).

### Maintenance
- [ ] **Automated Testing**: Increase test coverage for core Bitcoin and RGB logic.
- [ ] **Performance Monitoring**: Monitor and optimize the speed of the discovery scan and activity fetching.
- [ ] **Unit Conversion Tools**: (Optional) Implement common physics, digital, and design unit converters as suggested in project notes.
