import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

const REGTEST_NETWORK: bitcoin.Network = {
    ...bitcoin.networks.regtest,
    bech32: 'bcrt',
};

export const getBitcoinJsNetwork = (
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet'
): bitcoin.Network => {
    if (network === 'mainnet') {
        return bitcoin.networks.bitcoin;
    }

    if (network === 'regtest') {
        return REGTEST_NETWORK;
    }

    return bitcoin.networks.testnet;
};

export const isLikelyRegtestAddress = (address: string): boolean => {
    const normalized = address.trim().toLowerCase();
    return normalized.startsWith('bcrt1') || normalized.startsWith('m') || normalized.startsWith('n') || normalized.startsWith('2');
};

/**
 * Derive a Bitcoin address from a mnemonic using BIP84 (Native SegWit) or BIP86 (Taproot)
 * 
 * @param mnemonic - BIP39 mnemonic phrase
 * @param network - Bitcoin network ('mainnet', 'testnet3', 'testnet4', 'regtest')
 * @param purpose - BIP purpose (84 for Native SegWit, 86 for Taproot)
 * @param accountIndex - Account index (default: 0)
 * @param chainIndex - Chain index (0 = external/receive, 1 = internal/change)
 * @param addressIndex - Address index (default: 0)
 * @returns Bitcoin address
 */
export const deriveBitcoinAddress = async (
    mnemonic: string,
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'regtest' = 'mainnet',
    purpose: 84 | 86 = 84,
    accountIndex: number = 0,
    chainIndex: number = 0,
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
        // testnet3/testnet4 use testnet, while regtest keeps coin type 1 but needs bcrt bech32 prefix.
        btcNetwork = getBitcoinJsNetwork(network);
        coinType = 1; // BIP44 coin type for Bitcoin testnet/regtest
    }

    // Derivation path: m/purpose'/coin_type'/account'/chain/address_index
    const path = `m/${purpose}'/${coinType}'/${accountIndex}'/${chainIndex}/${addressIndex}`;

    // Initialize BIP32 with tiny-secp256k1
    const bip32 = BIP32Factory(ecc);

    // Derive key from seed
    const root = bip32.fromSeed(seed, btcNetwork);
    const child = root.derivePath(path);

    if (!child.publicKey) {
        throw new Error('Failed to derive public key');
    }

    if (purpose === 86) {
        // Generate P2TR (Pay to Taproot) address
        // For Taproot, we need to use the x-only public key (first 32 bytes)
        const internalPubkey = child.publicKey.slice(1, 33);

        const { address } = bitcoin.payments.p2tr({
            internalPubkey,
            network: btcNetwork,
        });

        if (!address) throw new Error('Failed to generate P2TR address');
        return address;
    } else {
        // Default to BIP84: Generate P2WPKH (Pay to Witness Public Key Hash) address
        const { address } = bitcoin.payments.p2wpkh({
            pubkey: child.publicKey,
            network: btcNetwork,
        });

        if (!address) throw new Error('Failed to generate P2WPKH address');
        return address;
    }
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
        const address = await deriveBitcoinAddress(mnemonic, network, 84, 0, 0, i);
        addresses.push(address);
    }

    return addresses;
};
