You are joining an existing codebase at:

`/home/waheed/PhotonBoltXYZ/photon-web-wallet`

Your job is to act like a senior engineer working directly in this repo. Before making changes, inspect the codebase and confirm assumptions from source, not from memory.

## Project Summary

- This is a Vite + React + TypeScript wallet project.
- It builds both:
  - a popup-style React app from `index.html` / `src/main.tsx`
  - a Chrome extension background script from `src/extension/background.ts`
- The main UI logic is concentrated in a large stateful component at `src/App.tsx`.
- The app is not route-driven. It behaves more like a wallet state machine with many view modes.
- The wallet includes Bitcoin, RGB, Lightning/regtest, and ICP/ckBTC-related functionality.
- There is also a small separate subproject at `bitcoin-search/`, but the main product is the wallet in the repo root.

## Tech Stack

- React 19
- TypeScript
- Vite
- bitcoinjs-lib / bip32 / bip39 / tiny-secp256k1
- DFINITY agent/candid/identity/principal packages
- Vitest is installed
- Browser extension APIs via `chrome.*`

## Important Files To Read First

- `package.json`
- `vite.config.ts`
- `src/App.tsx`
- `src/utils/storage.ts`
- `src/utils/backend-config.ts`
- `src/extension/background.ts`
- `src/extension/executors.ts`
- `README.md`
- `docs/developer/README.md`

## Architecture Notes

### 1. UI

- `src/App.tsx` is the central app file and contains many wallet screens/views.
- Views include onboarding, unlock, dashboard, receive/send, settings, UTXO flows, RGB flows, faucet/regtest flows, error logs, and asset detail flows.
- Treat `App.tsx` as the current source of truth for user-facing wallet behavior.

### 2. Storage Model

- Storage is abstracted in `src/utils/storage.ts`.
- It uses `chrome.storage` in extension context and falls back to `localStorage` in regular browser/dev mode.
- The storage model is complex and includes:
  - wallet credentials
  - selected network
  - per-network addresses
  - per-network assets
  - RGB contract mappings
  - account-scoped and address-scoped regtest data
  - Prism auth tokens
- Be careful when changing storage keys or migration-sensitive behavior.

### 3. Network / Backend Configuration

- `src/utils/backend-config.ts` defines backend profiles and endpoint resolution.
- Main backend profile IDs:
  - `legacy-public`
  - `photon-dev-regtest`
- Regtest RGB backend mode:
  - `faucet`
  - `prism`
- Environment variables in `.env.example` control public vs Photon regtest defaults.

### 4. Extension API

- `src/extension/background.ts` exposes wallet-provider style methods over Chrome messaging.
- Supported methods include:
  - `connect`
  - `disconnect`
  - `getAccounts`
  - `getNetwork`
  - `getBalance`
  - `getAssets`
  - `getAssetBalance`
  - `importAsset`
  - `signTransaction`
  - `sendTransaction`
  - `sendBtcFunding`
  - `payRgbInvoice`
  - `signMessage`
  - WebLN methods such as `webln.enable`, `webln.getInfo`, `webln.makeInvoice`, `webln.sendPayment`, `webln.decodeInvoice`
- Approval flow and wallet execution logic live in `src/extension/executors.ts`.

### 5. Build Output

- `vite.config.ts` builds:
  - popup app from `index.html`
  - background script from `src/extension/background.ts`
- Output directory is `dist`
- Background output is emitted as `dist/background.js`
- Extension manifest is at `public/manifest.json`

## Repo-Specific Operational Details

- Local test wallet shortcuts depend on a local-only file:
  - `public/photonlabs.txt`
- Example file:
  - `public/photonlabs.example.txt`
- Endpoint overrides use:
  - `.env.example`
- Regtest script defaults live in:
  - `scripts/photon-regtest-defaults.sh`
- Audit script for hard-coded values:
  - `bash scripts/audit-hardcoded-values.sh`

## Working Rules

- Start by reading the files listed above.
- Do not assume the README fully describes the app; some of it is generic Vite template content.
- Prefer minimal, targeted changes.
- Preserve existing extension behavior and storage compatibility unless a change explicitly requires migration.
- Be careful around:
  - mnemonic/password storage logic
  - network-specific address derivation
  - regtest-vs-public endpoint resolution
  - extension approval and connection flows
  - RGB/Lightning invoice handling
- If a change affects wallet behavior, identify whether it impacts popup UI, extension background messaging, or both.
- If adding tests, inspect existing tests in `src/utils/*.test.ts` first.

## Useful Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`

## What I Want From You

1. First, summarize your understanding of this repo after reading the core files.
2. Identify the exact files relevant to the task you are working on.
3. Make the smallest safe change that solves the task.
4. Explain any risks, especially around storage, extension messaging, or network behavior.
5. If you change behavior, say how to verify it locally.

## Current Repo State

- Git working tree was clean when this prompt was prepared.

If the task I give you is ambiguous, inspect the code and infer the narrowest reasonable interpretation before asking questions.
