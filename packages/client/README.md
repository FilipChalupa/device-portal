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
	onConnected: () => {
		console.log('Link to host is up')
	},
	onDisconnected: () => {
		console.log('Link to host lost — reconnecting in background')
	},
})

// Send data back to the host
client.send('I received your message!')

// Cleanup
// client.destroy();
```

### Public rooms and groups

A host can list its room under a `group` so other peers can discover it — for
example a lobby of public game servers. The signaling server publishes every
listed room together with the number of connected clients, the host's
`maxClients` and an optional `meta` JSON (kept under 1 kB).

```typescript
import { Host, fetchGroupRooms, subscribeToGroup } from '@device-portal/client'

const host = new Host('arena-42', {
	group: 'my-game',
	maxClients: 4,
	meta: { name: 'Arena', map: 'desert' },
})

// Live list — called on connect and after every change
const unsubscribe = subscribeToGroup('my-game', {
	onRooms: (rooms) => {
		for (const { room, clients, maxClients, meta } of rooms) {
			console.log(room, `${clients}/${maxClients ?? '∞'}`, meta)
		}
	},
})

// One-off list over HTTP
const rooms = await fetchGroupRooms('my-game')

// Change what the listing shows without reconnecting
host.setMeta({ name: 'Arena', map: 'desert', status: 'in progress' })
```

Rooms without a `group` are never listed. A room disappears from its group
once nobody is connected to it.

### Running outside the browser

`Host` and `Client` run on Node 22+ (and other runtimes with global `WebSocket`
and `crypto.randomUUID`), so a dedicated game server or a headless peer can
host a room. WebRTC itself is not built into Node — pass an implementation via
the `webrtc` option, e.g. from [`node-datachannel`](https://www.npmjs.com/package/node-datachannel):

```typescript
import { Host } from '@device-portal/client'
import { RTCPeerConnection } from 'node-datachannel/polyfill'

const host = new Host('arena-42', {
	webrtc: { RTCPeerConnection },
	group: 'my-game',
	maxClients: 16,
	onMessage: (data, peerId) => {
		host.send(`${peerId}: ${data}`)
	},
})
```

Outside browsers `browserDirect` defaults to `false`, so every peer goes
through the signaling server and WebRTC. A runnable version lives in
[`examples/node-host`](../../examples/node-host/README.md) of the repository.

## Features

- Core WebRTC abstraction (`Host`, `Client`)
- Public room listing per `group` (`subscribeToGroup`, `fetchGroupRooms`)
- Runs in Node with an injected WebRTC implementation
- Signaling server client implementation
- **Browser Direct**: High-performance internal communication using `BroadcastChannel` and `EventTarget` when peers are in the same browser, bypassing WebRTC entirely for local communication.
- **Offline/Serverless support**: Can work entirely without a signaling server for same-browser scenarios.
- Peer ID branding and utilities
- Automatic reconnection logic
- Support for multiple clients per host

## Browser Direct

When both the `Host` and `Client` are running in the same browser (different tabs or same tab), `@device-portal/client` can utilize direct browser APIs (`BroadcastChannel` and `EventTarget`) for communication instead of WebRTC. This is faster, more reliable, and works offline.

By default, `browserDirect` is `true` in browsers and `false` elsewhere.

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
