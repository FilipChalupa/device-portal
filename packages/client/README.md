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
import { Initiator } from '@device-portal/client';

const initiator = new Initiator('my-secret-room', {
  onMessage: (data, peerId) => {
    console.log(`Received from ${peerId}:`, data);
  },
  onPeersChange: (peers) => {
    console.log('Connected peers:', peers);
  },
  maxClients: 5 // Optional: limit number of connections
});

// Send data to all connected responders
initiator.send('Hello everyone!');

// Send data to a specific peer
// initiator.sendToPeer(somePeerId, 'Hello you!');

// Cleanup
// initiator.destroy();
```

### Responder (Consumer)

The `Responder` joins an existing room and waits for an offer from the initiator.

```typescript
import { Responder } from '@device-portal/client';

const responder = new Responder('my-secret-room', {
  onMessage: (data) => {
    console.log('Received from initiator:', data);
  }
});

// Send data back to the initiator
responder.send('I received your message!');

// Cleanup
// responder.destroy();
```

## Features

- Core WebRTC abstraction (`Peer`, `Initiator`, `Responder`)
- Signaling server client implementation
- Peer ID branding and utilities
- Automatic reconnection logic
- Support for multiple consumers per producer
