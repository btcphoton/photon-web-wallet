# PhotonBolt Developer Portal

This folder is a static documentation site intended to be served from:

- `https://developer.photonbolt.xyz/`

## Folder layout

- `index.html`
- `developer-guides/getting-started/index.html`
- `developer-guides/connect-apps/index.html`
- `developer-guides/balances-and-transactions/index.html`
- `examples/index.html`
- `resources/index.html`
- `troubleshooting/index.html`
- `assets/docs.css`
- `assets/docs.js`

## Deployment note

To "park" this portal at `developer.photonbolt.xyz`, publish the contents of `docs/developer/` as the web root for that subdomain.

Examples:

- Nginx document root points to a deployed copy of this folder.
- Static hosting bucket uploads this folder with `index.html` at the root.
- GitHub Pages or similar static host publishes this folder as the site root.

The HTML pages use root-relative links such as `/developer-guides/getting-started/` and `/assets/docs.css`, so the folder should be served at the subdomain root, not nested under another path.
