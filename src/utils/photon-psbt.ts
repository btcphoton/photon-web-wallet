import * as bip39 from 'bip39'
import * as bitcoin from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'
import * as ecc from 'tiny-secp256k1'

bitcoin.initEccLib(ecc)
const bip32 = BIP32Factory(ecc)

export async function signPhotonPsbt(
  unsignedPsbtBase64: string,
  mnemonic: string,
  network: bitcoin.Network = bitcoin.networks.regtest,
): Promise<string> {
  const seed = await bip39.mnemonicToSeed(mnemonic)
  const root = bip32.fromSeed(Buffer.from(seed), network)
  const psbt = bitcoin.Psbt.fromBase64(unsignedPsbtBase64)
  psbt.data.inputs.forEach((input, i) => {
    // Legacy + SegWit (P2PKH, P2WPKH, P2SH-P2WPKH)
    const derivations = input.bip32Derivation || []
    for (const d of derivations) {
      try {
        const keyNode = root.derivePath(d.path)
        psbt.signInput(i, keyNode)
      } catch (_) { /* wrong key for this input, continue */ }
    }

    // Taproot key-path (P2TR) — uses tapBip32Derivation
    const tapDerivations = input.tapBip32Derivation || []
    for (const d of tapDerivations) {
      try {
        const keyNode = root.derivePath(d.path)
        const xOnlyPubkey = keyNode.publicKey.subarray(1) // 32-byte x-only
        const tweakHash = bitcoin.crypto.taggedHash('TapTweak', xOnlyPubkey)
        const tweakedNode = keyNode.tweak(tweakHash)
        psbt.signInput(i, tweakedNode)
      } catch (_) { /* wrong key for this input, continue */ }
    }
  })
  try { psbt.finalizeAllInputs() } catch (_) { /* some inputs may already be finalized */ }
  return psbt.toBase64()
}
