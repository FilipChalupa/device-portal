# @device-portal/client

Base WebRTC logic for Device Portal. This package provides the core `Host` and `Client` classes that can be used independently of React.

## Install

```bash
npm install @device-portal/client
```

## Usage

Device Portal uses a signaling server to coordinate WebRTC connections. One peer acts as a **Host** (the producer of data) and one or more peers act as **Clients**.

### Host

The `Host` creates a room and waits for clients to join. It automatically initiates a WebRTC connection with each joining client.

```typescript
import { Host } from '@device-portal/client'

const host = new Host('my-secret-room', {
	onMessage: (data, peerId) => {
		console.log(`Received from ${peerId}:`, data)
	},
	onPeersChange: (peers) => {
		console.log('Connected peers:', peers)
	},
	maxClients: 5, // Optional: limit number of connections
})

// Send data to all connected clients
host.send('Hello everyone!')

// Send data to a specific peer
// host.sendToPeer(somePeerId, 'Hello you!');

// Cleanup
// host.destroy();
```

### Client

The `Client` joins an existing room and waits for an offer from the host.

```typescript
import { Client } from '@device-portal/client'

const client = new Client('my-secret-room', {
	onMessage: (data) => {
		console.log('Received from host:', data)
	},
})

// Send data back to the host
client.send('I received your message!')

// Cleanup
// client.destroy();
```

## Features

- Core WebRTC abstraction (`Host`, `Client`)
- Signaling server client implementation
- **Browser Direct**: High-performance internal communication using `BroadcastChannel` and `EventTarget` when peers are in the same browser, bypassing WebRTC entirely for local communication.
- **Offline/Serverless support**: Can work entirely without a signaling server for same-browser scenarios.
- Peer ID branding and utilities
- Automatic reconnection logic
- Support for multiple clients per host

## Browser Direct

When both the `Host` and `Client` are running in the same browser (different tabs or same tab), `@device-portal/client` can utilize direct browser APIs (`BroadcastChannel` and `EventTarget`) for communication instead of WebRTC. This is faster, more reliable, and works offline.

By default, `browserDirect` is `true`.

### Browser Direct Options

- `true` (default): Communication across all tabs in the same browser.
- `'same-window-only'`: Communication only within the same tab/window.
- `false`: Disable direct browser communication (always use WebRTC).

```typescript
const host = new Host('my-room', {
	browserDirect: 'same-window-only',
})
```

### Signaling Server

To use a custom signaling server or disable it:

```typescript
const host = new Host('my-room', {
	webSocketSignalingServer: 'wss://your-server.com',
})

// Disable signaling server (Browser Direct only)
const client = new Client('my-room', {
	webSocketSignalingServer: null,
})
```
