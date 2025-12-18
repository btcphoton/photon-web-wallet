import * as bip39 from 'bip39';
import { Ed25519KeyIdentity } from '@dfinity/identity';

export const generateMnemonic = (): string => {
    return bip39.generateMnemonic();
};

export const validateMnemonic = (mnemonic: string): boolean => {
    return bip39.validateMnemonic(mnemonic);
};

export const deriveIdentity = async (mnemonic: string): Promise<string> => {
    if (!validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic');
    }
    const seed = await bip39.mnemonicToSeed(mnemonic);
    // Use the first 32 bytes of the seed for Ed25519
    const seed32 = new Uint8Array(seed.slice(0, 32));
    const identity = Ed25519KeyIdentity.fromSecretKey(seed32);
    return identity.getPrincipal().toText();
};
