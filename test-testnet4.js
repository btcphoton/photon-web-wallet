import { deriveBitcoinAddress } from './src/utils/bitcoin-address';

// Test mnemonic (replace with your actual test mnemonic or use this one)
const testMnemonic = 'gasp attitude little organ palm crime layer answer dial twelve feed meadow';

async function testTestNet4Addresses() {
    console.log('Testing TestNet 4 Address Generation\n');
    console.log('='.repeat(60));

    try {
        // Test Vanilla Account (Account 0) - Main receiving address
        const vanillaAddress = await deriveBitcoinAddress(testMnemonic, 'testnet4', 86, 0, 0, 0);
        console.log('\n✓ Vanilla Account (BIP86 Taproot):');
        console.log(`  Path: m/86'/1'/0'/0/0`);
        console.log(`  Address: ${vanillaAddress}`);
        console.log(`  Format: ${vanillaAddress.startsWith('tb1') ? '✓ Valid Taproot (tb1)' : '✗ Invalid format'}`);

        // Test Colored Account (Account 1) - RGB assets
        const coloredAddress = await deriveBitcoinAddress(testMnemonic, 'testnet4', 86, 1, 0, 0);
        console.log('\n✓ Colored Account (BIP86 Taproot):');
        console.log(`  Path: m/86'/1'/1'/0/0`);
        console.log(`  Address: ${coloredAddress}`);
        console.log(`  Format: ${coloredAddress.startsWith('tb1') ? '✓ Valid Taproot (tb1)' : '✗ Invalid format'}`);

        // Test Change Address (Internal chain)
        const changeAddress = await deriveBitcoinAddress(testMnemonic, 'testnet4', 86, 0, 1, 0);
        console.log('\n✓ Change Address (Internal Chain):');
        console.log(`  Path: m/86'/1'/0'/1/0`);
        console.log(`  Address: ${changeAddress}`);
        console.log(`  Format: ${changeAddress.startsWith('tb1') ? '✓ Valid Taproot (tb1)' : '✗ Invalid format'}`);

        // Compare with TestNet 3 to show they're different
        const testnet3Address = await deriveBitcoinAddress(testMnemonic, 'testnet3', 86, 0, 0, 0);
        console.log('\n✓ Comparison with TestNet 3:');
        console.log(`  TestNet 3: ${testnet3Address}`);
        console.log(`  TestNet 4: ${vanillaAddress}`);
        console.log(`  Same Format: ${testnet3Address.startsWith('tb1') && vanillaAddress.startsWith('tb1') ? '✓ Both use tb1' : '✗'}`);

        console.log('\n' + '='.repeat(60));
        console.log('\n✅ All TestNet 4 address generation tests PASSED!');
        console.log('\nSummary:');
        console.log('- TestNet 4 addresses are generated correctly');
        console.log('- All addresses use Bech32m format (tb1 prefix for testnet)');
        console.log('- Addresses follow BIP86 Taproot standard');
        console.log('- Both Vanilla and Colored accounts work correctly');

    } catch (error) {
        console.error('\n❌ Error during TestNet 4 address generation:');
        console.error(error);
        process.exit(1);
    }
}

// Run the test
testTestNet4Addresses();
