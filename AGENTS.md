# PhotonBolt Workspace Notes

Reference docs:

- Prolog: `https://docs.photonbolt.xyz/prolog/`
- Docs index: `https://docs.photonbolt.xyz/`

## Current Achieved State

### RGB / PHO

- RGB20/NIA-style `PHO` asset has been issued on regtest.
- PHO contract ID:
  - `rgb:2Mhfmuc0-BqWCUwP-kkJKF_V-F1~L4j6-A1_W6Yy-hK6Z~rA`
- PHO metadata:
  - Ticker: `PHO`
  - Name: `Photon Token`
  - Precision: `8`
  - Supply: `1000000`

### Wallet / Extension

- `photon-web-wallet` can import PHO on regtest.
- Add Assets flow is no longer a dead screen.
- PHO can be imported by:
  - `PHO`
  - `Photon`
  - `Photon Token`
  - the full contract ID
- Receive RGB invoice view was fixed so the QR code is visible in the extension popup.
- Wallet links were updated from `photon.net` to `photonbolt.xyz`.
- Regtest RGB balances are now fetched from the backend instead of always showing the hardcoded imported amount.
- `photon-web-wallet` changes were committed and pushed to:
  - repo: `photon-web-wallet`
  - branch: `main`
  - commit: `09061d2`

### Backend / RGB API

- Photon backend wraps the local RGB wallet runtime instead of relying on browser localhost access.
- Live RGB routes now include:
  - `GET /api/rgb/health`
  - `POST /api/rgb/invoice`
  - `POST /api/rgb/balance`
  - `POST /api/rgb/transfers`
  - `POST /api/rgb/refresh`
- Invoices are rewritten to use the public proxy endpoint:
  - `rpcs://dev-proxy.photonbolt.xyz/json-rpc`
- Backend automatically creates RGB UTXOs when invoice creation fails due to missing uncolored UTXOs.

### PostgreSQL

- PostgreSQL database created:
  - `photon_rgb_wallets`
- Initial migration applied:
  - `faucet/db/migrations/001_rgb_wallets.sql`
- Tables created:
  - `wallets`
  - `wallet_auth_tokens`
  - `wallet_assets`
  - `wallet_asset_balances`
  - `rgb_invoices`
  - `rgb_transfers`
  - `consignment_records`
  - `transfer_events`
  - `refresh_jobs`
- Faucet backend is now wired to PostgreSQL with:
  - `faucet/db.js`
  - `faucet/package.json`

### Transfer Settlement

- PHO transfer settlement on regtest was verified.
- Mining additional regtest blocks and calling `refreshtransfers` moved the previous `10 PHO` transfer from:
  - `WaitingConfirmations`
  - to `Settled`
- PHO became spendable again after confirmation and refresh.

### Scripts

- Mining helper:
  - `scripts/mine-regtest-block.sh`
- RGB settlement helper:
  - `scripts/settle-rgb-transfer.sh`

### Docs Added

- `docs/rgb-security.html`
- `docs/wallets.html`
- `docs/rgb-transfer.html`

## Important Current Limitation

- The backend currently acts as the effective RGB wallet owner for the regtest flow.
- The extension is a client of that backend, not yet an independent RGB wallet runtime.
- Receiver-side consignment storage design for scale is still a later task.
- Long-term storage options to evaluate later:
  - server database
  - ICP canisters
  - hybrid model

## Recommended Next Steps

1. Wire `photon-web-wallet` transfer history UI to `/api/rgb/transfers`.
2. Add authenticated wallet identity instead of simple dev wallet keys.
3. Persist invoice and transfer lifecycle more fully in PostgreSQL.
4. Implement full receiver-side consignment processing and ACK/NACK handling in the backend wallet service.
5. Harden RGB API auth, CORS, and rate limiting.
