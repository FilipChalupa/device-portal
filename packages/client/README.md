# @device-portal/client

Base WebRTC logic for Device Portal. This package provides the core `Initiator` and `Responder` classes that can be used independently of React.

## Install

```bash
npm install @device-portal/client
```

## Usage

Device Portal uses a signaling server to coordinate WebRTC connections. One peer acts as an **Initiator** (usually the producer of data) and one or more peers act as **Responders** (usually the consumers).

### Initiator (Producer)

The `Initiator` creates a room and waits for responders to join. It automatically initiates a WebRTC connection with each joining responder.

```typescript
import { Initiator } from '@device-portal/client'

const initiator = new Initiator('my-secret-room', {
	onMessage: (data, peerId) => {
		console.log(`Received from ${peerId}:`, data)
	},
	onPeersChange: (peers) => {
		console.log('Connected peers:', peers)
	},
	maxClients: 5, // Optional: limit number of connections
})

// Send data to all connected responders
initiator.send('Hello everyone!')

// Send data to a specific peer
// initiator.sendToPeer(somePeerId, 'Hello you!');

// Cleanup
// initiator.destroy();
```

### Responder (Consumer)

The `Responder` joins an existing room and waits for an offer from the initiator.

```typescript
import { Responder } from '@device-portal/client'

const responder = new Responder('my-secret-room', {
	onMessage: (data) => {
		console.log('Received from initiator:', data)
	},
})

// Send data back to the initiator
responder.send('I received your message!')

// Cleanup
// responder.destroy();
```

## Features

- Core WebRTC abstraction (`Peer`, `Initiator`, `Responder`)
- Signaling server client implementation
- **Browser Direct**: High-performance internal communication using `BroadcastChannel` and `EventTarget` when peers are in the same browser, bypassing WebRTC entirely for local communication.
- **Offline/Serverless support**: Can work entirely without a signaling server for same-browser scenarios.
- Peer ID branding and utilities
- Automatic reconnection logic
- Support for multiple consumers per producer

## Browser Direct

When both the `Initiator` and `Responder` are running in the same browser (different tabs or same tab), `@device-portal/client` can utilize direct browser APIs (`BroadcastChannel` and `EventTarget`) for communication instead of WebRTC. This is faster, more reliable, and works offline.

By default, `browserDirect` is `true`.

### Browser Direct Options

- `true` (default): Communication across all tabs in the same browser.
- `'same-window-only'`: Communication only within the same tab/window.
- `false`: Disable direct browser communication (always use WebRTC).

```typescript
const initiator = new Initiator('my-room', {
	browserDirect: 'same-window-only',
})
```

### Signaling Server

To use a custom signaling server or disable it:

```typescript
const initiator = new Initiator('my-room', {
	webSocketServer: 'wss://your-server.com',
})

// Disable signaling server (Browser Direct only)
const responder = new Responder('my-room', {
	webSocketServer: null,
})
```
