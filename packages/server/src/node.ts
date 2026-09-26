import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { createSignalingServer, SignalingServerOptions } from './server'

export type NodeSignalingServerOptions = Omit<
	SignalingServerOptions,
	'upgradeWebSocket'
>

/**
 * Signaling server wired to Node's HTTP server via `@hono/node-ws`. Returns
 * the Hono `app` (extend it with more routes before starting) and `start`,
 * which listens on the given port and resolves once it does.
 */
export function createNodeSignalingServer(
	options: NodeSignalingServerOptions = {},
) {
	const logger = options.logger ?? console
	// The adapter needs an app reference only for upgrade dispatch, so the
	// signaling routes are mounted into this root app after creation.
	const app = new Hono()
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
	const { app: signalingApp } = createSignalingServer({
		...options,
		upgradeWebSocket,
	})
	app.route('/', signalingApp)

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
