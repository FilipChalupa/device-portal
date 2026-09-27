# @device-portal/server

[![NPM](https://img.shields.io/npm/v/@device-portal/server.svg)](https://www.npmjs.com/package/@device-portal/server)

Signaling server for WebRTC used by `@device-portal/react`.

## Usage

You can run the server with the following command:

```sh
npx @device-portal/server
```

The server will run on `ws://localhost:8080` by default.

| Variable      | Description                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`        | Listening port, default `8080`.                                                                                                           |
| `HOST`        | Listening address, default all IPv4 interfaces; `::` for IPv4 and IPv6.                                                                   |
| `TRUST_PROXY` | `1` behind a reverse proxy (Render, Fly, nginx): per-client limits use the first `X-Forwarded-For` address. Never set it without a proxy. |

## Endpoints

| Path                    | Description                                                                       |
| ----------------------- | --------------------------------------------------------------------------------- |
| `GET /health`           | Returns `OK`.                                                                     |
| `WS /v0/`               | Signaling socket used by `Host` and `Client`.                                     |
| `WS /v0/groups/:group`  | Pushes `{ type: 'group-rooms', group, rooms }` on connect and after every change. |
| `GET /v0/groups/:group` | Returns `{ group, rooms }` once.                                                  |

A room is listed in a group while the peer that joined it with `group` (the
host) stays connected; when the host leaves, the listing goes with it even if
clients are still waiting in the room. Only that host can change the listing;
other peers joining with `group` enter the room without taking it over.

Each entry is `{ room, clients, maxClients?, meta? }`. `clients` is the number
of clients connected to the host as the host reports it — peers waiting for a
free slot are not counted (hosts before 0.3 do not report it; the server then
counts open signaling connections other than the host's). `maxClients` and
`meta` are whatever the host declared; `meta` above `maxMetaBytes` (default
1024, UTF-8) is dropped and is relayed unvalidated, so render it as untrusted
input. The host updates `meta` and `clients` with `update-listing` messages.

Broadcasts to group subscribers are throttled per group
(`groupPublishThrottleMilliseconds`, default 250): the first change goes out
immediately and further changes within the window arrive as one broadcast at
its end, so a burst of joins does not send the full list once per join.

## Limits

A public server keeps state for anyone who connects, so the core bounds it:

| Option                             | Default | Effect                                                                                     |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `maxNameLength`                    | 128     | Longer room or group names: `join-room` is ignored, a group subscription is closed (1008). |
| `maxSocketsPerClient`              | 32      | Signaling sockets and group subscriptions per client together; more are closed (1008).     |
| `maxMetaBytes`                     | 1024    | Larger `meta` is dropped from the listing.                                                 |
| `groupPublishThrottleMilliseconds` | 250     | Minimum spacing of room-list broadcasts per group.                                         |

A client is identified by `getClientKey(context)`. `createNodeSignalingServer`
uses the TCP peer address, or the first `X-Forwarded-For` entry with
`trustProxy: true`. When embedding on another runtime, pass your own (e.g. from
Hono's `getConnInfo` of your adapter); without it no per-client limit applies.

## Embedding in another application

The package root exports the server as a runtime-agnostic library. Importing it
has no side effects — the process-level CLI lives only in the
`device-portal-server` binary. The host application supplies the WebSocket
upgrade helper of its runtime, owns the HTTP server and serves `app.fetch`.
On Bun:

```ts
import { createSignalingServer } from '@device-portal/server'
import { createBunWebSocket, getConnInfo } from 'hono/bun'

const { upgradeWebSocket, websocket } = createBunWebSocket()
const { app } = createSignalingServer({
	upgradeWebSocket,
	basePath: '/device-portal', // optional path prefix for /health and /v0/
	cors: false, // disable when the host application manages CORS itself
	logger: console, // or any { log, error } implementation, e.g. noopLogger
	maxMetaBytes: 1024, // optional cap on the room meta published to groups
	groupPublishThrottleMilliseconds: 250, // optional, coalesces group broadcasts
	getClientKey: (context) => getConnInfo(context).remote.address, // limits per IP
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
