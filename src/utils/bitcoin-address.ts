import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';

/**
 * Derive a Bitcoin address from a mnemonic using BIP84 (native SegWit)
 * 
 * @param mnemonic - BIP39 mnemonic phrase
 * @param network - Bitcoin network ('mainnet', 'testnet3', 'testnet4', 'regtest')
 * @param accountIndex - Account index (default: 0)
 * @param addressIndex - Address index (default: 0)
 * @returns Bitcoin address (native SegWit - bc1... for mainnet, tb1... for testnet)
 */
export const deriveBitcoinAddress = async (
    mnemonic: string,
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet',
    accountIndex: number = 0,
    addressIndex: number = 0
): Promise<string> => {
    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic phrase');
    }

    // Generate seed from mnemonic
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // Determine Bitcoin network
    let btcNetwork: bitcoin.Network;
    let coinType: number;

    if (network === 'mainnet') {
        btcNetwork = bitcoin.networks.bitcoin;
        coinType = 0; // BIP44 coin type for Bitcoin mainnet
    } else {
        // testnet3, testnet4, and regtest all use testnet network
        btcNetwork = bitcoin.networks.testnet;
        coinType = 1; // BIP44 coin type for Bitcoin testnet
    }

    // BIP84 derivation path: m/84'/coin_type'/account'/0/address_index
    // 84' = Purpose (Native SegWit)
    // coin_type' = 0 for mainnet, 1 for testnet
    // account' = Account index
    // 0 = External chain (receiving addresses)
    // address_index = Address index
    const path = `m/84'/${coinType}'/${accountIndex}'/0/${addressIndex}`;

    // Initialize BIP32 with tiny-secp256k1 (lazy initialization to avoid WASM issues)
    const bip32 = BIP32Factory(ecc);

    // Derive key from seed
    const root = bip32.fromSeed(seed, btcNetwork);
    const child = root.derivePath(path);

    // Generate P2WPKH (Pay to Witness Public Key Hash) address
    if (!child.publicKey) {
        throw new Error('Failed to derive public key');
    }

    const { address } = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: btcNetwork,
    });

    if (!address) {
        throw new Error('Failed to generate address');
    }

    return address;
};

/**
 * Derive multiple Bitcoin addresses from a mnemonic
 * 
 * @param mnemonic - BIP39 mnemonic phrase
 * @param network - Bitcoin network
 * @param count - Number of addresses to generate (default: 1)
 * @returns Array of Bitcoin addresses
 */
export const deriveMultipleBitcoinAddresses = async (
    mnemonic: string,
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet',
    count: number = 1
): Promise<string[]> => {
    const addresses: string[] = [];

    for (let i = 0; i < count; i++) {
        const address = await deriveBitcoinAddress(mnemonic, network, 0, i);
        addresses.push(address);
    }

    return addresses;
};
