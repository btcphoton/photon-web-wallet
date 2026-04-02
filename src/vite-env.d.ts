/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ELECTRUM_DEFAULT?: string;
  readonly VITE_PUBLIC_RGB_PROXY_DEFAULT?: string;
  readonly VITE_PHOTON_REGTEST_ELECTRUM?: string;
  readonly VITE_PHOTON_REGTEST_RGB_PROXY?: string;
  readonly VITE_PHOTON_REGTEST_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
