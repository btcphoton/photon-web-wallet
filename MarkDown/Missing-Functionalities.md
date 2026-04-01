# Missing Functionalities: Design vs Current Code

This note compares:

- [Design.md](/home/waheed/PhotonBoltXYZ/photon-web-wallet/MarkDown/Design.md)
- [Design.mermaid](/home/waheed/PhotonBoltXYZ/photon-web-wallet/MarkDown/Design.mermaid)

against the current code in:

- `photon-web-wallet/src/App.tsx`
- `photon-web-wallet/src/utils/rgb-wallet.ts`
- `faucet/server.js`

This report is based on the code, not on `AGENTS.md`.

## Summary

The design files describe a cleaner RLN-to-RLN Lightning settlement story with explicit proof stages, proxy delivery, receiver validation, and final ownership confirmation.

The current implementation is more backend-driven:

1. The wallet talks only to the faucet backend.
2. The backend selects the RGB owner node or RGB Lightning node.
3. PostgreSQL is the source of wallet-scoped invoice, transfer, and balance history.
4. The wallet mostly renders backend-computed state.

Because of that, some parts of the design are implemented, some are only partial, and some are still missing.

## Implemented

These design-adjacent capabilities are already present in code.

### 1. Wallet-scoped PHO identity

Implemented:

1. The wallet builds a stable regtest key with `getRegtestWalletKey()`.
2. Requests include `x-photon-wallet-key`.
3. The backend scopes state through `ensureWallet(...)`.

What this gives today:

1. Per-wallet invoices
2. Per-wallet transfer history
3. Per-wallet balance tracking

### 2. RGB on-chain invoice creation

Implemented:

1. The wallet can create a PHO RGB invoice with `POST /api/rgb/invoice`.
2. The backend calls `/rgbinvoice` on the owner RGB node.
3. The backend rewrites transport endpoints to the public proxy endpoint.
4. The backend stores invoice and consignment-related metadata.

### 3. RGB on-chain PHO send

Implemented:

1. The wallet decodes RGB invoices with `POST /api/rgb/decode-invoice`.
2. The wallet sends PHO with `POST /api/rgb/send`.
3. The backend calls `/sendrgb`.
4. The backend stores wallet-relevant transfer rows in PostgreSQL.
5. The backend returns wallet-scoped balance data to the wallet.

### 4. Lightning invoice creation

Implemented:

1. The wallet can create a Lightning PHO invoice with `POST /api/rgb/ln-invoice`.
2. The backend switches that wallet to the Lightning-node account context.
3. The backend calls `/lninvoice`.
4. The backend decodes the result through `/decodelninvoice`.

### 5. Lightning PHO payment

Implemented:

1. The wallet decodes Lightning invoices with `POST /api/rgb/decode-lightning-invoice`.
2. The wallet pays Lightning invoices with `POST /api/rgb/pay-lightning`.
3. The backend calls `/sendpayment`.
4. The backend pulls `/listpayments`.
5. The backend stores outgoing Lightning transfers in `rgb_transfers`.
6. The backend returns Lightning balance fields to the wallet.

### 6. Wallet-scoped transfer history

Implemented:

1. The wallet calls `POST /api/rgb/transfers`.
2. The backend syncs asset and transfer rows.
3. The wallet renders sent and received activities from backend transfer data.
4. Lightning rows now show `Send Instantly` and `Receive Instantly`.

### 7. Backend-derived PHO balance

Implemented:

1. The backend derives wallet-scoped balance from stored transfers.
2. The backend can override with live Lightning `/assetbalance`.
3. The wallet uses:
   - `spendable`
   - `offchain_outbound`
   - `offchain_inbound`
   - lock states

### 8. Auto-recovery behavior around invoice creation and refresh

Implemented:

1. The backend retries `/rgbinvoice` after `/createutxos` if uncolored UTXOs are missing.
2. The wallet refreshes assets and activities after Lightning payment.
3. The wallet can mine a regtest block before refresh.

## Partially Implemented

These areas exist in code, but they do not yet match the full design intent.

### 1. Receiver identity model

Implemented:

1. Backend wallet scoping via `x-photon-wallet-key`
2. Wallet rows in PostgreSQL

Still incomplete:

1. This is backend-scoped identity, not a full user-owned RLN runtime model.
2. The extension does not directly operate a user node.

### 2. Consignment-related persistence

Implemented:

1. `rgb_invoices`
2. `consignment_records`
3. `reconcileWalletConsignmentSecrets(...)`

Still incomplete:

1. The Lightning payment path does not explicitly orchestrate consignment upload/fetch.
2. Receiver-side acknowledgment is not surfaced end-to-end.

### 3. Lightning settlement visibility

Implemented:

1. Payment status from `/sendpayment`
2. Payment lookup from `/listpayments`
3. Resulting liquidity values in the wallet

Still incomplete:

1. No staged UI for handshake, proof, validation, and final ownership.
2. Wallet history still shows the outcome, not the internal settlement path.

### 4. Anchor confirmation logic

Implemented:

1. The backend can inspect confirmations through `getAnchorConfirmations(...)`.
2. Derived balances can lock or unlock spendability based on confirmations.

Still incomplete:

1. This is not exposed as a dedicated Lightning settlement stage.
2. The wallet does not show anchor verification as a named step.

### 5. Proxy usage

Implemented:

1. RGB invoice endpoints are rewritten to the public RGB proxy.
2. Proxy endpoint data is stored in invoice and consignment records.

Still incomplete:

1. The Lightning payment path does not show explicit proxy upload/fetch orchestration.
2. Proxy delivery state is not exposed to the wallet UI.

## Missing

These are the main design expectations that are not explicitly implemented in the current application code.

### 1. Direct wallet-to-user-node runtime ownership

Missing:

1. A true user-owned RLN runtime controlled by the extension
2. Direct extension-to-user-node session logic
3. Code proving the wallet itself owns the PHO execution environment

### 2. Explicit peer-to-peer Lightning handshake flow

Missing:

1. App-level modeling of HTLC handshake phases
2. Explicit preimage/proof lifecycle in backend logic
3. Wallet-visible Lightning handshake progress

Note:

This may exist inside the node implementation, but it is not represented in the app code.

### 3. Explicit consignment upload and fetch flow in Lightning pay

Missing:

1. A backend step that uploads PHO consignment to the RGB proxy during `pay-lightning`
2. A backend step showing the receiver fetching and validating that consignment
3. Delivery success/failure state for that proof path

### 4. Receiver-side `LightningReceive` settlement pipeline

Missing:

1. Clear receive-side orchestration after invoice payment
2. Wallet-visible receive-side validation states
3. UI confirmation that received PHO became usable because proof processing completed

### 5. ACK/NACK or receiver acceptance flow

Missing:

1. Public API support for explicit receiver acknowledgment
2. Wallet UI for ACK/NACK or proof acceptance
3. Transfer-history display of receiver acknowledgment stages

### 6. Explicit Lightning proof chain object

Missing:

1. A single app-level workflow linking:
   - payment success
   - consignment proof
   - receiver validation
   - ownership confirmation
2. A structured proof object or lifecycle state machine for PHO Lightning transfers

### 7. Failure handling for intermediate Lightning proof stages

Missing:

1. Retry logic tied to proxy delivery
2. Retry logic tied to receiver validation
3. User-facing diagnostics showing exactly where a PHO Lightning transfer is stuck

### 8. Dedicated transfer orchestration module

Missing:

1. A single PHO transfer state machine
2. A dedicated orchestration service matching the design stages
3. Cleaner boundaries between wallet UI, transfer orchestration, and persistence

### 9. Wallet UI for full consignment lifecycle

Missing:

1. Delivery status

### 10. Same-node wallets path

Missing:

1. A first-class transfer path for wallet-to-wallet sends where both wallets resolve to the same
   RGB Lightning node account ref
2. Backend logic that detects "same sender node" before calling `/sendpayment`
3. A transfer model that records same-node sends as internal wallet transfers rather than as normal
   Lightning payments
4. UI route messaging that distinguishes true Lightning from internal same-node settlement

Recommended plan:

1. Keep the current self-transfer rejection for real Lightning.
2. Before `pay-lightning` calls `/sendpayment`, resolve the receiver wallet for the stored invoice.
3. Compare sender `rgb_account_ref` and receiver `rgb_account_ref`.
4. If the refs differ, continue with normal Lightning flow.
5. If the refs match, switch to a backend-managed same-node wallets flow.
6. In that same-node flow:
   - validate invoice ownership and status
   - validate sender balance
   - create linked outgoing and incoming `rgb_transfers` rows
   - record `transfer_events`
   - derive updated sender and receiver balances
   - expose the result back to the wallet as `route: internal_same_node`

Why this is preferred over a middle node:

1. It avoids self-pay rejection without introducing a custodial relay hop.
2. It avoids a two-leg "payment A succeeds but payment B fails" failure mode.
3. It fits the current backend-centric architecture better than synthetic relay forwarding.
2. Validation status
3. Receiver confirmation
4. Proof completion state

### 10. Code-level HTTPS or Nginx transfer enforcement

Missing in application code:

1. Nginx-specific routing logic for the PHO transfer path
2. Backend-enforced HTTPS handling in `faucet/server.js`
3. Wallet-side transport validation specific to PHO transfer flows

This may exist in deployment, but it is not represented in the code compared here.

## Recommended Next Build Order

If the goal is to move the implementation closer to the design, this is the pragmatic build order.

### 1. Add explicit Lightning settlement stages in the backend

Build:

1. A structured transfer lifecycle for Lightning PHO payments
2. States such as:
   - invoice decoded
   - payment sent
   - payment succeeded
   - consignment delivered
   - consignment validated
   - anchor verified
   - settled

Why first:

1. Without explicit stages, the rest of the design cannot be surfaced correctly in the wallet.

### 2. Implement explicit consignment proxy orchestration for `pay-lightning`

Build:

1. Proxy upload step
2. Proxy fetch or validation step
3. Delivery status persistence
4. Retry and failure handling

Why second:

1. This is one of the biggest design-to-code gaps.
2. It turns the current payment result into an actual proof-delivery flow.

### 3. Add receiver-side `LightningReceive` processing

Build:

1. Receive-side settlement refresh and validation flow
2. `LightningReceive` storage and state progression
3. Receiver-side usability confirmation

Why third:

1. The design assumes both sender and receiver complete the flow.
2. The current code is much stronger on the outgoing path than the incoming one.

### 4. Expose ACK/NACK or receiver validation APIs

Build:

1. Public backend endpoints for acknowledgment
2. Stored acknowledgment state
3. Wallet-facing display of receiver acceptance

Why fourth:

1. This closes the proof chain and makes the settlement lifecycle explicit.

### 5. Add wallet UI for intermediate settlement stages

Build:

1. A detailed transfer timeline view
2. Status chips for:
   - payment
   - proxy
   - validation
   - anchor
   - final settlement

Why fifth:

1. The backend must expose real stages before the UI can show them cleanly.

### 6. Refactor into a dedicated PHO transfer orchestration module

Build:

1. A clearer backend service or state machine for PHO Lightning transfer lifecycle
2. Fewer scattered transfer rules across handlers

Why sixth:

1. It will make the implementation easier to maintain once the missing stages are added.

### 7. Revisit infrastructure assumptions

Build or confirm:

1. Nginx routing behavior
2. HTTPS enforcement
3. deployment-level proof transport assumptions

Why last:

1. These matter, but they are lower priority than missing functional settlement logic in the app itself.

## Bottom Line

The current code already supports:

1. wallet-scoped PHO identity
2. RGB invoice creation
3. RGB on-chain PHO send
4. Lightning PHO invoice creation
5. Lightning PHO payment
6. backend-scoped transfer persistence
7. balance and history refresh

What is still missing relative to the design is the full explicit proof-and-settlement pipeline:

1. visible Lightning handshake stages
2. explicit proxy proof delivery during Lightning payment
3. receiver-side proof acceptance and completion
4. explicit anchor verification stage in the wallet-visible lifecycle
5. a staged transfer state machine that matches the design
