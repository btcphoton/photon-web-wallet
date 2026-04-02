import { getStorageData } from './storage';

export type WalletNetwork = 'mainnet' | 'testnet3' | 'testnet4' | 'regtest';
export type BackendProfileId = 'legacy-public' | 'photon-dev-regtest';

export interface BackendProfileDefinition {
    id: BackendProfileId;
    name: string;
    description: string;
}

export const DEFAULT_BACKEND_PROFILE_ID: BackendProfileId = 'legacy-public';

export const BACKEND_PROFILES: BackendProfileDefinition[] = [
    {
        id: 'legacy-public',
        name: 'Current Public Servers',
        description: 'Keeps the existing public mempool/blockstream behavior intact.',
    },
    {
        id: 'photon-dev-regtest',
        name: 'Photon Dev Regtest',
        description: 'Uses Photon dev services for regtest while keeping other networks on public APIs.',
    },
];

function envString(value: string | undefined, fallback: string): string {
    const trimmed = value?.trim();
    return trimmed ? trimmed : fallback;
}

export const PUBLIC_ELECTRUM_DEFAULT = envString(
    import.meta.env.VITE_PUBLIC_ELECTRUM_DEFAULT,
    'ssl://electrum.iriswallet.com:50013'
);
export const PUBLIC_RGB_PROXY_DEFAULT = envString(
    import.meta.env.VITE_PUBLIC_RGB_PROXY_DEFAULT,
    'https://dev-proxy.photonbolt.xyz/json-rpc'
);
export const PHOTON_REGTEST_ELECTRUM = envString(
    import.meta.env.VITE_PHOTON_REGTEST_ELECTRUM,
    'ssl://dev-index.photonbolt.xyz:50002'
);
export const PHOTON_REGTEST_RGB_PROXY = envString(
    import.meta.env.VITE_PHOTON_REGTEST_RGB_PROXY,
    'https://dev-proxy.photonbolt.xyz/json-rpc'
);
export const PHOTON_REGTEST_API_BASE = envString(
    import.meta.env.VITE_PHOTON_REGTEST_API_BASE,
    'https://faucet.photonbolt.xyz/api'
);

export const getDefaultElectrumServer = (
    network: WalletNetwork,
    profileId: BackendProfileId = DEFAULT_BACKEND_PROFILE_ID
): string => {
    if (profileId === 'photon-dev-regtest' && network === 'regtest') {
        return PHOTON_REGTEST_ELECTRUM;
    }
    return PUBLIC_ELECTRUM_DEFAULT;
};

export const getDefaultRgbProxy = (
    network: WalletNetwork,
    profileId: BackendProfileId = DEFAULT_BACKEND_PROFILE_ID
): string => {
    if (profileId === 'photon-dev-regtest' && network === 'regtest') {
        return PHOTON_REGTEST_RGB_PROXY;
    }
    return PUBLIC_RGB_PROXY_DEFAULT;
};

export const getBackendProfileById = (
    profileId: BackendProfileId = DEFAULT_BACKEND_PROFILE_ID
): BackendProfileDefinition => {
    return (
        BACKEND_PROFILES.find((profile) => profile.id === profileId) ||
        BACKEND_PROFILES[0]
    );
};

export const getActiveBackendProfileId = async (): Promise<BackendProfileId> => {
    const result = await getStorageData(['backendProfileId']);
    const profileId = result.backendProfileId;
    if (profileId === 'photon-dev-regtest' || profileId === 'legacy-public') {
        return profileId;
    }
    return DEFAULT_BACKEND_PROFILE_ID;
};

export const resolveBitcoinApiBase = async (
    network: WalletNetwork,
    activity: 'fees' | 'address' | 'utxo' | 'broadcast' | 'activities'
): Promise<string> => {
    const profileId = await getActiveBackendProfileId();

    if (profileId === 'photon-dev-regtest' && network === 'regtest') {
        switch (activity) {
            case 'fees':
                return `${PHOTON_REGTEST_API_BASE}/v1/fees/recommended`;
            case 'address':
            case 'utxo':
            case 'activities':
            case 'broadcast':
                return PHOTON_REGTEST_API_BASE;
        }
    }

    if (activity === 'fees') {
        if (network === 'testnet3') return 'https://mempool.space/testnet/api/v1/fees/recommended';
        if (network === 'testnet4') return 'https://mempool.space/testnet4/api/v1/fees/recommended';
        return 'https://mempool.space/api/v1/fees/recommended';
    }

    if (network === 'testnet3') return 'https://mempool.space/testnet/api';
    if (network === 'testnet4') return 'https://mempool.space/testnet4/api';
    if (network === 'regtest') return 'https://blockstream.info/testnet/api';
    return 'https://mempool.space/api';
};
