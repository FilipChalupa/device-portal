# Node host example

A click-race host running in Node instead of a browser tab. It joins the
`lobby-demo` group, so it appears in the **Lobby** story of the Storybook next
to browser-hosted games and anyone can join it from there.

```sh
npm ci
npm run build:client
npm run dev                # signaling server + Storybook
npm run example:node-host  # in another shell
```

Then open the **Lobby / Playground** story and join "Node host".

WebRTC comes from [`node-datachannel`](https://www.npmjs.com/package/node-datachannel)
and is passed to `Host` through the `webrtc` option. The package is an
optional dependency: if its native build is unavailable on your platform, the
rest of the monorepo still installs and only this example does not run.

Environment: `SERVER_URL` (default `ws://localhost:8080`), `ROOM`.
