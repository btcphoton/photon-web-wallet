import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { deriveBitcoinAddress } from './bitcoin-address';

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

/**
 * Interface for UTXO
 */
export interface UTXO {
    txid: string;
    vout: number;
    value: number; // satoshis
    addressSource?: 'main' | 'utxo-holder' | 'dust-holder'; // Track which address this UTXO came from (legacy)
    account?: 'vanilla' | 'colored'; // Track which account this UTXO belongs to
    chain?: 0 | 1; // 0: external, 1: internal/change
    index?: number; // Address index
}

/**
 * Check if a Bitcoin address has any transaction history
 * 
 * @param address - Bitcoin address to check
 * @param network - Bitcoin network
 * @returns True if the address has history, false otherwise
 */
export const checkAddressHistory = async (
    address: string,
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet'
): Promise<boolean> => {
    const baseUrl = network === 'mainnet'
        ? 'https://blockstream.info/api'
        : 'https://blockstream.info/testnet/api';

    const response = await fetch(`${baseUrl}/address/${address}`);

    if (!response.ok) {
        if (response.status === 404) return false;
        throw new Error(`Failed to check address history: ${response.statusText}`);
    }

    const data = await response.json();
    const fundedCount = data.chain_stats?.funded_txo_count || 0;
    const mempoolCount = data.mempool_stats?.funded_txo_count || 0;

    return (fundedCount + mempoolCount) > 0;
};

/**
 * Fetch UTXOs from Blockstream API for a Bitcoin address
 * @param network - Bitcoin network
    * @returns Array of UTXOs
        */
export const fetchUTXOsFromBlockchain = async (
    address: string,
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet'
): Promise<UTXO[]> => {
    const baseUrl = network === 'mainnet'
        ? 'https://blockstream.info/api'
        : 'https://blockstream.info/testnet/api';

    const response = await fetch(`${baseUrl}/address/${address}/utxo`);

    if (!response.ok) {
        throw new Error(`Failed to fetch UTXOs: ${response.statusText}`);
    }

    const utxos = await response.json();

    // Transform to our UTXO interface
    return utxos.map((utxo: any) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value
    }));
};

/**
 * Fetch UTXOs from all three wallet addresses (Main, UTXO Holder, Dust Holder)
 * 
 * @param mainAddress - Main address (chain 0)
 * @param utxoHolderAddress - UTXO Holder address (chain 100)
 * @param dustHolderAddress - Dust Holder address (chain 999)
 * @param network - Bitcoin network
 * @returns Combined array of UTXOs from all addresses with source tracking
 */
export const fetchUTXOsFromAllAddresses = async (
    mainAddress: string,
    utxoHolderAddress: string,
    dustHolderAddress: string,
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet'
): Promise<UTXO[]> => {
    console.log('[Multi-Address] Fetching UTXOs from all three addresses...');

    // Fetch UTXOs from all three addresses in parallel
    const [mainUtxos, utxoHolderUtxos, dustHolderUtxos] = await Promise.all([
        fetchUTXOsFromBlockchain(mainAddress, network),
        fetchUTXOsFromBlockchain(utxoHolderAddress, network),
        fetchUTXOsFromBlockchain(dustHolderAddress, network)
    ]);

    // Tag UTXOs with their source address
    const taggedMainUtxos = mainUtxos.map(utxo => ({ ...utxo, addressSource: 'main' as const }));
    const taggedUtxoHolderUtxos = utxoHolderUtxos.map(utxo => ({ ...utxo, addressSource: 'utxo-holder' as const }));
    const taggedDustHolderUtxos = dustHolderUtxos.map(utxo => ({ ...utxo, addressSource: 'dust-holder' as const }));

    console.log(`[Multi-Address] Found ${mainUtxos.length} UTXOs in Main, ${utxoHolderUtxos.length} in UTXO Holder, ${dustHolderUtxos.length} in Dust Holder`);

    // Combine all UTXOs
    return [...taggedMainUtxos, ...taggedUtxoHolderUtxos, ...taggedDustHolderUtxos];
};

/**
 * Sign and create a Bitcoin transaction locally (for Bitcoin mode)
 * 
 * @param mnemonic - User's mnemonic phrase
 * @param utxos - Available UTXOs to spend
 * @param toAddress - Destination Bitcoin address
 * @param amountToSend - Amount to send in satoshis
 * @param feeRate - Fee rate in satoshis per vbyte
 * @param network - Bitcoin network
 * @returns Transaction hex ready for broadcasting
 */
export const signAndBroadcastTransaction = async (
    mnemonic: string,
    utxos: UTXO[],
    toAddress: string,
    amountToSend: number,
    feeRate: number = 3,
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet',
    changeIndex: number = 0
): Promise<string> => {
    // Isolation Wall: Filter for Vanilla UTXOs only
    const vanillaUtxos = utxos.filter(u => u.account === 'vanilla' || u.account === undefined); // undefined for backward compatibility

    if (vanillaUtxos.length === 0) {
        throw new Error('No Vanilla UTXOs available for spending');
    }

    // Determine Bitcoin network
    const btcNetwork = network === 'mainnet'
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    // Derive root from mnemonic
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const bip32 = BIP32Factory(ecc);
    const root = bip32.fromSeed(seed, btcNetwork);
    const coinType = network === 'mainnet' ? 0 : 1;

    // Create PSBT
    const psbt = new bitcoin.Psbt({ network: btcNetwork });

    // Calculate total input value and add inputs
    let totalInput = 0;
    for (const utxo of vanillaUtxos) {
        // Derive the specific private key for this UTXO
        // Default to m/86'/coinType'/0'/0/0 if not specified
        const accountIndex = 0; // Vanilla is always Account 0
        const chain = utxo.chain ?? 0;
        const index = utxo.index ?? 0;
        const path = `m/86'/${coinType}'/${accountIndex}'/${chain}/${index}`;

        const child = root.derivePath(path);
        if (!child.privateKey) throw new Error(`Failed to derive private key for path ${path}`);

        const internalPubkey = child.publicKey.slice(1, 33);
        const p2tr = bitcoin.payments.p2tr({
            internalPubkey,
            network: btcNetwork
        });

        if (!p2tr.output) throw new Error('Failed to generate payment output');

        psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo: {
                script: p2tr.output,
                value: BigInt(utxo.value),
            },
            tapInternalKey: internalPubkey,
        });
        totalInput += utxo.value;
    }

    // Add output for recipient
    psbt.addOutput({
        address: toAddress,
        value: BigInt(amountToSend),
    });

    // Estimate fee (simple estimation: inputs * 148 + outputs * 34 + 10)
    const estimatedSize = vanillaUtxos.length * 148 + 2 * 34 + 10;
    const estimatedFee = Math.ceil(estimatedSize * feeRate);

    // Calculate change
    const change = totalInput - amountToSend - estimatedFee;

    // Add change output if it's above dust threshold (546 sats)
    if (change > 546) {
        // Vanilla Change: Must be sent to the next available index on the m/86'/n'/0'/1/i path
        const changeAddress = await deriveBitcoinAddress(mnemonic, network, 86, 0, 1, changeIndex);

        psbt.addOutput({
            address: changeAddress,
            value: BigInt(change),
        });
        console.log(`[Transaction] Added Vanilla change output of ${change} sats to ${changeAddress}`);
    } else if (change < 0) {
        throw new Error(`Insufficient funds. Need ${amountToSend + estimatedFee} sats, have ${totalInput} sats`);
    }

    // Sign all inputs
    for (let i = 0; i < vanillaUtxos.length; i++) {
        const utxo = vanillaUtxos[i];
        const chain = utxo.chain ?? 0;
        const index = utxo.index ?? 0;
        const path = `m/86'/${coinType}'/0'/${chain}/${index}`;
        const child = root.derivePath(path);

        // Tweak the private key for Taproot (BIP86)
        const internalPubkey = child.publicKey.slice(1, 33);
        const tweakedChild = child.tweak(
            bitcoin.crypto.taggedHash('TapTweak', internalPubkey)
        );

        psbt.signInput(i, tweakedChild);
    }

    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    const txHex = psbt.extractTransaction().toHex();

    return txHex;
};

/**
 * Broadcast a signed transaction to the network
 * 
 * @param txHex - Transaction hex
 * @param network - Bitcoin network
 * @returns Transaction ID
 */
export const broadcastTransaction = async (
    txHex: string,
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet'
): Promise<string> => {
    // Use Blockstream API for broadcasting
    const baseUrl = network === 'mainnet'
        ? 'https://blockstream.info/api'
        : 'https://blockstream.info/testnet/api';

    const response = await fetch(`${baseUrl}/tx`, {
        method: 'POST',
        body: txHex,
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to broadcast transaction: ${error}`);
    }

    const txid = await response.text();
    return txid;
};

/**
 * Perform a discovery scan to find all UTXOs across external and internal chains
 * with a Gap Limit of 20.
 * 
 * @param mnemonic - User's mnemonic phrase
 * @param network - Bitcoin network
 * @param storedIndex - Current index from storage to ensure we scan at least this far
 * @returns Object containing total balance, all found UTXOs, max index, and funded addresses
 */
export const performDiscoveryScan = async (
    mnemonic: string,
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet',
    storedIndex: number = 0
): Promise<{
    totalBalance: number,
    utxos: UTXO[],
    maxIndex: number,
    fundedAddresses: { address: string, balance: number, account: 'vanilla' | 'colored', index: number, chain: 0 | 1 }[],
    allDiscoveredAddresses: string[]
}> => {
    console.log(`[DiscoveryScan] Starting iterative scan for ${network} with Gap Limit 20...`);

    const GAP_LIMIT = 20;
    const allUtxos: UTXO[] = [];
    const fundedAddresses: { address: string, balance: number, account: 'vanilla' | 'colored', index: number, chain: 0 | 1 }[] = [];
    const allDiscoveredAddresses: string[] = [];
    let maxIndexFound = storedIndex;

    // We scan 4 chains: 
    // 1. Vanilla External (Account 0, Chain 0)
    // 2. Vanilla Internal (Account 0, Chain 1)
    // 3. Colored External (Account 1, Chain 0)
    // 4. Colored Internal (Account 1, Chain 1)

    let currentIndex = 0;
    let consecutiveEmpty = 0;

    while (consecutiveEmpty < GAP_LIMIT || currentIndex <= storedIndex) {
        console.log(`[DiscoveryScan] Scanning index ${currentIndex}...`);

        const chainPromises = [
            // Vanilla External
            deriveBitcoinAddress(mnemonic, network, 86, 0, 0, currentIndex)
                .then(async addr => ({ addr, account: 'vanilla' as const, chain: 0 as const, hasHistory: await checkAddressHistory(addr, network) })),
            // Vanilla Internal
            deriveBitcoinAddress(mnemonic, network, 86, 0, 1, currentIndex)
                .then(async addr => ({ addr, account: 'vanilla' as const, chain: 1 as const, hasHistory: await checkAddressHistory(addr, network) })),
            // Colored External
            deriveBitcoinAddress(mnemonic, network, 86, 1, 0, currentIndex)
                .then(async addr => ({ addr, account: 'colored' as const, chain: 0 as const, hasHistory: await checkAddressHistory(addr, network) })),
            // Colored Internal
            deriveBitcoinAddress(mnemonic, network, 86, 1, 1, currentIndex)
                .then(async addr => ({ addr, account: 'colored' as const, chain: 1 as const, hasHistory: await checkAddressHistory(addr, network) }))
        ];

        const results = await Promise.all(chainPromises);

        // Track all addresses with history for change detection
        results.forEach(r => {
            if (r.hasHistory) {
                allDiscoveredAddresses.push(r.addr);
            }
        });

        const anyHistory = results.some(r => r.hasHistory);

        if (anyHistory) {
            consecutiveEmpty = 0;
            maxIndexFound = currentIndex;

            // If any history found, fetch UTXOs for all 4 addresses at this index
            const utxoPromises = results.map(async r => {
                const utxos = await fetchUTXOsFromBlockchain(r.addr, network);
                return utxos.map(u => ({
                    ...u,
                    account: r.account,
                    chain: r.chain,
                    index: currentIndex
                }));
            });

            const utxoResults = await Promise.all(utxoPromises);

            // Track funded addresses
            results.forEach((r, i) => {
                const addressUtxos = utxoResults[i];
                const balance = addressUtxos.reduce((sum, u) => sum + u.value, 0);
                if (balance > 0) {
                    fundedAddresses.push({
                        address: r.addr,
                        balance: balance,
                        account: r.account,
                        index: currentIndex,
                        chain: r.chain
                    });
                }
            });

            allUtxos.push(...utxoResults.flat());
        } else {
            consecutiveEmpty++;
        }

        currentIndex++;

        // Safety break to prevent infinite loops in case of API issues
        if (currentIndex > 1000) {
            console.warn('[DiscoveryScan] Safety limit reached (1000). Stopping scan.');
            break;
        }
    }

    // Isolation Wall: Sum only UTXOs from the Vanilla account
    const vanillaBalance = allUtxos
        .filter(u => u.account === 'vanilla')
        .reduce((sum, utxo) => sum + utxo.value, 0);

    console.log(`[DiscoveryScan] Scan complete. Max index found: ${maxIndexFound}`);
    console.log(`[DiscoveryScan] Found ${allUtxos.length} UTXOs total.`);
    console.log(`[DiscoveryScan] Vanilla Balance: ${vanillaBalance} sats`);

    return {
        totalBalance: vanillaBalance,
        utxos: allUtxos,
        maxIndex: maxIndexFound,
        fundedAddresses: fundedAddresses,
        allDiscoveredAddresses: allDiscoveredAddresses
    };
};
