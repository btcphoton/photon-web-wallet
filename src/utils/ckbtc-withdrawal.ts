import { Actor, HttpAgent } from '@dfinity/agent';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import * as bip39 from 'bip39';
import type { NetworkEnum } from './icp';
import { getWalletAddress } from './icp';

// ckBTC Ledger and Minter canister IDs
const CKBTC_LEDGER_IDS = {
    Mainnet: 'mxzaz-hqaaa-aaaar-qaada-cai',
    Testnet: 'mc6ru-gyaaa-aaaar-qaaaq-cai', // ckTESTBTC
    Regtest: 'mc6ru-gyaaa-aaaar-qaaaq-cai',
};

const CKBTC_MINTER_IDS = {
    Mainnet: 'mqygn-kiaaa-aaaar-qaadq-cai',
    Testnet: 'ml52i-qqaaa-aaaar-qaaba-cai', // ckTESTBTC Minter
    Regtest: 'ml52i-qqaaa-aaaar-qaaba-cai',
};

// IDL for ICRC-2 Ledger (approval)
const icrc2LedgerIdlFactory = ({ IDL }: any) => {
    const Account = IDL.Record({
        'owner': IDL.Principal,
        'subaccount': IDL.Opt(IDL.Vec(IDL.Nat8)),
    });

    const ApproveArgs = IDL.Record({
        'fee': IDL.Opt(IDL.Nat),
        'memo': IDL.Opt(IDL.Vec(IDL.Nat8)),
        'from_subaccount': IDL.Opt(IDL.Vec(IDL.Nat8)),
        'created_at_time': IDL.Opt(IDL.Nat64),
        'amount': IDL.Nat,
        'expected_allowance': IDL.Opt(IDL.Nat),
        'expires_at': IDL.Opt(IDL.Nat64),
        'spender': Account,
    });

    const ApproveError = IDL.Variant({
        'GenericError': IDL.Record({ 'message': IDL.Text, 'error_code': IDL.Nat }),
        'TemporarilyUnavailable': IDL.Null,
        'Duplicate': IDL.Record({ 'duplicate_of': IDL.Nat }),
        'BadFee': IDL.Record({ 'expected_fee': IDL.Nat }),
        'AllowanceChanged': IDL.Record({ 'current_allowance': IDL.Nat }),
        'CreatedInFuture': IDL.Record({ 'ledger_time': IDL.Nat64 }),
        'TooOld': IDL.Null,
        'Expired': IDL.Record({ 'ledger_time': IDL.Nat64 }),
        'InsufficientFunds': IDL.Record({ 'balance': IDL.Nat }),
    });

    return IDL.Service({
        'icrc2_approve': IDL.Func(
            [ApproveArgs],
            [IDL.Variant({ 'Ok': IDL.Nat, 'Err': ApproveError })],
            [],
        ),
    });
};

// IDL for ckBTC Minter (withdrawal)
const ckbtcMinterIdlFactory = ({ IDL }: any) => {
    const RetrieveBtcArgs = IDL.Record({
        'address': IDL.Text,
        'amount': IDL.Nat64,
    });

    const RetrieveBtcError = IDL.Variant({
        'MalformedAddress': IDL.Text,
        'AlreadyProcessing': IDL.Null,
        'AmountTooLow': IDL.Nat64,
        'InsufficientFunds': IDL.Record({ 'balance': IDL.Nat64 }),
        'TemporarilyUnavailable': IDL.Text,
        'GenericError': IDL.Record({ 'error_message': IDL.Text, 'error_code': IDL.Nat64 }),
    });

    const RetrieveBtcOk = IDL.Record({
        'block_index': IDL.Nat64,
    });

    return IDL.Service({
        'retrieve_btc_with_approval': IDL.Func(
            [RetrieveBtcArgs],
            [IDL.Variant({ 'Ok': RetrieveBtcOk, 'Err': RetrieveBtcError })],
            [],
        ),
    });
};

// Step 1: Approve ckBTC for spending
export const approveCkBTC = async (
    mnemonic: string,
    amount: number,
    network: NetworkEnum = 'Mainnet'
): Promise<bigint> => {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const seed32 = new Uint8Array(seed.slice(0, 32));
    const identity = Ed25519KeyIdentity.fromSecretKey(seed32);

    const agent = new HttpAgent({
        identity,
        host: 'https://ic0.app',
    });

    const ledgerCanisterId = CKBTC_LEDGER_IDS[network];
    const minterCanisterId = CKBTC_MINTER_IDS[network];

    const actor = Actor.createActor(icrc2LedgerIdlFactory, {
        agent,
        canisterId: ledgerCanisterId,
    });

    try {
        // Convert amount to e8s (satoshis) and add 10 sats for fee
        const amountE8s = BigInt(Math.floor(amount * 100000000));
        const approvalAmount = amountE8s + BigInt(10);

        const approveArgs = {
            fee: [],
            memo: [],
            from_subaccount: [],
            created_at_time: [],
            amount: approvalAmount,
            expected_allowance: [],
            expires_at: [],
            spender: {
                owner: Actor.canisterIdOf(Actor.createActor(ckbtcMinterIdlFactory, { agent, canisterId: minterCanisterId })),
                subaccount: [],
            },
        };

        // @ts-ignore
        const result: any = await actor.icrc2_approve(approveArgs);

        if ('Ok' in result) {
            console.log('Approval successful, block index:', result.Ok);
            return result.Ok as bigint;
        } else if ('Err' in result) {
            const error = result.Err as any;
            if ('InsufficientFunds' in error) {
                throw new Error(`Insufficient funds. Balance: ${Number(error.InsufficientFunds.balance) / 100000000} BTC`);
            } else if ('TemporarilyUnavailable' in error) {
                throw new Error('Service temporarily unavailable, please try again');
            } else if ('GenericError' in error) {
                throw new Error(`Approval failed: ${error.GenericError.message}`);
            } else {
                throw new Error(`Approval failed: ${JSON.stringify(error)}`);
            }
        }
        throw new Error('Unexpected approval result');
    } catch (error) {
        console.error('Error approving ckBTC:', error);
        throw error;
    }
};

// Step 2: Withdraw BTC using approval
export const withdrawCkBTC = async (
    mnemonic: string,
    amount: number,
    network: NetworkEnum = 'Mainnet'
): Promise<bigint> => {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const seed32 = new Uint8Array(seed.slice(0, 32));
    const identity = Ed25519KeyIdentity.fromSecretKey(seed32);

    const agent = new HttpAgent({
        identity,
        host: 'https://ic0.app',
    });

    const minterCanisterId = CKBTC_MINTER_IDS[network];

    // Get destination address
    const destinationAddress = await getWalletAddress(mnemonic, network);

    const actor = Actor.createActor(ckbtcMinterIdlFactory, {
        agent,
        canisterId: minterCanisterId,
    });

    try {
        // Convert amount to satoshis (Nat64)
        const amountSats = BigInt(Math.floor(amount * 100000000));

        const withdrawArgs = {
            address: destinationAddress,
            amount: amountSats,
        };

        // @ts-ignore
        const result: any = await actor.retrieve_btc_with_approval(withdrawArgs);

        if ('Ok' in result) {
            const okResult = result.Ok as any;
            console.log('Withdrawal successful, block index:', okResult.block_index);
            return okResult.block_index as bigint;
        } else if ('Err' in result) {
            const error = result.Err as any;
            if ('AmountTooLow' in error) {
                throw new Error(`Amount too low. Minimum: ${Number(error.AmountTooLow) / 100000000} BTC`);
            } else if ('InsufficientFunds' in error) {
                throw new Error(`Insufficient funds. Balance: ${Number(error.InsufficientFunds.balance) / 100000000} BTC`);
            } else if ('TemporarilyUnavailable' in error) {
                throw new Error(`Service temporarily unavailable: ${error.TemporarilyUnavailable}`);
            } else if ('MalformedAddress' in error) {
                throw new Error(`Invalid Bitcoin address: ${error.MalformedAddress}`);
            } else if ('AlreadyProcessing' in error) {
                throw new Error('A withdrawal is already being processed');
            } else if ('GenericError' in error) {
                throw new Error(`Withdrawal failed: ${error.GenericError.error_message}`);
            } else {
                throw new Error(`Withdrawal failed: ${JSON.stringify(error)}`);
            }
        }
        throw new Error('Unexpected withdrawal result');
    } catch (error) {
        console.error('Error withdrawing ckBTC:', error);
        throw error;
    }
};

// Complete flow: Approve + Withdraw
export const convertLBTCtoBTC = async (
    mnemonic: string,
    amount: number,
    network: NetworkEnum = 'Mainnet'
): Promise<{ blockIndex: bigint; message: string }> => {
    try {
        // Step 1: Approve
        console.log('Step 1: Approving ckBTC spending...');
        const approvalBlock = await approveCkBTC(mnemonic, amount, network);
        console.log('Approval successful, block:', approvalBlock);

        // Step 2: Withdraw
        console.log('Step 2: Withdrawing BTC...');
        const withdrawalBlock = await withdrawCkBTC(mnemonic, amount, network);
        console.log('Withdrawal successful, block:', withdrawalBlock);

        return {
            blockIndex: withdrawalBlock,
            message: `Bitcoin transaction broadcast! Block index: ${withdrawalBlock}`,
        };
    } catch (error) {
        console.error('Error converting LBTC to BTC:', error);
        throw error;
    }
};
