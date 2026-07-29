# @device-portal/server

[![NPM](https://img.shields.io/npm/v/@device-portal/server.svg)](https://www.npmjs.com/package/@device-portal/server)

Signaling server for WebRTC used by `@device-portal/react`.

## Usage

You can run the server with the following command:

```sh
npx @device-portal/server
```

The server will run on `ws://localhost:8080` by default.

## Embedding in another application

The package root exports the server as a library. Importing it has no side
effects — the process-level CLI lives only in the `device-portal-server` binary.

```ts
import { createSignalingServer } from '@device-portal/server'

const { app, start } = createSignalingServer({
	basePath: '/device-portal', // optional path prefix for /health and /v0/
	cors: false, // disable when the host application manages CORS itself
	logger: console, // or any { log, error } implementation, e.g. noopLogger
})

// Either let it listen on its own:
await start(8080)

// …or embed the Hono instance into a host server via `app.fetch`.
```

Clients append `/v0/` to their configured signaling server URL themselves, so a
server created with `basePath: '/device-portal'` is reachable at
`wss://example.com/device-portal`.

The signaling logic itself is transport-agnostic and available without Hono via
`@device-portal/server/core`:

```ts
import { createSignalingCore } from '@device-portal/server/core'

const core = createSignalingCore({ logger })
// Wire handleOpen/handleMessage/handleClose/handleError into any WebSocket stack.
```

## Development

```sh
npm ci
npm run dev
```

Build the server with:

```sh
npm run build
```
