# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Local Test Wallet File

The wallet can optionally expose `Use Test Wallet` and `Use Test Password` shortcuts for local QA only.

Those controls are enabled only when a valid local file exists at:

`public/photonlabs.txt`

This file is intentionally ignored by git and should never be committed with real values.

### Setup

1. Copy the example file:

```bash
cp public/photonlabs.example.txt public/photonlabs.txt
```

2. Replace the placeholder values with a real mnemonic and password:

```json
{
  "mnemonic": "your twelve word mnemonic here",
  "password": "your-test-password"
}
```

3. Run a build:

```bash
npm run build
```

4. Confirm the built extension contains:

`dist/photonlabs.txt`

5. Load or reload the unpacked extension from `dist/`.

### Behavior

- If `public/photonlabs.txt` is missing, the test controls stay hidden.
- If the file exists but is malformed, empty, or still contains `"..."`, the test controls stay hidden.
- If the file contains a valid mnemonic and password, the test controls become visible on the restore and password screens.

### Files

- Tracked example: `public/photonlabs.example.txt`
- Local-only override: `public/photonlabs.txt`

## Endpoint Configuration

The wallet separates public-network defaults from Photon regtest defaults through Vite environment variables.

Copy `.env.example` to `.env` when you need to override endpoint defaults for a build:

```bash
cp .env.example .env
```

Available variables:

- `VITE_PUBLIC_ELECTRUM_DEFAULT`
- `VITE_PUBLIC_RGB_PROXY_DEFAULT`
- `VITE_PHOTON_REGTEST_ELECTRUM`
- `VITE_PHOTON_REGTEST_RGB_PROXY`
- `VITE_PHOTON_REGTEST_API_BASE`

These values control:

- public Electrum and RGB proxy defaults for non-regtest networks
- Photon regtest Electrum, RGB proxy, and faucet API endpoints for the `photon-dev-regtest` profile

If `.env` is not present, the current built-in defaults remain unchanged.
