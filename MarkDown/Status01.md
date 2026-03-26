# Status 01

This workspace is a PhotonBolt web wallet setup with RGB asset support partially wired up and verified on `regtest`, specifically for the `PHO` token (`Photon Token`).

## Current State

- `PHO` already exists as an RGB20/NIA-style asset on regtest.
- The browser wallet can now import and display that asset.
- The extension UI has already had key fixes:
  - asset import works
  - receive invoice QR is visible
  - balances come from backend APIs instead of a hardcoded value
- The backend currently performs the real RGB wallet work.
  - This is the main architectural point.
  - The extension is not yet acting as a fully independent RGB wallet runtime.
- The backend exposes RGB endpoints for health, invoice creation, balances, transfers, and refresh.
- PostgreSQL has been added to persist wallet-related records and transfer lifecycle data.
- A full `PHO` transfer was tested through to settlement on regtest, including mining extra blocks and refreshing until the transfer became spendable again.

## Current Flow

1. The extension UI talks to the backend.
2. The backend controls RGB wallet operations.
3. PostgreSQL stores wallet and transfer state.
4. The regtest flow is working end-to-end for `PHO`, but only in this backend-managed model.

## Important Limitation

The main limitation called out in `AGENTS.md` is that custody and runtime are still backend-centered. The extension is a client, not yet the true wallet owner for RGB operations.

## Recommended Next Work

1. Wire transfer history UI to `/api/rgb/transfers`.
2. Add proper authenticated wallet identity.
3. Improve lifecycle persistence in PostgreSQL.
4. Build receiver-side consignment processing and ACK/NACK flow.
5. Harden auth, CORS, and rate limiting.
