# External Servers Documentation

The Photon Labs Wallet application interacts with several external servers and services to provide blockchain connectivity, asset management, and real-time data.

## 1. Blockchain Data & Transaction Services
*   **Blockstream API**: 
    *   **Mainnet**: `https://blockstream.info/api`
    *   **Testnet**: `https://blockstream.info/testnet/api`
    *   **Purpose**: Used for fetching UTXOs (Unspent Transaction Outputs), checking address history, broadcasting signed transactions, and providing external links to transaction details.
*   **Mempool.space**:
    *   **Mainnet**: `https://mempool.space/api`
    *   **Testnet**: `https://mempool.space/testnet/api`
    *   **Purpose**: Primarily used for fetching Bitcoin transaction activities (history) for the wallet.
*   **Electrum Server**:
    *   **Default**: `ssl://electrum.iriswallet.com:50013`
    *   **Purpose**: Provides network connectivity and is configurable in the wallet settings for advanced users.

## 2. RGB Asset Management
*   **RGB Proxy**:
    *   **Default**: `http://89.117.52.115:3000/json-rpc`
    *   **Alternative**: `https://proxy.iriswallet.com/0.2/json-rpc`
    *   **Purpose**: Essential for RGB asset identification, issuance, and managing the "Isolation Wall" between regular Bitcoin and Colored (RGB) UTXOs.

## 3. Backend & Smart Contract Infrastructure
*   **Internet Computer (ICP)**:
    *   **Host**: `https://ic0.app`
    *   **Purpose**: The wallet interacts with various canisters on the Internet Computer for features like ckBTC (Chain-Key Bitcoin) management, wallet balance synchronization, and other decentralized backend logic.

## 4. Market Data & Utilities
*   **CoinGecko**:
    *   **Endpoint**: `https://api.coingecko.com/api/v3/simple/price`
    *   **Purpose**: Fetches the current Bitcoin price in USD to display the wallet balance's fiat value.
*   **Bitcoin Testnet Faucets**:
    *   **Links**: `ckboost.com`, `devwork.tech`, `coinfaucet.eu`
    *   **Purpose**: External links provided in the UI to help users acquire testnet Bitcoin for development and testing.

## 5. Official Branding & Documentation
*   **Photon Net**:
    *   **Domain**: `https://photonbolt.xyz`
    *   **Purpose**: Links to official resources for asset issuance and network information.
