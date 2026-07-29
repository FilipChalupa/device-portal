import { PeerId } from '@device-portal/client'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { UpgradeWebSocket, WSContext } from 'hono/ws'
import { createSignalingCore, SignalingLogger } from './core'

export * from './core'

export interface SignalingServerOptions {
	/**
	 * Path prefix for all routes (`/health` and `/v0/`), e.g. `/device-portal`.
	 * Defaults to no prefix. Clients append `/v0/` to their configured server
	 * URL themselves, so `wss://host/device-portal` matches a server created
	 * with `basePath: '/device-portal'`.
	 */
	basePath?: string
	/**
	 * Whether to apply permissive CORS headers to `/v0/*`. Disable when the
	 * embedding application manages CORS itself. Defaults to `true`.
	 */
	cors?: boolean
	/** Defaults to `console`. */
	logger?: SignalingLogger
	/**
	 * WebSocket upgrade helper for non-Node runtimes, e.g. `upgradeWebSocket`
	 * returned by `createBunWebSocket()` from `hono/bun`. When provided, the
	 * embedding application owns the HTTP server and upgrade handling (serve
	 * `app.fetch` yourself) and `start()` is unavailable. Defaults to the Node
	 * adapter from `@hono/node-ws`.
	 */
	upgradeWebSocket?: UpgradeWebSocket
}

const toPeerSocket = (webSocket: WSContext) => ({
	send: (data: string) => {
		webSocket.send(data)
	},
	isOpen: () => webSocket.readyState === 1 /* WebSocket.OPEN */,
})

export function createSignalingServer(options: SignalingServerOptions = {}) {
	const logger = options.logger ?? console
	const app = new Hono().basePath(options.basePath ?? '/')

	app.get('/health', (context) => context.text('OK'))

	let upgradeWebSocket = options.upgradeWebSocket
	let injectWebSocket:
		| ReturnType<typeof createNodeWebSocket>['injectWebSocket']
		| undefined
	if (upgradeWebSocket === undefined) {
		const nodeWebSocket = createNodeWebSocket({ app })
		upgradeWebSocket = nodeWebSocket.upgradeWebSocket
		injectWebSocket = nodeWebSocket.injectWebSocket
	}

	const core = createSignalingCore({ logger })

	if (options.cors ?? true) {
		app.use('/v0/*', cors())
	}
	app.get(
		'/v0/',
		upgradeWebSocket(() => {
			let peerId: PeerId | undefined
			return {
				onOpen(event, webSocket) {
					peerId = core.handleOpen(toPeerSocket(webSocket))
				},
				onMessage(event) {
					if (peerId === undefined) {
						return
					}
					core.handleMessage(peerId, event.data as string)
				},
				onClose() {
					if (peerId === undefined) {
						return
					}
					core.handleClose(peerId)
				},
				onError(event) {
					if (peerId === undefined) {
						return
					}
					core.handleError(peerId, event)
				},
			}
		}),
	)

	function start(
		port: number,
		hostname = '0.0.0.0',
	): Promise<{ server: ReturnType<typeof serve>; port: number }> {
		if (injectWebSocket === undefined) {
			throw new Error(
				'start() is unavailable with a custom upgradeWebSocket. Serve app.fetch with your own HTTP server instead.',
			)
		}
		const inject = injectWebSocket
		return new Promise((resolve) => {
			const httpServer = serve(
				{
					fetch: app.fetch,
					port,
					hostname,
				},
				(info) => {
					logger.log(
						`Server is listening on http://${info.address}:${info.port}`,
					)
					resolve({ server: httpServer, port: info.port })
				},
			)
			inject(httpServer)
		})
	}

	return { app, start }
}
