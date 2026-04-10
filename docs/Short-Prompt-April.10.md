Work in this repo:

`/home/waheed/PhotonBoltXYZ/photon-web-wallet`

Act as an implementation-focused senior engineer. Read code first, then change code. Do not rely on assumptions.

## Read These First

- `src/App.tsx`
- `src/utils/storage.ts`
- `src/utils/backend-config.ts`
- `src/extension/background.ts`
- `src/extension/executors.ts`
- `vite.config.ts`
- `package.json`

## Repo Context

- This is a Vite + React + TypeScript wallet.
- It builds both a popup UI and a Chrome extension background script.
- The main app logic is concentrated in `src/App.tsx` and works like a wallet state machine, not a route-based app.
- Core domains are Bitcoin, RGB, Lightning/regtest, ICP/ckBTC, extension messaging, and network/backend switching.
- Storage behavior is critical and potentially migration-sensitive.

## Non-Negotiables

- Make the smallest safe change.
- Preserve storage compatibility unless migration is explicitly required.
- Preserve extension messaging and approval behavior unless the task is specifically about those flows.
- Treat regtest/public backend differences as intentional.
- Verify assumptions from source before editing.

## Watch Areas

- mnemonic/password handling
- per-network addresses and assets
- regtest backend profile selection
- Chrome extension provider methods
- RGB and Lightning invoice/payment flows

## Build / Verify

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`

## Expected Working Style

1. Summarize the relevant architecture for the task.
2. Name the exact files you will touch.
3. Implement the fix or feature with minimal surface area.
4. Call out risks or regressions.
5. State how to verify locally.

If the task is ambiguous, inspect the repo and choose the narrowest reasonable interpretation before asking questions.
