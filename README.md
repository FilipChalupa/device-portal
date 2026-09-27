# Device portal

Simple WebRTC data channel for React.

## Packages

This monorepo consists of:

- **[@device-portal/react](./packages/react/README.md)**: Simple WebRTC data channel for React.
- **[@device-portal/client](./packages/client/README.md)**: Base WebRTC logic for Device Portal.
- **[@device-portal/server](./packages/server/README.md)**: WebSocket-based signaling server for WebRTC.

## Examples

- **[examples/node-host](./examples/node-host/README.md)**: A game host running in Node that shows up in the Storybook lobby.

## Development

Run development mode (starts both server and storybook):

```sh
npm ci
npm run dev
```

## Tests

```sh
npm test            # unit tests of all packages
npm run build       # e2e runs against the built Storybook and server
npm run -w @device-portal/e2e install-browsers  # once
npm run test:e2e    # Playwright: Lobby story and a Node-hosted game in Chromium
```
