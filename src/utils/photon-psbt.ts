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

  // rgb_lib embeds a fake coin type (827167) in PSBT tapBip32Derivation paths.
  // Actual keys live at m/86'/1'/0' (vanilla) and m/86'/1'/1' (colored).
  // We try both account xpubs with the relative suffix extracted from the path.
  const vanillaAccount = root.derivePath("m/86'/1'/0'")
  const coloredAccount = root.derivePath("m/86'/1'/1'")

  const psbt = bitcoin.Psbt.fromBase64(unsignedPsbtBase64)
  psbt.data.inputs.forEach((input, i) => {
    // Legacy + SegWit (P2PKH, P2WPKH, P2SH-P2WPKH) — full root paths
    const derivations = input.bip32Derivation || []
    for (const d of derivations) {
      try {
        const keyNode = root.derivePath(d.path)
        psbt.signInput(i, keyNode)
      } catch (_) { /* wrong key for this input */ }
    }

    // Taproot key-path (P2TR)
    const tapDerivations = input.tapBip32Derivation || []
    for (const d of tapDerivations) {
      const tapKey = input.tapInternalKey
        ? Buffer.from(input.tapInternalKey)
        : null

      // The relative suffix is the last two unhardened segments, e.g. "0/11"
      const parts = d.path.split('/')
      const relPath = parts.slice(-2).join('/')

      // Candidates: rgb_lib's embedded full path, then vanilla and colored accounts
      const getCandidates = [
        () => root.derivePath(d.path),
        () => vanillaAccount.derivePath(relPath),
        () => coloredAccount.derivePath(relPath),
      ]

      for (const getNode of getCandidates) {
        try {
          const keyNode = getNode()
          const xOnlyPubkey = Buffer.from(keyNode.publicKey.subarray(1))

          // Skip if this key doesn't match the input's tapInternalKey
          if (tapKey && Buffer.compare(xOnlyPubkey, tapKey) !== 0) continue

          const tweakHash = bitcoin.crypto.taggedHash('TapTweak', xOnlyPubkey)
          const tweakedNode = keyNode.tweak(tweakHash)
          psbt.signInput(i, tweakedNode)
          break
        } catch (_) { /* wrong key or already signed */ }
      }
    }
  })
  try { psbt.finalizeAllInputs() } catch (_) { /* some inputs may already be finalized */ }
  return psbt.toBase64()
}
