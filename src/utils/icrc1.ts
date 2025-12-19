import { Actor, HttpAgent } from '@dfinity/agent';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import * as bip39 from 'bip39';
import type { NetworkEnum } from './icp';

// ckBTC canister IDs for balance queries
const CKBTC_CANISTER_IDS = {
    Mainnet: 'mxzaz-hqaaa-aaaar-qaada-cai',
    Testnet: 'mc6ru-gyaaa-aaaar-qaaaq-cai', // ckTESTBTC
    Regtest: 'mc6ru-gyaaa-aaaar-qaaaq-cai', // Same as Testnet
};

// Get ckBTC canister ID for specific network
const getCkBTCCanisterId = (network: NetworkEnum): string => {
    return CKBTC_CANISTER_IDS[network];
};

// IDL for ICRC-1 token (ckBTC) methods
const icrc1IdlFactory = ({ IDL }: any) => {
    const Account = IDL.Record({
        'owner': IDL.Principal,
        'subaccount': IDL.Opt(IDL.Vec(IDL.Nat8)),
    });

    return IDL.Service({
        'icrc1_balance_of': IDL.Func([Account], [IDL.Nat], ['query']),
    });
};

// Get ckBTC/ckTESTBTC balance from ICRC-1 canister  
export const getCkBTCBalance = async (mnemonic: string, network: NetworkEnum = 'Mainnet'): Promise<string> => {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const seed32 = new Uint8Array(seed.slice(0, 32));
    const identity = Ed25519KeyIdentity.fromSecretKey(seed32);

    const agent = new HttpAgent({
        identity,
        host: 'https://ic0.app',
    });

    // Create actor with ckBTC canister ID
    const actor = Actor.createActor(icrc1IdlFactory, {
        agent,
        canisterId: getCkBTCCanisterId(network),
    });

    try {
        // Get the principal from the identity
        const principal = identity.getPrincipal();

        // Create the account record
        const account = {
            owner: principal,
            subaccount: [], // None/empty for default subaccount
        };

        // @ts-ignore
        const balance = await actor.icrc1_balance_of(account);

        // Balance is in e8s (satoshi equivalent), convert to BTC
        const balanceBtc = (Number(balance) / 100000000).toFixed(8);
        return balanceBtc;
    } catch (error) {
        console.error("Error fetching ckBTC balance:", error);
        return '0.00000000';
    }
};
