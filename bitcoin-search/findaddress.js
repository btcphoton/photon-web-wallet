const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bitcoin = require('bitcoinjs-lib');

// Initialize ECC library for Taproot (Schnorr) support
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

/**
 * Searches for BitLight addresses across standard and specialized RGB branches.
 */
async function findBitLightAddress(mnemonic, targetAddress, isTestnet = true) {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const network = isTestnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
    const coinType = isTestnet ? 1 : 0;
    const root = bip32.fromSeed(seed, network);

    // BitLight logic: 86 is the primary purpose (Taproot)
    const purposes = [86];

    /**
     * BitLight Branch Mapping based on Extension Source:
     * 0: External (Main Balance)
     * 1: Internal (Change)
     * 9/10: RGB Vault (Asset Holding)
     * 86: Specialized Taproot Branch
     * 100: Pre-funded RGB Containers (0.0003 BTC)
     */
    const branches = [0, 1, 9, 10, 86, 100];

    const maxAccounts = 10;   // BitLight uses multiple accounts for different protocol versions
    const maxIndex = 500;     // Search depth for addresses within a branch

    console.log(`Searching for: ${targetAddress}...`);

    for (const purpose of purposes) {
        for (let account = 0; account < maxAccounts; account++) {
            for (const branch of branches) {
                for (let index = 0; index < maxIndex; index++) {
                    const path = `m/${purpose}'/${coinType}'/${account}'/${branch}/${index}`;

                    try {
                        const child = root.derivePath(path);
                        const xOnlyPubkey = child.publicKey.slice(1, 33);

                        // BIP86 P2TR generation
                        const { address } = bitcoin.payments.p2tr({
                            internalPubkey: xOnlyPubkey,
                            network,
                        });
                        return { found: true, path, address };
                        if (address === targetAddress) {
                            return { found: true, path, address };
                        }
                    } catch (e) {
                        continue; // Skip invalid derivations
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
        console.error('Usage: node bitcoin-search/findaddress.js "<mnemonic>" "<targetAddress>" [mainnet|testnet3]');
        console.error('Or set PHOTON_TEST_MNEMONIC and PHOTON_TARGET_ADDRESS in your local shell.');
        process.exit(1);
    }

    if (!bip39.validateMnemonic(mnemonic)) {
        console.error('Invalid mnemonic phrase.');
        process.exit(1);
    }

    const result = await findBitLightAddress(mnemonic, target, isTestnet);
    if (result.found) {
        console.log("\n✅ SUCCESS!");
        console.log(`Path:    ${result.path}`);
        console.log(`Address: ${result.address}`);
        return;
    }

    console.log("\n❌ Address not found within specialized BitLight branches.");
    console.log("Tip: If this is an active RGB seal, it may be 'tweaked' with a contract hash.");
    process.exit(2);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
