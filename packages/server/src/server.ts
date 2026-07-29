import { PeerId } from '@device-portal/client'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { WSContext } from 'hono/ws'
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

	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

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
			injectWebSocket(httpServer)
		})
	}

	return { app, start }
}
