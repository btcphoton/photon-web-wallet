/**
 * Photon Wallet Content Script
 * This script runs in the context of web pages and acts as a bridge between
 * the injected provider script and the background service worker.
 */

(function () {
    'use strict';

    // Inject the provider script into the page
    function injectProvider() {
        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('provider.js');
            script.onload = function () {
                this.remove();
            };
            (document.head || document.documentElement).appendChild(script);
        } catch (error) {
            console.error('Failed to inject Photon provider:', error);
        }
    }

    // Inject provider immediately
    injectProvider();

    // Listen for messages from the provider (page context)
    window.addEventListener('message', async (event) => {
        // Only accept messages from same window
        if (event.source !== window) return;

        // Only handle Photon requests
        if (event.data.type !== 'PHOTON_REQUEST') return;

        const { id, method, params } = event.data;

        try {
            // Forward request to background script
            const response = await chrome.runtime.sendMessage({
                type: 'PHOTON_REQUEST',
                id,
                method,
                params,
                origin: window.location.origin
            });

            // Send response back to provider
            window.postMessage({
                type: 'PHOTON_RESPONSE',
                id,
                result: response.result,
                error: response.error
            }, '*');
        } catch (error) {
            // Send error back to provider
            window.postMessage({
                type: 'PHOTON_RESPONSE',
                id,
                error: error.message || 'Unknown error'
            }, '*');
        }
    });

    // Listen for events from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'PHOTON_EVENT') {
            // Forward event to provider
            window.postMessage({
                type: 'PHOTON_EVENT',
                event: message.event,
                data: message.data
            }, '*');
        }
    });

    console.log('Photon Wallet content script loaded');
})();
