#!/usr/bin/env node
import { serveStatic } from '@hono/node-server/serve-static'
import { defaultPort } from './constants'
import { existsSync } from 'fs'
import { dirname, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createNodeSignalingServer } from './node'

const __dirname = dirname(fileURLToPath(import.meta.url))

const { app, start } = createNodeSignalingServer({
	// Set TRUST_PROXY=1 when running behind a reverse proxy (e.g. Render) so
	// per-client limits see the real client address.
	trustProxy: process.env.TRUST_PROXY === '1',
})

const storybookPath = resolve(__dirname, '../../react/storybook-static')
if (existsSync(storybookPath)) {
	app.use(
		'/*',
		serveStatic({
			root: relative(process.cwd(), storybookPath),
			rewriteRequestPath: (path) => (path === '/' ? '/index.html' : path),
		}),
	)
}

const portString = process.env.PORT
let port: number = defaultPort
if (portString) {
	const parsedPort = parseInt(portString, 10)
	if (!isNaN(parsedPort)) {
		port = parsedPort
	}
}

// HOST defaults to all IPv4 interfaces; `::` listens on IPv4 and IPv6.
start(port, process.env.HOST || undefined)
