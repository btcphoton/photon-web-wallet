/**
 * MIG-001: Prism Authentication
 *
 * Fully automatic secp256k1 challenge-response auth against the RGBits Prism API.
 * The wallet derives a BIP86 Taproot keypair from the mnemonic, enrolls (idempotent),
 * obtains a nonce challenge, signs it, and exchanges the signature for JWT access +
 * opaque refresh tokens. Tokens are cached in storage and refreshed automatically.
 *
 * No manual token pasting required. The user never sees any of this.
 */

import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { getStorageData, setStorageData } from './storage';
import type { WalletNetwork } from './backend-config';

bitcoin.initEccLib(ecc);

type PrismAuthStage = 'refresh' | 'enroll' | 'challenge' | 'verify';

class PrismAuthStageError extends Error {
    stage: PrismAuthStage;

    constructor(stage: PrismAuthStage, message: string) {
        super(message);
        this.name = 'PrismAuthStageError';
        this.stage = stage;
    }
}

function asStageError(stage: PrismAuthStage, error: unknown): PrismAuthStageError {
    if (error instanceof PrismAuthStageError) {
        return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return new PrismAuthStageError(stage, message);
}

function formatStageLabel(stage: PrismAuthStage): string {
    if (stage === 'refresh') return 'refresh';
    if (stage === 'enroll') return 'enroll';
    if (stage === 'challenge') return 'challenge';
    return 'verify';
}

function buildStageMessage(stage: PrismAuthStage, error: unknown): Error {
    const stageError = asStageError(stage, error);
    return new Error(`Prism auth ${formatStageLabel(stageError.stage)} step failed: ${stageError.message}`);
}

// Derivation path: BIP86 Taproot, same coin-type logic as the rest of the wallet
function prismDerivationPath(network: WalletNetwork): string {
    const coinType = network === 'mainnet' ? 0 : 1;
    return `m/86'/${coinType}'/0'/0/0`;
}

function getBitcoinJsNetwork(network: WalletNetwork): bitcoin.Network {
    if (network === 'mainnet') return bitcoin.networks.bitcoin;
    if (network === 'regtest') return { ...bitcoin.networks.regtest, bech32: 'bcrt' };
    return bitcoin.networks.testnet;
}

export interface PrismKeypair {
    /** 33-byte compressed secp256k1 pubkey as lowercase hex (66 chars) */
    pubkeyHex: string;
    /** Raw 32-byte private key — kept in memory, never persisted */
    privKeyBytes: Uint8Array;
    /** Taproot P2TR address for this network */
    address: string;
}

export async function deriveKeypairFromMnemonic(
    mnemonic: string,
    network: WalletNetwork,
): Promise<PrismKeypair> {
    if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic');
    }

    const seed = await bip39.mnemonicToSeed(mnemonic);
    const btcNetwork = getBitcoinJsNetwork(network);
    const bip32 = BIP32Factory(ecc);
    const root = bip32.fromSeed(seed, btcNetwork);
    const child = root.derivePath(prismDerivationPath(network));

    if (!child.publicKey || !child.privateKey) {
        throw new Error('Failed to derive Prism keypair from mnemonic');
    }

    const internalPubkey = child.publicKey.slice(1, 33);
    const { address } = bitcoin.payments.p2tr({ internalPubkey, network: btcNetwork });
    if (!address) throw new Error('Failed to generate P2TR address for Prism identity');

    return {
        pubkeyHex: Buffer.from(child.publicKey).toString('hex'),
        privKeyBytes: new Uint8Array(child.privateKey),
        address,
    };
}

// POST /auth/enroll — idempotent, 409 means already registered
async function enrollIfNeeded(
    pubkeyHex: string,
    address: string,
    apiBase: string,
): Promise<void> {
    const url = `${apiBase}/auth/enroll`;
    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pubkey: pubkeyHex, bitcoin_address: address }),
        });
    } catch (err) {
        throw new Error(`Prism server unreachable at ${apiBase} — check the API Base URL in Network Settings (${err instanceof Error ? err.message : String(err)})`);
    }

    if (res.status === 409) return; // already enrolled — expected on subsequent calls

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(`Prism enroll failed (${res.status}): ${body.error ?? res.statusText}`);
    }
}

// GET /auth/challenge?pubkey=<hex> → { nonce: string }
async function getChallenge(pubkeyHex: string, apiBase: string): Promise<string> {
    const url = `${apiBase}/auth/challenge?pubkey=${encodeURIComponent(pubkeyHex)}`;
    const res = await fetch(url);

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(`Prism challenge failed (${res.status}): ${body.error ?? res.statusText}`);
    }

    const data = await res.json() as { nonce?: string };
    if (typeof data.nonce !== 'string' || !data.nonce) {
        throw new Error('Prism challenge response missing nonce field');
    }

    return data.nonce;
}

/**
 * Sign a Prism nonce for ECDSA challenge-response.
 *
 * Server verifies: sha256(hex.decode(nonce_hex)) then ECDSA compact sig.
 * We produce: ecc.sign(sha256(Buffer.from(nonceHex, 'hex')), privKeyBytes)
 * Returns: 64-byte compact signature as lowercase hex.
 */
function signNonce(nonceHex: string, privKeyBytes: Uint8Array): string {
    const nonceBytes = Buffer.from(nonceHex, 'hex');
    const digest = sha256(nonceBytes);
    const sig = ecc.sign(digest, privKeyBytes);
    return Buffer.from(sig).toString('hex');
}

interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number; // seconds
}

// POST /auth/verify → { access_token, refresh_token, expires_in }
async function verifyWithPrism(
    pubkeyHex: string,
    nonce: string,
    signature: string,
    apiBase: string,
): Promise<TokenResponse> {
    const res = await fetch(`${apiBase}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey: pubkeyHex, nonce, signature }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(`Prism verify failed (${res.status}): ${body.error ?? res.statusText}`);
    }

    const data = await res.json() as Partial<TokenResponse>;
    if (!data.access_token || !data.refresh_token || typeof data.expires_in !== 'number') {
        throw new Error('Prism verify response missing expected token fields');
    }

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
    };
}

// POST /auth/refresh → { access_token, expires_in }
async function refreshAccessToken(
    refreshToken: string,
    apiBase: string,
): Promise<{ access_token: string; expires_in: number }> {
    const res = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(`Prism refresh failed (${res.status}): ${body.error ?? res.statusText}`);
    }

    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token || typeof data.expires_in !== 'number') {
        throw new Error('Prism refresh response missing expected token fields');
    }

    return { access_token: data.access_token, expires_in: data.expires_in };
}

// How early to renew: 30 seconds before the access token expires
const EXPIRY_BUFFER_MS = 30_000;

/**
 * Returns a valid Prism Bearer access token, refreshing or re-authenticating as needed.
 *
 * Flow:
 *   1. If cached access token is still valid → return it immediately
 *   2. If refresh token exists → attempt silent refresh
 *   3. Full flow: enroll (idempotent) → challenge → sign → verify → store tokens
 *
 * @param mnemonic  BIP39 wallet mnemonic (read from session storage by the caller)
 * @param network   Active Bitcoin network (determines coin type and address format)
 * @param apiBase   Prism API base URL, e.g. "https://prism.photonbolt.xyz"
 */
export async function getValidAccessToken(
    mnemonic: string,
    network: WalletNetwork,
    apiBase: string,
): Promise<string> {
    const keypair = await deriveKeypairFromMnemonic(mnemonic, network);
    const now = Date.now();

    const stored = await getStorageData([
        'prismAccessToken',
        'prismRefreshToken',
        'prismTokenExpiry',
        'prismEnrolledPubkey',
    ]);

    const accessToken = typeof stored.prismAccessToken === 'string' ? stored.prismAccessToken : '';
    const refreshToken = typeof stored.prismRefreshToken === 'string' ? stored.prismRefreshToken : '';
    const expiry = typeof stored.prismTokenExpiry === 'number' ? stored.prismTokenExpiry : 0;
    const enrolledPubkey = typeof stored.prismEnrolledPubkey === 'string' ? stored.prismEnrolledPubkey : '';

    // If the wallet mnemonic has changed (keypair differs) we must re-enroll
    const keypairUnchanged = enrolledPubkey === keypair.pubkeyHex;

    // Step 1: cached access token still valid
    if (keypairUnchanged && accessToken && expiry - now > EXPIRY_BUFFER_MS) {
        return accessToken;
    }

    // Step 2: silent refresh using the 30-day refresh token
    if (keypairUnchanged && refreshToken) {
        try {
            const refreshed = await refreshAccessToken(refreshToken, apiBase);
            const newExpiry = now + refreshed.expires_in * 1000;
            await setStorageData({
                prismAccessToken: refreshed.access_token,
                prismTokenExpiry: newExpiry,
            });
            return refreshed.access_token;
        } catch (error) {
            console.warn(buildStageMessage('refresh', error).message);
            // Refresh token expired or revoked — fall through to full re-auth
        }
    }

    // Step 3: full challenge-response authentication
    try {
        await enrollIfNeeded(keypair.pubkeyHex, keypair.address, apiBase);
    } catch (error) {
        throw buildStageMessage('enroll', error);
    }

    let nonce: string;
    try {
        nonce = await getChallenge(keypair.pubkeyHex, apiBase);
    } catch (error) {
        throw buildStageMessage('challenge', error);
    }

    const signature = signNonce(nonce, keypair.privKeyBytes);
    let tokens: TokenResponse;
    try {
        tokens = await verifyWithPrism(keypair.pubkeyHex, nonce, signature, apiBase);
    } catch (error) {
        throw buildStageMessage('verify', error);
    }

    const newExpiry = now + tokens.expires_in * 1000;
    await setStorageData({
        prismAccessToken: tokens.access_token,
        prismRefreshToken: tokens.refresh_token,
        prismTokenExpiry: newExpiry,
        prismEnrolledPubkey: keypair.pubkeyHex,
    });

    return tokens.access_token;
}
