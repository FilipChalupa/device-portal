import { PeerId } from '@device-portal/client'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { UpgradeWebSocket, WSContext } from 'hono/ws'
import { createSignalingCore, SignalingLogger } from './core'

export * from './core'

export interface SignalingServerOptions {
	/**
	 * WebSocket upgrade helper of the hosting runtime — e.g. `upgradeWebSocket`
	 * returned by `createBunWebSocket()` from `hono/bun`. The host application
	 * owns the HTTP server and serves `app.fetch`. For a standalone Node server
	 * use `createNodeSignalingServer` from `@device-portal/server/node` instead.
	 */
	upgradeWebSocket: UpgradeWebSocket
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
	/** See `SignalingCoreOptions.maxMetaBytes`. */
	maxMetaBytes?: number
}

const toPeerSocket = (webSocket: WSContext) => ({
	send: (data: string) => {
		webSocket.send(data)
	},
	isOpen: () => webSocket.readyState === 1 /* WebSocket.OPEN */,
})

/**
 * Builds the Hono app with the signaling routes (`/health`, `/v0/`,
 * `/v0/groups/:group`) on top of the runtime's WebSocket upgrade helper. The
 * caller serves `app.fetch`; nothing listens on its own.
 */
export function createSignalingServer(options: SignalingServerOptions) {
	const { upgradeWebSocket } = options
	const logger = options.logger ?? console
	const app = new Hono().basePath(options.basePath ?? '/')

	app.get('/health', (context) => context.text('OK'))

	const core = createSignalingCore({
		logger,
		maxMetaBytes: options.maxMetaBytes,
	})

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

	// A WebSocket upgrade subscribes to the group's room list; a plain GET
	// returns the current list once. The upgrade helper falls through to the
	// next handler when the request carries no Upgrade header.
	app.get(
		'/v0/groups/:group',
		upgradeWebSocket((context) => {
			const group = context.req.param('group')
			let unsubscribe: (() => void) | undefined
			return {
				onOpen(event, webSocket) {
					unsubscribe = core.subscribeToGroup(group, toPeerSocket(webSocket))
				},
				onClose() {
					unsubscribe?.()
				},
				onError(event) {
					logger.error(`Group subscription error for ${group}:`, event)
				},
			}
		}),
		(context) => {
			const group = context.req.param('group')
			return context.json({ group, rooms: core.getGroupRooms(group) })
		},
	)

	return { app }
}
