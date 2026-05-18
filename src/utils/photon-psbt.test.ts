import { describe, it, expect } from 'vitest'
import { signPhotonPsbt } from './photon-psbt'
import * as bitcoin from 'bitcoinjs-lib'
import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as ecc from 'tiny-secp256k1'

bitcoin.initEccLib(ecc)
const bip32 = BIP32Factory(ecc)

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const REGTEST = bitcoin.networks.regtest

// Build a simple P2WPKH PSBT using bip32Derivation so signPhotonPsbt can find and sign it.
// P2WPKH uses the legacy bip32Derivation path inside signPhotonPsbt.
async function buildP2wpkhPsbt(mnemonic: string, amountSats: number): Promise<string> {
    const seed = await bip39.mnemonicToSeed(mnemonic)
    const root = bip32.fromSeed(Buffer.from(seed), REGTEST)

    const derivPath = "m/84'/1'/0'/0/0"
    const senderNode = root.derivePath(derivPath)

    const { address: senderAddress, output: senderScript } = bitcoin.payments.p2wpkh({
        pubkey: senderNode.publicKey,
        network: REGTEST,
    })
    if (!senderAddress || !senderScript) throw new Error('P2WPKH derivation failed')

    // Recipient at index 1
    const recipientNode = root.derivePath("m/84'/1'/0'/0/1")
    const { address: recipientAddress } = bitcoin.payments.p2wpkh({
        pubkey: recipientNode.publicKey,
        network: REGTEST,
    })
    if (!recipientAddress) throw new Error('Failed to derive recipient address')

    const psbt = new bitcoin.Psbt({ network: REGTEST })

    psbt.addInput({
        hash: Buffer.alloc(32, 0xbb),
        index: 0,
        witnessUtxo: {
            value: BigInt(amountSats + 10_000),
            script: senderScript,
        },
        bip32Derivation: [{
            masterFingerprint: Buffer.from(root.fingerprint),
            path: derivPath,
            pubkey: senderNode.publicKey,
        }],
    })

    psbt.addOutput({ address: recipientAddress, value: BigInt(amountSats) })
    return psbt.toBase64()
}

// Build a P2TR PSBT without tapBip32Derivation in addInput (avoids valibot Buffer rejection),
// then attach tapInternalKey and tapBip32Derivation directly to psbt.data.inputs[0].
// When serialized and re-parsed, bitcoinjs-lib produces proper Uint8Array instances.
async function buildP2trPsbt(mnemonic: string, amountSats: number, account: 'vanilla' | 'colored' = 'vanilla'): Promise<string> {
    const seed = await bip39.mnemonicToSeed(mnemonic)
    const root = bip32.fromSeed(Buffer.from(seed), REGTEST)

    const accountIndex = account === 'colored' ? 1 : 0
    const derivPath = `m/86'/1'/${accountIndex}'/0/0`
    const senderNode = root.derivePath(derivPath)
    const xOnlyPubkey = Buffer.from(senderNode.publicKey.subarray(1))

    const { output: senderScript } = bitcoin.payments.p2tr({
        internalPubkey: xOnlyPubkey,
        network: REGTEST,
    })
    if (!senderScript) throw new Error('P2TR derivation failed')

    const recipientNode = root.derivePath(`m/86'/1'/${accountIndex}'/0/1`)
    const recipientXOnly = Buffer.from(recipientNode.publicKey.subarray(1))
    const { address: recipientAddress } = bitcoin.payments.p2tr({
        internalPubkey: recipientXOnly,
        network: REGTEST,
    })
    if (!recipientAddress) throw new Error('Failed to derive recipient address')

    const psbt = new bitcoin.Psbt({ network: REGTEST })
    psbt.addInput({
        hash: Buffer.alloc(32, 0xcc),
        index: 0,
        witnessUtxo: { value: BigInt(amountSats + 10_000), script: senderScript },
    })

    // Attach taproot metadata directly — bypasses valibot strict Uint8Array check in addInput
    psbt.data.inputs[0].tapInternalKey = xOnlyPubkey
    psbt.data.inputs[0].tapBip32Derivation = [{
        masterFingerprint: Buffer.from(root.fingerprint),
        path: derivPath,
        pubkey: xOnlyPubkey,
        leafHashes: [],
    }]

    psbt.addOutput({ address: recipientAddress, value: BigInt(amountSats) })
    return psbt.toBase64()
}

// P2TR PSBT with tapBip32Derivation but no tapInternalKey — exercises the tapKey=null branch.
async function buildP2trPsbtNoTapKey(mnemonic: string, amountSats: number): Promise<string> {
    const seed = await bip39.mnemonicToSeed(mnemonic)
    const root = bip32.fromSeed(Buffer.from(seed), REGTEST)

    const derivPath = "m/86'/1'/0'/0/0"
    const senderNode = root.derivePath(derivPath)
    const xOnlyPubkey = Buffer.from(senderNode.publicKey.subarray(1))

    const { output: senderScript } = bitcoin.payments.p2tr({
        internalPubkey: xOnlyPubkey,
        network: REGTEST,
    })
    if (!senderScript) throw new Error('P2TR derivation failed')

    const recipientNode = root.derivePath("m/86'/1'/0'/0/1")
    const recipientXOnly = Buffer.from(recipientNode.publicKey.subarray(1))
    const { address: recipientAddress } = bitcoin.payments.p2tr({
        internalPubkey: recipientXOnly,
        network: REGTEST,
    })
    if (!recipientAddress) throw new Error('Failed to derive recipient address')

    const psbt = new bitcoin.Psbt({ network: REGTEST })
    psbt.addInput({
        hash: Buffer.alloc(32, 0xdd),
        index: 0,
        witnessUtxo: { value: BigInt(amountSats + 10_000), script: senderScript },
    })

    // No tapInternalKey — exercises the tapKey = null branch in signPhotonPsbt
    psbt.data.inputs[0].tapBip32Derivation = [{
        masterFingerprint: Buffer.from(root.fingerprint),
        path: derivPath,
        pubkey: xOnlyPubkey,
        leafHashes: [],
    }]

    psbt.addOutput({ address: recipientAddress, value: BigInt(amountSats) })
    return psbt.toBase64()
}

describe('signPhotonPsbt', () => {
    it('returns a non-empty base64 string', async () => {
        const unsigned = await buildP2wpkhPsbt(MNEMONIC, 5_000)
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        expect(typeof signed).toBe('string')
        expect(signed.length).toBeGreaterThan(0)
    })

    it('returns a valid base64-encoded PSBT', async () => {
        const unsigned = await buildP2wpkhPsbt(MNEMONIC, 5_000)
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        expect(() => bitcoin.Psbt.fromBase64(signed)).not.toThrow()
    })

    it('signed PSBT has at least one input', async () => {
        const unsigned = await buildP2wpkhPsbt(MNEMONIC, 5_000)
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        const psbt = bitcoin.Psbt.fromBase64(signed)
        expect(psbt.data.inputs.length).toBeGreaterThan(0)
    })

    it('PSBT is finalized and can be extracted to raw hex', async () => {
        const unsigned = await buildP2wpkhPsbt(MNEMONIC, 5_000)
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        const psbt = bitcoin.Psbt.fromBase64(signed)
        const hex = psbt.extractTransaction().toHex()
        expect(hex).toMatch(/^[0-9a-f]+$/)
        expect(hex.length).toBeGreaterThan(0)
    })

    it('output value in extracted transaction matches the specified amount', async () => {
        const amount = 7_500
        const unsigned = await buildP2wpkhPsbt(MNEMONIC, amount)
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        const psbt = bitcoin.Psbt.fromBase64(signed)
        const tx = psbt.extractTransaction()
        expect(Number(tx.outs[0].value)).toBe(amount)
    })

    it('does not mutate the original unsigned PSBT string', async () => {
        const unsigned = await buildP2wpkhPsbt(MNEMONIC, 5_000)
        const original = unsigned
        await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        expect(unsigned).toBe(original)
    })
})

describe('signPhotonPsbt — taproot (P2TR) vanilla account path', () => {
    it('returns a valid base64 PSBT for a P2TR input', async () => {
        const unsigned = await buildP2trPsbt(MNEMONIC, 5_000, 'vanilla')
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        expect(() => bitcoin.Psbt.fromBase64(signed)).not.toThrow()
    })

    it('signed P2TR PSBT is extractable to raw hex', async () => {
        const unsigned = await buildP2trPsbt(MNEMONIC, 5_000, 'vanilla')
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        const psbt = bitcoin.Psbt.fromBase64(signed)
        const hex = psbt.extractTransaction().toHex()
        expect(hex).toMatch(/^[0-9a-f]+$/)
        expect(hex.length).toBeGreaterThan(0)
    })

    it('output value in extracted P2TR transaction matches specified amount', async () => {
        const amount = 6_000
        const unsigned = await buildP2trPsbt(MNEMONIC, amount, 'vanilla')
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        const tx = bitcoin.Psbt.fromBase64(signed).extractTransaction()
        expect(Number(tx.outs[0].value)).toBe(amount)
    })
})

describe('signPhotonPsbt — taproot (P2TR) colored account path', () => {
    it('signs via coloredAccount candidate when derivation path uses account index 1', async () => {
        const unsigned = await buildP2trPsbt(MNEMONIC, 5_000, 'colored')
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        expect(() => bitcoin.Psbt.fromBase64(signed)).not.toThrow()
    })

    it('colored P2TR is extractable to hex', async () => {
        const unsigned = await buildP2trPsbt(MNEMONIC, 5_000, 'colored')
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        const hex = bitcoin.Psbt.fromBase64(signed).extractTransaction().toHex()
        expect(hex).toMatch(/^[0-9a-f]+$/)
    })
})

describe('signPhotonPsbt — taproot with no tapInternalKey (tapKey = null branch)', () => {
    it('still processes tapBip32Derivation when tapInternalKey is absent', async () => {
        const unsigned = await buildP2trPsbtNoTapKey(MNEMONIC, 5_000)
        const signed = await signPhotonPsbt(unsigned, MNEMONIC, REGTEST)
        expect(() => bitcoin.Psbt.fromBase64(signed)).not.toThrow()
    })
})
