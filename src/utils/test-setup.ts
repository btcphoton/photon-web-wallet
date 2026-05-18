import { webcrypto } from 'node:crypto'

// Polyfill Web Crypto API for Node.js test environment
if (typeof globalThis.crypto === 'undefined') {
    Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        writable: false,
    })
}
