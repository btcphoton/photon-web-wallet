# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Photon Labs Wallet is a Bitcoin/RGB asset cryptocurrency wallet built as both a Chrome Extension and a web app. It supports Bitcoin (Taproot/BIP86), RGB colored assets, Lightning via ckBTC, and Internet Computer (ICP) canister integration.

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # TypeScript check + Vite production build (outputs to dist/)
npm run lint      # ESLint static analysis
npm run preview   # Preview production build
```

**Testing:** Vitest is installed but has no npm script. Run tests directly:
```bash
npx vitest run src/utils/crypto.test.ts
npx vitest run src/utils/bitcoin-address.test.ts
npx vitest run src/utils/bitcoin-transactions.test.ts
```

## Architecture

### Chrome Extension Structure

The wallet ships as a Chrome extension. Key public/ files:
- `manifest.json` — Extension manifest (popup: `index.html`, service worker: `background.js`)
- `background.js` — Service worker handling extension lifecycle
- `content.js` — Content script injected into web pages
- `provider.js` — Web3-like provider exposed to dApps
- `approval.html` / `approval.js` — Popup shown when a dApp requests wallet access

### App Architecture (src/)

**Single monolithic component:** `App.tsx` (~6,300 lines) contains the entire UI using React hooks. There are no sub-pages or React Router — navigation is state-driven via a `View` union type with 22 distinct views organized into auth, dashboard, send, assets, and settings groups.

**State management:** All state lives in `App.tsx` with `useState`. Persistence is handled via `src/utils/storage.ts` which wraps Chrome's `chrome.storage.local` / `chrome.storage.session` APIs with localStorage fallback.

**Sensitive data rule:** Mnemonic and wallet password are stored exclusively in `chrome.storage.session` (cleared on browser close), never in local storage. On unlock, data is migrated from local to session storage.

### Utility Modules (src/utils/)

| File | Responsibility |
|------|---------------|
| `crypto.ts` | Mnemonic generation, Ed25519 ICP identity |
| `bitcoin-address.ts` | BIP86 Taproot address derivation |
| `bitcoin-transactions.ts` | TX construction, signing (BIP341/342 TapTweak), fee estimation, discovery scan |
| `utxoManager.ts` | UTXO tracking and management |
| `bitcoin-activities.ts` | Transaction history fetching |
| `rgb.ts` / `rgb-wallet.ts` / `rgb-fetcher.ts` / `rgb-invoice.ts` | RGB asset lifecycle |
| `icp.ts` / `icrc1.ts` / `ckbtc-withdrawal.ts` | ICP canister interactions, ckBTC, ICRC-1 |
| `storage.ts` | Chrome storage API + localStorage abstraction |
| `backend-config.ts` | Multi-backend server profile switching |
| `dapp-bridge.ts` | dApp bridge protocol |
| `error-logger.ts` | Centralized error logging |

### HD Wallet Account Structure

The wallet uses BIP86 (Taproot) with a specific account layout:
- **Account 0** — MainBalance: receives Bitcoin, holds primary balance
- **Account 1** — UTXOHolder: holds UTXOs allocated for RGB assets
- **Account 2** — DustHolder: holds small UTXOs

Each account has two chains: External (0, receiving addresses) and Internal (1, change addresses). Address discovery uses a **gap limit of 20** consecutive unused addresses.

### Network Support

Four Bitcoin networks: `mainnet`, `testnet3`, `testnet4`, `regtest`. Backend server profiles (Blockstream, Mempool.space, Electrum, RGB Proxy, ICP) are configurable per network via `backend-config.ts`.

### RGB "Isolation Wall"

RGB colored assets are bound to UTXOs in the UTXOHolder account. The wallet enforces strict separation so colored UTXOs are never accidentally spent as regular Bitcoin — this is the "Isolation Wall" concept central to the RGB design.

### Vite / Build Notes

- Node.js polyfills are required (buffer, stream, util, events, process, vm) via `vite-plugin-node-polyfills`
- WebAssembly support via `vite-plugin-wasm` and `vite-plugin-top-level-await`
- Output: `dist/` with `assets/[name].js` naming (required for Chrome extension compatibility)
- TypeScript strict mode is enabled; unused locals/parameters are errors

## Key External APIs

- **Blockstream** — UTXO fetching, transaction broadcast
- **Mempool.space** — Transaction history, fee estimation
- **Electrum** (`ssl://electrum.iriswallet.com:50013`) — Configurable network connectivity
- **RGB Proxy** (`http://89.117.52.115:3000/json-rpc`) — RGB asset management
- **ICP** (`https://ic0.app`) — ckBTC, canister interactions
- **CoinGecko** — BTC/USD price

## Debugging the Approval Popup

See `DEBUGGING_APPROVAL.md` for the full guide on the dApp approval flow (the popup that appears when a dApp requests wallet access).
