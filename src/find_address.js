const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bitcoin = require('bitcoinjs-lib');

const bip32 = BIP32Factory(ecc);

async function findDerivationPath(mnemonic, targetAddress, isTestnet = true) {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const network = isTestnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
    const root = bip32.fromSeed(seed, network);

    // Common purpose types: 44 (Legacy), 49 (SegWit Nested), 84 (Native SegWit), 86 (Taproot)
    const purposes = [44, 49, 84, 86];
    const coinType = isTestnet ? 1 : 0; // 1 for Testnet, 0 for Mainnet

    // Search constraints
    const maxAccounts = 5;      // Search accounts 0-4
    const maxAddressIndex = 100; // Search indices 0-99

    console.log(`Searching for: ${targetAddress}...`);

    for (const purpose of purposes) {
        for (let account = 0; account < maxAccounts; account++) {
            // Check both external (0) and internal/change (1) chains
            for (const chain of [0, 1]) {
                for (let index = 0; index < maxAddressIndex; index++) {
                    const path = `m/${purpose}'/${coinType}'/${account}'/${chain}/${index}`;
                    const child = root.derivePath(path);
                    let address = '';

                    // Generate address based on purpose
                    try {
                        if (purpose === 44) {
                            address = bitcoin.payments.p2pkh({ pubkey: child.publicKey, network }).address;
                        } else if (purpose === 49) {
                            const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: child.publicKey, network });
                            address = bitcoin.payments.p2sh({ redeem: p2wpkh, network }).address;
                        } else if (purpose === 84) {
                            address = bitcoin.payments.p2wpkh({ pubkey: child.publicKey, network }).address;
                        } else if (purpose === 86) {
                            // Taproot requires x-only public key
                            const xOnlyPubkey = child.publicKey.slice(1, 33);
                            address = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubkey, network }).address;
                        }

                        if (address === targetAddress) {
                            return { found: true, path, address };
                        }
                    } catch (e) {
                        // Skip incompatible paths
                        continue;
                    }
                }
            }
        }
    }
    return { found: false };
}

async function main() {
    const mnemonic = process.env.PHOTON_TEST_MNEMONIC || process.argv[2] || '';
    const target = process.env.PHOTON_TARGET_ADDRESS || process.argv[3] || '';
    const networkArg = (process.env.PHOTON_TARGET_NETWORK || process.argv[4] || 'testnet3').toLowerCase();
    const isTestnet = networkArg !== 'mainnet';

    if (!mnemonic || !target) {
        console.error('Usage: node src/find_address.js "<mnemonic>" "<targetAddress>" [mainnet|testnet3]');
        console.error('Or set PHOTON_TEST_MNEMONIC and PHOTON_TARGET_ADDRESS in your local shell.');
        process.exit(1);
    }

    if (!bip39.validateMnemonic(mnemonic)) {
        console.error('Invalid mnemonic phrase.');
        process.exit(1);
    }

    const result = await findDerivationPath(mnemonic, target, isTestnet);
    if (result.found) {
        console.log(`Success! Found at path: ${result.path}`);
        return;
    }

    console.log('Address not found within search limits.');
    process.exit(2);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
