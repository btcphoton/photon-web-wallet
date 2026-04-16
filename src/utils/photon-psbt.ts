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
    const derivations = input.bip32Derivation || []
    for (const d of derivations) {
      try {
        const keyNode = root.derivePath(d.path)
        psbt.signInput(i, keyNode)
      } catch (_) { /* wrong key for this input, continue */ }
    }
  })
  try { psbt.finalizeAllInputs() } catch (_) { /* some inputs may already be finalized */ }
  return psbt.toBase64()
}
