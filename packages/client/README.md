# @device-portal/client

Base WebRTC logic for Device Portal. This package provides the core `Provider` and `Consumer` classes that can be used independently of React.

## Install

```bash
npm install @device-portal/client
```

## Usage

Device Portal uses a signaling server to coordinate WebRTC connections. One peer acts as a **Provider** (the producer of data) and one or more peers act as **Consumers**.

### Provider

The `Provider` creates a room and waits for consumers to join. It automatically initiates a WebRTC connection with each joining consumer.

```typescript
import { Provider } from '@device-portal/client'

const provider = new Provider('my-secret-room', {
	onMessage: (data, peerId) => {
		console.log(`Received from ${peerId}:`, data)
	},
	onPeersChange: (peers) => {
		console.log('Connected peers:', peers)
	},
	maxClients: 5, // Optional: limit number of connections
})

// Send data to all connected consumers
provider.send('Hello everyone!')

// Send data to a specific peer
// provider.sendToPeer(somePeerId, 'Hello you!');

// Cleanup
// provider.destroy();
```

### Consumer

The `Consumer` joins an existing room and waits for an offer from the provider.

```typescript
import { Consumer } from '@device-portal/client'

const consumer = new Consumer('my-secret-room', {
	onMessage: (data) => {
		console.log('Received from provider:', data)
	},
})

// Send data back to the provider
consumer.send('I received your message!')

// Cleanup
// consumer.destroy();
```

## Features

- Core WebRTC abstraction (`Provider`, `Consumer`)
- Signaling server client implementation
- **Browser Direct**: High-performance internal communication using `BroadcastChannel` and `EventTarget` when peers are in the same browser, bypassing WebRTC entirely for local communication.
- **Offline/Serverless support**: Can work entirely without a signaling server for same-browser scenarios.
- Peer ID branding and utilities
- Automatic reconnection logic
- Support for multiple consumers per producer

## Browser Direct

When both the `Provider` and `Consumer` are running in the same browser (different tabs or same tab), `@device-portal/client` can utilize direct browser APIs (`BroadcastChannel` and `EventTarget`) for communication instead of WebRTC. This is faster, more reliable, and works offline.

By default, `browserDirect` is `true`.

### Browser Direct Options

- `true` (default): Communication across all tabs in the same browser.
- `'same-window-only'`: Communication only within the same tab/window.
- `false`: Disable direct browser communication (always use WebRTC).

```typescript
const provider = new Provider('my-room', {
	browserDirect: 'same-window-only',
})
```

### Signaling Server

To use a custom signaling server or disable it:

```typescript
const provider = new Provider('my-room', {
	webSocketSignalingServer: 'wss://your-server.com',
})

// Disable signaling server (Browser Direct only)
const consumer = new Consumer('my-room', {
	webSocketSignalingServer: null,
})
```
