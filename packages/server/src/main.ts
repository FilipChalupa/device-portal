import { defaultPort } from '@device-portal/client'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'fs'
import { dirname, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createSignalingServer } from './server'

const __dirname = dirname(fileURLToPath(import.meta.url))

const { app, start } = createSignalingServer()

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

start(port)
