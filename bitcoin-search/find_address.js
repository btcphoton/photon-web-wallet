const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bitcoin = require('bitcoinjs-lib');

// CRITICAL: Initialize ECC library for bitcoinjs-lib v6+
bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);

/**
 * Generate Taproot address matching bitcoin-address.ts implementation
 */
async function deriveBitcoinAddress(mnemonic, network = 'testnet3', accountIndex = 0, addressIndex = 0) {
    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic phrase');
    }

    // Generate seed from mnemonic
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // Determine Bitcoin network
    let btcNetwork;
    let coinType;

    if (network === 'mainnet') {
        btcNetwork = bitcoin.networks.bitcoin;
        coinType = 0;
    } else {
        btcNetwork = bitcoin.networks.testnet;
        coinType = 1;
    }

    // BIP86 derivation path
    const path = `m/86'/${coinType}'/${accountIndex}'/0/${addressIndex}`;

    // Derive key from seed
    const root = bip32.fromSeed(seed, btcNetwork);
    const child = root.derivePath(path);

    // Generate P2TR (Pay to Taproot) address
    if (!child.publicKey) {
        throw new Error('Failed to derive public key');
    }

    // For Taproot, we need to use the x-only public key (first 32 bytes)
    const internalPubkey = child.publicKey.slice(1, 33);

    const { address } = bitcoin.payments.p2tr({
        internalPubkey,
        network: btcNetwork,
    });

    if (!address) {
        throw new Error('Failed to generate address');
    }

    return { address, path };
}

/**
 * Find which derivation indices generate the target addresses
 */
async function findMultipleAddresses(mnemonic, targets, isTestnet = true) {
    const network = isTestnet ? 'testnet3' : 'mainnet';
    const results = new Map();

    console.log('\n=== Searching for Multiple Addresses ===\n');

    targets.forEach(({ label, address }) => {
        console.log(`${label}:`);
        console.log(`  ${address}`);
    });

    console.log('\nSearching through derivation paths...\n');

    // Search constraints
    const maxAccounts = 10;
    const maxAddressIndex = 1000;

    for (let account = 0; account < maxAccounts; account++) {
        for (let index = 0; index < maxAddressIndex; index++) {
            try {
                const { address, path } = await deriveBitcoinAddress(mnemonic, network, account, index);

                // Check if this address matches any target
                for (const target of targets) {
                    if (address === target.address && !results.has(target.label)) {
                        results.set(target.label, {
                            label: target.label,
                            address,
                            path,
                            account,
                            index
                        });

                        console.log(`✅ FOUND: ${target.label}`);
                        console.log(`   Path: ${path}`);
                        console.log(`   Account: ${account}, Index: ${index}\n`);

                        // Stop if we found all addresses
                        if (results.size === targets.length) {
                            return results;
                        }
                    }
                }
            } catch (e) {
                console.error(`Error at account ${account}, index ${index}:`, e.message);
                continue;
            }
        }
    }

    return results;
}

// ===== MAIN EXECUTION =====

const mnemonic = "gasp attitude little organ palm crime layer answer dial twelve feed meadow";

// Define the three addresses to find
const targetAddresses = [
    {
        label: "Main Balance",
        address: "tb1p0kwwnsrej5cpsczavj4mpznw5q4hr7n6ldwnvge3ryth4qyt8j9qzga3f4"
    },
    {
        label: "UTXOs Holder",
        address: "tb1py9am4avtccxud45qwsfxuf7vt5s552lsu39fh47mjm5k0xfsxlpqd8pxak"
    },
    {
        label: "Dust Balance",
        address: "tb1p7eajc8sk3nwr9fq6pfl2yvzzyfv7elstyvuwl497x3u7zre738hqrrntjf"
    }
];

// Search for all three addresses
findMultipleAddresses(mnemonic, targetAddresses, true).then(results => {
    console.log('\n=== SEARCH RESULTS ===\n');

    if (results.size === targetAddresses.length) {
        console.log(`✅ All ${targetAddresses.length} addresses found!\n`);

        results.forEach((result) => {
            console.log(`${result.label}:`);
            console.log(`  Address: ${result.address}`);
            console.log(`  Path: ${result.path}`);
            console.log(`  Account: ${result.account}, Index: ${result.index}\n`);
        });
    } else {
        console.log(`Found ${results.size} out of ${targetAddresses.length} addresses.\n`);

        if (results.size > 0) {
            results.forEach((result) => {
                console.log(`${result.label}:`);
                console.log(`  Address: ${result.address}`);
                console.log(`  Path: ${result.path}`);
                console.log(`  Account: ${result.account}, Index: ${result.index}\n`);
            });
        }

        console.log('Missing addresses:');
        targetAddresses.forEach(target => {
            if (!results.has(target.label)) {
                console.log(`  ❌ ${target.label}`);
            }
        });
        console.log('\nTry increasing maxAccounts or maxAddressIndex in the code.');
    }
});
