const bitcoin = require('bitcoinjs-lib');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');

// Initialize BIP32 with the secp256k1 library
const bip32 = BIP32Factory(ecc);

// CRITICAL: Initialize ECC library for bitcoinjs-lib v6+
bitcoin.initEccLib(ecc);

async function findAddress(mnemonic, targetAddress) {
    console.log(`Searching for: ${targetAddress}...`);

    // 1. Generate Seed from Mnemonic
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // 2. Create Root from Seed (for Testnet)
    const network = bitcoin.networks.testnet;
    const root = bip32.fromSeed(seed, network);

    // 3. Define the branches to scan: 
    // 0 is standard, 9 is common in rgb-lib
    const branches = [0, 9];
    const maxIndex = 50;

    for (let branch of branches) {
        for (let i = 0; i < maxIndex; i++) {
            // Path: m/86'/1'/0'/branch/index
            // 86' = Taproot, 1' = Bitcoin Testnet
            const path = `m/86'/1'/0'/${branch}/${i}`;
            const child = root.derivePath(path);

            // Taproot uses x-only public keys (remove the first byte 0x02/0x03)
            const internalPubkey = child.publicKey.slice(1, 33);

            const { address } = bitcoin.payments.p2tr({
                internalPubkey,
                network,
            });

            if (address === targetAddress) {
                console.log("\n[MATCH FOUND!] ✨");
                console.log(`Address: ${address}`);
                console.log(`Path:    ${path}`);
                return path;
            }
        }
    }

    console.log("\nAddress not found in the first 50 indices of branches 0 or 9.");
    return null;
}

async function main() {
    const mnemonic = process.env.PHOTON_TEST_MNEMONIC || process.argv[2] || '';
    const target = process.env.PHOTON_TARGET_ADDRESS || process.argv[3] || '';

    if (!mnemonic || !target) {
        console.error('Usage: node bitcoin-search/search_address.js "<mnemonic>" "<targetAddress>"');
        console.error('Or set PHOTON_TEST_MNEMONIC and PHOTON_TARGET_ADDRESS in your local shell.');
        process.exit(1);
    }

    if (!bip39.validateMnemonic(mnemonic)) {
        console.error('Invalid mnemonic phrase.');
        process.exit(1);
    }

    const path = await findAddress(mnemonic, target);
    if (!path) {
        process.exit(2);
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
