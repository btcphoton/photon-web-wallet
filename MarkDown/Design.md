The Steps: How PHO Moves from Wallet to Server
Invoice Generation: The Receiver (e.g., the Master Node) creates a Lightning Invoice specifically for the PHO asset. This invoice contains a "Secret Hash" that act as a lock.

Request from Wallet: You paste that invoice into your Photon-web wallet (Chrome Extension) and hit "Pay."

API Authorization: The wallet sends the invoice and your unique wallet-key to the Node.js Gateway via an encrypted HTTPS call.

Node Command: The Gateway identifies your specific User RLN Node and tells it to "Pay this Invoice."

Lightning Secret Handshake: Your User Node talks directly to the Master Node. They trade the "Secret Hash" for a "Proof of Payment." This happens in milliseconds and moves the PHO balance off-chain (No blocks needed).

Consignment Delivery (The Proof): Because PHO is an RGB asset, your User Node creates a "Digital Receipt" (Consignment). It uploads this to the RGB Proxy so the Master Node can prove it now "owns" that specific PHO sticker.

Balance Update: The User Node updates its local database (rgb_lib_db). The Wallet UI then refreshes to show you now have 9 PHO outbound and 1 PHO inbound space.
