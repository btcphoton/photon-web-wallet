import { Actor, HttpAgent } from '@dfinity/agent';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import * as bip39 from 'bip39';

// Wallet canister IDs (for main BTC wallet)
const WALLET_CANISTER_IDS = {
    Mainnet: '7z2qz-sqaaa-aaaab-aaeha-cai',
    Testnet: 'efotk-eqaaa-aaaaa-qajpa-cai',
    Regtest: 'efotk-eqaaa-aaaaa-qajpa-cai', // Same as Testnet
};

// Lightning canister IDs (for ckBTC/Lightning)
const LIGHTNING_CANISTER_IDS = {
    Mainnet: 'mqygn-kiaaa-aaaar-qaadq-cai',
    Testnet: 'ml52i-qqaaa-aaaar-qaaba-cai',
    Regtest: 'ml52i-qqaaa-aaaar-qaaba-cai', // Same as Testnet
};

// Network enum matching the canister's NetworkEnum (capital case)
export type NetworkEnum = 'Mainnet' | 'Testnet' | 'Regtest';

// Map app network to canister network enum
export const mapNetworkToCanister = (network: string): NetworkEnum => {
    switch (network) {
        case 'mainnet':
            return 'Mainnet';
        case 'testnet3':
        case 'testnet4':
            return 'Testnet';
        case 'regtest':
            return 'Regtest';
        default:
            return 'Mainnet';
    }
};

// Get wallet canister ID for specific network
const getWalletCanisterId = (network: NetworkEnum): string => {
    return WALLET_CANISTER_IDS[network];
};

// Get lightning canister ID for specific network
const getLightningCanisterId = (network: NetworkEnum): string => {
    return LIGHTNING_CANISTER_IDS[network];
};

// IDL for wallet canister methods
const walletIdlFactory = ({ IDL }: any) => {
    return IDL.Service({
        'get_wallet_address': IDL.Func([], [IDL.Text], []), // Update method
        'get_btc_balance': IDL.Func([], [IDL.Nat64], []), // Update method
    });
};

// IDL for lightning canister methods (ckBTC minter)
const lightningIdlFactory = ({ IDL }: any) => {
    const UtxoStatus = IDL.Variant({
        'ValueTooSmall': IDL.Record({ 'value': IDL.Nat64 }),
        'Tainted': IDL.Record({ 'value': IDL.Nat64 }),
        'Minted': IDL.Record({ 'block_index': IDL.Nat64, 'minted_amount': IDL.Nat64, 'value': IDL.Nat64 }),
        'Checked': IDL.Record({ 'value': IDL.Nat64 }),
    });

    const UpdateBalanceError = IDL.Variant({
        'GenericError': IDL.Record({ 'error_message': IDL.Text, 'error_code': IDL.Nat64 }),
        'TemporarilyUnavailable': IDL.Text,
        'AlreadyProcessing': IDL.Null,
        'NoNewUtxos': IDL.Record({ 'current_confirmations': IDL.Opt(IDL.Nat32), 'required_confirmations': IDL.Nat32 }),
    });

    const GetBtcAddressArgs = IDL.Record({
        'owner': IDL.Opt(IDL.Principal),
        'subaccount': IDL.Opt(IDL.Vec(IDL.Nat8)),
    });

    const UpdateBalanceArgs = IDL.Record({
        'owner': IDL.Opt(IDL.Principal),
        'subaccount': IDL.Opt(IDL.Vec(IDL.Nat8)),
    });

    return IDL.Service({
        'get_btc_address': IDL.Func([GetBtcAddressArgs], [IDL.Text], []),
        'update_balance': IDL.Func([UpdateBalanceArgs], [IDL.Variant({ 'Ok': IDL.Vec(UtxoStatus), 'Err': UpdateBalanceError })], []),
    });
};

// Get wallet address from wallet canister
export const getWalletAddress = async (mnemonic: string, network: NetworkEnum = 'Mainnet'): Promise<string> => {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const seed32 = new Uint8Array(seed.slice(0, 32));
    const identity = Ed25519KeyIdentity.fromSecretKey(seed32);

    const agent = new HttpAgent({
        identity,
        host: 'https://ic0.app',
    });

    const actor = Actor.createActor(walletIdlFactory, {
        agent,
        canisterId: getWalletCanisterId(network),
    });

    try {
        // @ts-ignore
        const address = await actor.get_wallet_address();
        return address as string;
    } catch (error) {
        console.error("Error fetching wallet address:", error);
        throw error;
    }
};

// Get wallet balance from wallet canister
export const getWalletBalance = async (mnemonic: string, network: NetworkEnum = 'Mainnet'): Promise<bigint> => {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const seed32 = new Uint8Array(seed.slice(0, 32));
    const identity = Ed25519KeyIdentity.fromSecretKey(seed32);

    const agent = new HttpAgent({
        identity,
        host: 'https://ic0.app',
    });

    const actor = Actor.createActor(walletIdlFactory, {
        agent,
        canisterId: getWalletCanisterId(network),
    });

    try {
        // @ts-ignore
        const balance = await actor.get_btc_balance();
        return balance as bigint;
    } catch (error) {
        console.error("Error fetching wallet balance:", error);
        throw error;
    }
};

// Get Lightning BTC address from ckBTC minter canister
export const getBtcAddress = async (mnemonic: string, network: NetworkEnum = 'Mainnet'): Promise<string> => {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const seed32 = new Uint8Array(seed.slice(0, 32));
    const identity = Ed25519KeyIdentity.fromSecretKey(seed32);

    const agent = new HttpAgent({
        identity,
        host: 'https://ic0.app',
    });

    // Create actor with lightning canister ID
    const actor = Actor.createActor(lightningIdlFactory, {
        agent,
        canisterId: getLightningCanisterId(network),
    });

    try {
        // Get the principal from the identity
        const principal = identity.getPrincipal();

        // Create the arguments record with owner and optional subaccount
        const args = {
            owner: [principal], // Optional principal - wrapped in array for Opt type
            subaccount: [], // Optional subaccount - empty array means None
        };

        // @ts-ignore
        const result = await actor.get_btc_address(args);
        return result as string;
    } catch (error) {
        console.error("Error fetching Lightning BTC address:", error);
        throw error;
    }
};

// Update Lightning Bitcoin balance
export const updateBalance = async (mnemonic: string, network: NetworkEnum = 'Mainnet'): Promise<number> => {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const seed32 = new Uint8Array(seed.slice(0, 32));
    const identity = Ed25519KeyIdentity.fromSecretKey(seed32);

    const agent = new HttpAgent({
        identity,
        host: 'https://ic0.app',
    });

    // Create actor with lightning canister ID
    const actor = Actor.createActor(lightningIdlFactory, {
        agent,
        canisterId: getLightningCanisterId(network),
    });

    try {
        // Get the principal from the identity
        const principal = identity.getPrincipal();

        // Create the arguments record with owner and optional subaccount
        const args = {
            owner: [principal], // Optional principal - wrapped in array for Opt type
            subaccount: [], // Optional subaccount - empty array means None
        };

        // @ts-ignore
        const result = await actor.update_balance(args);

        // Handle Result variant (Ok/Err) - cast to any to avoid TypeScript errors
        const resultAny = result as any;
        if ('Ok' in resultAny) {
            // Return the number of UTXOs processed
            return (resultAny.Ok as any[]).length;
        } else if ('Err' in resultAny) {
            const error = resultAny.Err as any;
            if ('GenericError' in error) {
                throw new Error(`Generic error: ${error.GenericError.error_message} (code: ${error.GenericError.error_code})`);
            } else if ('TemporarilyUnavailable' in error) {
                throw new Error(`Temporarily unavailable: ${error.TemporarilyUnavailable}`);
            } else if ('AlreadyProcessing' in error) {
                throw new Error('Balance update already in progress');
            } else if ('NoNewUtxos' in error) {
                console.log('No new UTXOs to process');
                return 0; // No error, just no new UTXOs
            }
        }
        throw new Error('Unexpected response from update_balance');
    } catch (error) {
        console.error("Error updating Lightning balance:", error);
        throw error;
    }
};
