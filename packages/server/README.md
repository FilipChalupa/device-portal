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

The package root exports the server as a runtime-agnostic library. Importing it
has no side effects — the process-level CLI lives only in the
`device-portal-server` binary. The host application supplies the WebSocket
upgrade helper of its runtime, owns the HTTP server and serves `app.fetch`.
On Bun:

```ts
import { createSignalingServer } from '@device-portal/server'
import { createBunWebSocket } from 'hono/bun'

const { upgradeWebSocket, websocket } = createBunWebSocket()
const { app } = createSignalingServer({
	upgradeWebSocket,
	basePath: '/device-portal', // optional path prefix for /health and /v0/
	cors: false, // disable when the host application manages CORS itself
	logger: console, // or any { log, error } implementation, e.g. noopLogger
})

Bun.serve({ fetch: app.fetch, websocket, port: 8080 })
```

Clients append `/v0/` to their configured signaling server URL themselves, so a
server created with `basePath: '/device-portal'` is reachable at
`wss://example.com/device-portal`.

### Standalone Node server

`@device-portal/server/node` wires the Node adapter from `@hono/node-ws` and
can listen on its own:

```ts
import { createNodeSignalingServer } from '@device-portal/server/node'

const { app, start } = createNodeSignalingServer()
await start(8080)
```

The signaling logic itself is transport-agnostic and available without Hono via
`@device-portal/server/core`:

```ts
import { createSignalingCore } from '@device-portal/server/core'

const core = createSignalingCore({ logger })
// Wire handleOpen/handleMessage/handleClose/handleError into any WebSocket stack.
```

### Migrating from earlier versions

- Importing the package root no longer starts a server. Run the
  `device-portal-server` binary (`npx @device-portal/server`) instead.
- The `@device-portal/server/server` subpath was removed. Replace
  `createSignalingServer().start(port)` with `createNodeSignalingServer().start(port)`
  from `@device-portal/server/node`.
- `createSignalingServer` from the package root now requires the
  `upgradeWebSocket` option and returns only `{ app }`.

## Development

```sh
npm ci
npm run dev
```

Build the server with:

```sh
npm run build
```
