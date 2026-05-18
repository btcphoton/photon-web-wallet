import { defineConfig } from 'vitest/config'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      include: ['buffer', 'stream', 'util', 'events', 'process', 'vm'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['src/utils/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/utils/**/*.ts'],
      exclude: [
        'src/utils/**/*.test.ts',
        'src/utils/test-setup.ts',
        // External API clients — require live backends, not unit-testable
        'src/utils/photon-api.ts',
        'src/utils/photon-auth.ts',
        'src/utils/rgb-wallet.ts',
        'src/utils/rgb.ts',
        'src/utils/storage.ts',
        // ICP / Lightning — require canister connections
        'src/utils/icp.ts',
        'src/utils/icrc1.ts',
        'src/utils/dapp-bridge.ts',
        'src/utils/prism-auth.ts',
        'src/utils/ckbtc-withdrawal.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 80,
        branches: 70,
        statements: 70,
      },
    },
  },
})
