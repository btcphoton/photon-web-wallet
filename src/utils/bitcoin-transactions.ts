import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

// Initialize factories
const ECPair = ECPairFactory(ecc);

/**
 * Interface for UTXO
 */
export interface UTXO {
    txid: string;
    vout: number;
    value: number; // satoshis
    addressSource?: 'main' | 'utxo-holder' | 'dust-holder'; // Track which address this UTXO came from
}

/**
 * Fetch UTXOs from Blockstream API for a Bitcoin address
 * 
 * @param address - Bitcoin address to fetch UTXOs for
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
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet'
): Promise<string> => {
    // Determine Bitcoin network
    const btcNetwork = network === 'mainnet'
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    // Derive private key from mnemonic
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const bip32 = BIP32Factory(ecc);
    const coinType = network === 'mainnet' ? 0 : 1;
    const path = `m/84'/${coinType}'/0'/0/0`; // BIP84 path

    const root = bip32.fromSeed(seed, btcNetwork);
    const child = root.derivePath(path);

    if (!child.privateKey) {
        throw new Error('Failed to derive private key');
    }

    // Create key pair
    const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: btcNetwork });
    const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network: btcNetwork
    });

    if (!p2wpkh.address || !p2wpkh.output) {
        throw new Error('Failed to generate payment address');
    }

    // Create PSBT
    const psbt = new bitcoin.Psbt({ network: btcNetwork });

    // Calculate total input value and add inputs
    let totalInput = 0;
    for (const utxo of utxos) {
        psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo: {
                script: p2wpkh.output,
                value: BigInt(utxo.value),
            },
        });
        totalInput += utxo.value;
    }

    // Add output for recipient
    psbt.addOutput({
        address: toAddress,
        value: BigInt(amountToSend),
    });

    // Estimate fee (simple estimation: inputs * 148 + outputs * 34 + 10)
    const estimatedSize = utxos.length * 148 + 2 * 34 + 10;
    const estimatedFee = Math.ceil(estimatedSize * feeRate);

    // Calculate change
    const change = totalInput - amountToSend - estimatedFee;

    // Add change output if it's above dust threshold (546 sats)
    if (change > 546) {
        psbt.addOutput({
            address: p2wpkh.address,
            value: BigInt(change),
        });
    } else if (change < 0) {
        throw new Error(`Insufficient funds. Need ${amountToSend + estimatedFee} sats, have ${totalInput} sats`);
    }

    // Sign all inputs
    for (let i = 0; i < utxos.length; i++) {
        psbt.signInput(i, keyPair);
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
