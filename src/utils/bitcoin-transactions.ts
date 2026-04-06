import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { deriveBitcoinAddress, getBitcoinJsNetwork } from './bitcoin-address';
import { logError } from './error-logger';
import { resolveBitcoinApiBase, type WalletNetwork } from './backend-config';

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

/**
 * Estimate Bitcoin transaction fee in satoshis
 * 
 * @param inputsCount - Number of inputs
 * @param outputsCount - Number of outputs
 * @param feeRate - Fee rate in satoshis per vbyte
 * @returns Estimated fee in satoshis
 */
export const estimateFee = (inputsCount: number, outputsCount: number, feeRate: number): number => {
    const overhead = 10.5;
    const inputSize = 57.5;
    const outputSize = 43.0;

    const transactionSize = overhead + (inputsCount * inputSize) + (outputsCount * outputSize);
    return Math.ceil(transactionSize * feeRate);
};

/**
 * Fetch live recommended fees from mempool.space
 * 
 * @param network - Bitcoin network
 * @returns Recommended fees object
 */
export const fetchLiveFees = async (network: WalletNetwork = 'mainnet') => {
    const baseUrl = await resolveBitcoinApiBase(network, 'fees');

    try {
        const response = await fetch(baseUrl);
        if (!response.ok) {
            const errorText = await response.text();
            await logError(`Failed to fetch fees: ${response.status}`, 'Mempool API', errorText, network);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        return {
            fast: data.fastestFee,    // Next block (~10 min)
            average: data.halfHourFee, // 3 blocks (~30 min)
            slow: data.hourFee,       // 6 blocks (~60 min)
            min: data.minimumFee      // Purge limit
        };
    } catch (error) {
        console.error("Failed to fetch fees:", error);
        await logError(`Network error fetching fees`, 'Mempool API', error, network);
        return { fast: 25, average: 15, slow: 5, min: 1 }; // Fallback defaults
    }
};
export interface UTXO {
    txid: string;
    vout: number;
    value: number; // satoshis
    address: string; // The address this UTXO belongs to
    derivationPath: string; // The BIP86 derivation path
    account: 'vanilla' | 'colored';
    chain: 0 | 1; // 0: external, 1: internal/change
    index: number; // Address index
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
    network: WalletNetwork = 'mainnet'
): Promise<boolean> => {
    const baseUrl = await resolveBitcoinApiBase(network, 'address');

    try {
        const response = await fetch(`${baseUrl}/address/${address}`);

        if (!response.ok) {
            if (response.status === 404) return false;
            const errorText = await response.text();
            await logError(`Failed to check address history: ${response.status}`, 'Blockchain API', errorText, network);
            throw new Error(`Failed to check address history: ${response.statusText}`);
        }

        const data = await response.json();
        const fundedCount = data.chain_stats?.funded_txo_count || 0;
        const mempoolCount = data.mempool_stats?.funded_txo_count || 0;

        return (fundedCount + mempoolCount) > 0;
    } catch (error) {
        await logError(`Network error checking history`, 'Blockchain API', error, network);
        console.warn(`[checkAddressHistory] Network error for ${address}, treating as no history:`, error);
        return false;
    }
};

/**
 * Fetch UTXOs from Blockstream API for a Bitcoin address
 * @param network - Bitcoin network
    * @returns Array of UTXOs
        */
export const fetchUTXOsFromBlockchain = async (
    address: string,
    network: WalletNetwork = 'mainnet'
): Promise<UTXO[]> => {
    const baseUrl = await resolveBitcoinApiBase(network, 'utxo');
    const includeMempool = network === 'regtest' ? '?include_mempool=1' : ''

    try {
        const response = await fetch(`${baseUrl}/address/${address}/utxo${includeMempool}`);

        if (!response.ok) {
            const errorText = await response.text();
            await logError(`Failed to fetch UTXOs: ${response.status}`, 'Blockchain API', errorText, network);
            throw new Error(`Failed to fetch UTXOs: ${response.statusText}`);
        }

        const utxos = await response.json();

        // Transform to our UTXO interface
        return utxos.map((utxo: any) => ({
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value
        }));
    } catch (error) {
        await logError(`Network error fetching UTXOs`, 'Blockchain API', error, network);
        console.warn(`[fetchUTXOsFromBlockchain] Network error for ${address}, returning empty:`, error);
        return [];
    }
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
    network: WalletNetwork = 'mainnet'
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
 * Following the "Vanilla" isolation rule: Only spends from Account 0.
 * 
 * @param mnemonic - User's mnemonic phrase
 * @param utxos - Available UTXOs to spend
 * @param toAddress - Destination Bitcoin address
 * @param amountToSend - Amount to send in satoshis
 * @param feeRate - Fee rate in satoshis per vbyte
 * @param network - Bitcoin network
 * @param changeIndex - Index for the change address
 * @returns Transaction hex ready for broadcasting
 */
export const signAndSendVanilla = async (
    mnemonic: string,
    utxos: UTXO[],
    toAddress: string,
    amountToSend: number | bigint,
    feeRate: number = 3,
    network: WalletNetwork = 'mainnet',
    changeIndex: number = 0,
    options?: {
        consumeAllNoChange?: boolean
    }
): Promise<string> => {
    const btcNetwork = getBitcoinJsNetwork(network);

    const seed = await bip39.mnemonicToSeed(mnemonic);
    const bip32 = BIP32Factory(ecc);
    const root = bip32.fromSeed(seed, btcNetwork);

    // 1. Setup PSBT
    const psbt = new bitcoin.Psbt({ network: btcNetwork });

    // 2. Add Inputs (Only from Vanilla Account)
    let totalIn = 0n;
    const amountBigInt = BigInt(amountToSend);

    for (const utxo of utxos) {
        // SAFETY CHECK: The "Colored" Block
        // Check derivation path format: m/purpose'/cointype'/account'/chain/index
        // We need to ensure account (3rd position) is 0' (Vanilla), not 1' (Colored)
        // This correctly distinguishes between:
        //   - Testnet Vanilla: m/86'/1'/0'/0/0 (coin type 1', account 0') ✅ ALLOWED
        //   - Mainnet Colored: m/86'/0'/1'/0/0 (coin type 0', account 1') ❌ BLOCKED
        //   - Testnet Colored: m/86'/1'/1'/0/0 (coin type 1', account 1') ❌ BLOCKED
        const pathParts = utxo.derivationPath.split('/');

        // Validate path structure (must have at least 5 parts: m, purpose', cointype', account', chain/index)
        if (pathParts.length < 5) {
            throw new Error(`CRITICAL SAFETY VIOLATION: Malformed derivation path ${utxo.derivationPath}. Cannot verify account safety.`);
        }

        const accountIndex = pathParts[3]; // m / 86' / cointype' / account' / ...

        if (accountIndex === "1'") {
            throw new Error(`CRITICAL SAFETY VIOLATION: Attempted to spend from Colored Account UTXO at ${utxo.derivationPath}. Transaction aborted to protect RGB assets.`);
        }

        // Derive the specific private key for this UTXO
        const child = root.derivePath(utxo.derivationPath);

        // Taproot Tweak: Required to spend BIP86 outputs
        const internalPubkey = child.publicKey.slice(1, 33);

        psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo: {
                value: BigInt(utxo.value),
                script: bitcoin.address.toOutputScript(utxo.address, btcNetwork),
            },
            tapInternalKey: internalPubkey,
        });

        totalIn += BigInt(utxo.value);
    }

    // 3. Add Recipient Output
    psbt.addOutput({
        address: toAddress,
        value: amountBigInt,
    });

    // 4. Calculate & Add Change Output
    // Use a no-change path for explicit "send max" requests so the UI and signer
    // agree on the exact spendable amount.
    const feeWithChange = BigInt(estimateFee(utxos.length, 2, feeRate));
    const changeValueWithChange = totalIn - amountBigInt - feeWithChange;
    const allowNoChange = Boolean(options?.consumeAllNoChange);

    if (changeValueWithChange > 546n && !allowNoChange) { // Dust limit check
        // Change goes to Vanilla Internal Chain (m/86'/n'/0'/1/index)
        const changeAddress = await deriveBitcoinAddress(mnemonic, network, 86, 0, 1, changeIndex);
        psbt.addOutput({
            address: changeAddress,
            value: changeValueWithChange,
        });
        console.log(`[Transaction] Added Vanilla change output of ${changeValueWithChange} sats to ${changeAddress}`);
    } else {
        const feeNoChange = BigInt(estimateFee(utxos.length, 1, feeRate));
        const noChangeRemainder = totalIn - amountBigInt - feeNoChange;

        if (noChangeRemainder < 0n) {
            throw new Error(`Insufficient funds. Need ${amountBigInt + feeNoChange} sats, have ${totalIn} sats`);
        }

        if (!allowNoChange && changeValueWithChange < 0n) {
            throw new Error(`Insufficient funds. Need ${amountBigInt + feeWithChange} sats, have ${totalIn} sats`);
        }

        console.log(`[Transaction] Using no-change spend path. Extra fee remainder: ${noChangeRemainder} sats`);
    }

    // 5. Sign and Extract
    // Note: You must sign each input with its specific derived tweakedSigner
    for (let i = 0; i < utxos.length; i++) {
        const child = root.derivePath(utxos[i].derivationPath);
        const internalPubkey = child.publicKey.slice(1, 33);
        const tweak = bitcoin.crypto.taggedHash('TapTweak', internalPubkey);
        const tweakedSigner = child.tweak(tweak);

        psbt.signInput(i, tweakedSigner);
    }

    psbt.finalizeAllInputs();
    return psbt.extractTransaction().toHex();
};

export const signAndUnlockUtxo = async (
    mnemonic: string,
    utxo: UTXO,
    destinationAddress: string,
    feeRate: number = 2,
    network: WalletNetwork = 'mainnet'
): Promise<string> => {
    const btcNetwork = getBitcoinJsNetwork(network);
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const root = BIP32Factory(ecc).fromSeed(seed, btcNetwork);
    const psbt = new bitcoin.Psbt({ network: btcNetwork });

    const child = root.derivePath(utxo.derivationPath);
    const internalPubkey = child.publicKey.slice(1, 33);

    psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
            value: BigInt(utxo.value),
            script: bitcoin.address.toOutputScript(utxo.address, btcNetwork),
        },
        tapInternalKey: internalPubkey,
    });

    const fee = estimateFee(1, 1, feeRate);
    const sendValue = utxo.value - fee;

    if (sendValue <= 546) {
        throw new Error(`UTXO value ${utxo.value} sats is too small to unlock after paying the network fee.`);
    }

    psbt.addOutput({
        address: destinationAddress,
        value: BigInt(sendValue),
    });

    const tweak = bitcoin.crypto.taggedHash('TapTweak', internalPubkey);
    const tweakedSigner = child.tweak(tweak);
    psbt.signInput(0, tweakedSigner);
    psbt.finalizeAllInputs();
    return psbt.extractTransaction().toHex();
};

/**
 * Broadcast a signed transaction to the network using mempool.space
 * 
 * @param txHex - Transaction hex
 * @param network - Bitcoin network
 * @returns Transaction ID
 */
export const broadcastTransaction = async (
    txHex: string,
    network: WalletNetwork = 'mainnet'
): Promise<string> => {
    const baseUrl = await resolveBitcoinApiBase(network, 'broadcast');

    try {
        const response = await fetch(`${baseUrl}/tx`, {
            method: 'POST',
            body: txHex,
        });

        if (!response.ok) {
            const error = await response.text();
            await logError(`Broadcast failed: ${response.status}`, 'Blockchain API', error, network);
            throw new Error(`Failed to broadcast transaction: ${error}`);
        }

        const txid = await response.text();
        return txid;
    } catch (error) {
        await logError(`Network error during broadcast`, 'Blockchain API', error, network);
        throw error;
    }
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
    network: WalletNetwork = 'mainnet',
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
    const allDiscoveredAddresses = new Set<string>();
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

        // Track all scanned addresses for change detection
        results.forEach(r => {
            allDiscoveredAddresses.add(r.addr);
        });

        const anyHistory = results.some(r => r.hasHistory);
        if (currentIndex === 0) {
            console.log(`[DiscoveryScan] Index 0 results:`, results.map(r => ({ addr: r.addr, account: r.account, chain: r.chain, hasHistory: r.hasHistory })));
        }

        if (anyHistory) {
            consecutiveEmpty = 0;
            maxIndexFound = currentIndex;

            // If any history found, fetch UTXOs for all 4 addresses at this index
            const utxoPromises = results.map(async r => {
                const utxos = await fetchUTXOsFromBlockchain(r.addr, network);
                const coinType = network === 'mainnet' ? 0 : 1;
                const accountIndex = r.account === 'vanilla' ? 0 : 1;
                const derivationPath = `m/86'/${coinType}'/${accountIndex}'/${r.chain}/${currentIndex}`;

                return utxos.map(u => ({
                    ...u,
                    address: r.addr,
                    derivationPath: derivationPath,
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
        allDiscoveredAddresses: Array.from(allDiscoveredAddresses)
    };
};
