/**
 * Photon Wallet Provider
 * This script is injected into web pages and creates the window.photon object
 * that dApps use to interact with the wallet.
 */

(function () {
    'use strict';

    // Prevent double injection
    if (window.photon) {
        console.warn('Photon provider already injected');
        return;
    }

    // Event emitter for handling events
    class EventEmitter {
        constructor() {
            this.events = {};
        }

        on(event, callback) {
            if (!this.events[event]) {
                this.events[event] = [];
            }
            this.events[event].push(callback);
        }

        removeListener(event, callback) {
            if (!this.events[event]) return;
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        }

        emit(event, data) {
            if (!this.events[event]) return;
            this.events[event].forEach(callback => callback(data));
        }
    }

    // Request ID counter for tracking requests
    let requestId = 0;

    // Pending requests waiting for response
    const pendingRequests = new Map();

    // Create the Photon provider
    class PhotonProvider extends EventEmitter {
        constructor() {
            super();
            this.isPhoton = true;
            this.isConnected = false;
            this.selectedAddress = null;
            this.network = null;

            // Listen for responses from content script
            window.addEventListener('message', (event) => {
                // Only accept messages from same window
                if (event.source !== window) return;

                // Only handle Photon responses
                if (event.data.type === 'PHOTON_RESPONSE') {
                    const { id, result, error } = event.data;
                    const pending = pendingRequests.get(id);

                    if (pending) {
                        pendingRequests.delete(id);
                        if (error) {
                            pending.reject(new Error(error));
                        } else {
                            pending.resolve(result);
                        }
                    }
                }

                // Handle events from wallet
                if (event.data.type === 'PHOTON_EVENT') {
                    const { event: eventName, data } = event.data;
                    this.emit(eventName, data);

                    // Update internal state
                    if (eventName === 'accountsChanged') {
                        this.selectedAddress = data[0] || null;
                        this.isConnected = !!data[0];
                    } else if (eventName === 'networkChanged') {
                        this.network = data;
                    } else if (eventName === 'disconnect') {
                        this.isConnected = false;
                        this.selectedAddress = null;
                    }
                }
            });
        }

        // Send request to content script
        _sendRequest(method, params = {}) {
            return new Promise((resolve, reject) => {
                const id = ++requestId;

                pendingRequests.set(id, { resolve, reject });

                // Post message to content script
                window.postMessage({
                    type: 'PHOTON_REQUEST',
                    id,
                    method,
                    params
                }, '*');

                // Timeout after 60 seconds
                setTimeout(() => {
                    if (pendingRequests.has(id)) {
                        pendingRequests.delete(id);
                        reject(new Error('Request timeout'));
                    }
                }, 60000);
            });
        }

        // Request connection to wallet
        async connect() {
            const result = await this._sendRequest('connect');
            this.isConnected = true;
            this.selectedAddress = result.address;
            this.network = result.network;
            return result;
        }

        // Disconnect from wallet
        async disconnect() {
            const result = await this._sendRequest('disconnect');
            this.isConnected = false;
            this.selectedAddress = null;
            return result;
        }

        // Get connected accounts
        async getAccounts() {
            const result = await this._sendRequest('getAccounts');
            return result.accounts || [];
        }

        // Get current network
        async getNetwork() {
            const result = await this._sendRequest('getNetwork');
            return result.network;
        }

        // Get wallet balance
        async getBalance() {
            const result = await this._sendRequest('getBalance');
            return result.balance;
        }

        // Sign a Bitcoin transaction
        async signTransaction(txData) {
            if (!txData || !txData.to || !txData.amount) {
                throw new Error('Invalid transaction data. Required: to, amount');
            }
            const result = await this._sendRequest('signTransaction', txData);
            return result.signedTx;
        }

        // Sign an arbitrary message
        async signMessage(message) {
            if (!message) {
                throw new Error('Message is required');
            }
            const result = await this._sendRequest('signMessage', { message });
            return result.signature;
        }

        // Send Bitcoin transaction
        async sendTransaction(txData) {
            if (!txData || !txData.to || !txData.amount) {
                throw new Error('Invalid transaction data. Required: to, amount');
            }
            const result = await this._sendRequest('sendTransaction', txData);
            return result.txId;
        }
    }

    // Create and expose the provider
    const photonProvider = new PhotonProvider();

    // Make it non-configurable and non-writable
    Object.defineProperty(window, 'photon', {
        value: photonProvider,
        writable: false,
        configurable: false
    });

    // Announce to the page that Photon is available
    window.dispatchEvent(new Event('photon#initialized'));

    console.log('Photon Wallet provider injected successfully');
})();
