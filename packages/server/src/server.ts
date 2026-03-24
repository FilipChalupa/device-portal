import { SignalingMessage, SignalingMessageSchema } from '@device-portal/client'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { WebSocket } from 'ws'

export function createSignalingServer() {
	const app = new Hono()

	app.get('/health', (context) => context.text('OK'))

	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

	const rooms = new Map<string, Set<WebSocket>>()
	const webSocketToPeerId = new Map<WebSocket, string>()
	const webSocketToRoom = new Map<WebSocket, string>()

	app.use('/v0/*', cors())
	app.get(
		'/v0/',
		upgradeWebSocket((context) => {
			return {
				onOpen(event, webSocket) {
					const peerId = crypto.randomUUID()
					webSocketToPeerId.set(webSocket.raw!, peerId)
					console.log(`WebSocket connection opened: ${peerId}`)
					webSocket.send(
						JSON.stringify({ type: 'identity', data: { peerId } }),
					)
				},
				onMessage(event, webSocket) {
					const peerId = webSocketToPeerId.get(webSocket.raw!)!
					const data = JSON.parse(event.data as string)
					const result = SignalingMessageSchema.safeParse(data)

					if (!result.success) {
						console.error(
							`Invalid message received from ${peerId}:`,
							result.error.format(),
						)
						return
					}

					const message = result.data as SignalingMessage

					switch (message.type) {
						case 'join-room': {
							const room = message.room
							webSocketToRoom.set(webSocket.raw!, room)
							if (!rooms.has(room!)) {
								rooms.set(room!, new Set())
							}
							const roomPeers = rooms.get(room!)!
							roomPeers.add(webSocket.raw!)
							console.log(`Peer ${peerId} joined room: ${room}`)

							// Notify other peers in the room that a new peer has joined
							// AND notify the new peer about existing peers in the room
							for (const client of roomPeers) {
								if (client.readyState === 1 /* WebSocket.OPEN */) {
									if (client !== webSocket.raw) {
										// Notify existing peer about the new peer
										client.send(
											JSON.stringify({
												id: crypto.randomUUID(),
												type: 'peer-joined',
												data: { peerId },
											}),
										)
										// Notify the new peer about the existing peer
										const existingPeerId =
											webSocketToPeerId.get(client)
										webSocket.send(
											JSON.stringify({
												id: crypto.randomUUID(),
												type: 'peer-joined',
												data: { peerId: existingPeerId },
											}),
										)
									}
								}
							}
							break
						}
						case 'offer':
						case 'answer':
						case 'ice-candidate': {
							const room = webSocketToRoom.get(webSocket.raw!)!
							console.log(
								`Forwarding ${message.type} from ${peerId} in room: ${room}`,
							)
							if (room && rooms.has(room)) {
								for (const client of rooms.get(room)!) {
									if (
										client !== webSocket.raw &&
										client.readyState === 1 /* WebSocket.OPEN */
									) {
										// If message has a target 'to', only send to that client
										const clientPeerId =
											webSocketToPeerId.get(client)
										if (
											message.to &&
											clientPeerId !== message.to
										) {
											continue
										}

										client.send(
											JSON.stringify({
												id: message.id,
												type: message.type,
												from: peerId,
												to: message.to,
												data: message.data,
											}),
										)
									}
								}
							}
							break
						}
					}
				},
				onClose(event, webSocket) {
					const peerId = webSocketToPeerId.get(webSocket.raw!)
					const room = webSocketToRoom.get(webSocket.raw!)

					if (room && rooms.has(room)) {
						const roomPeers = rooms.get(room)!
						roomPeers.delete(webSocket.raw!)

						// Notify other peers in the room that a peer has left
						for (const client of roomPeers) {
							if (client.readyState === 1 /* WebSocket.OPEN */) {
								client.send(
									JSON.stringify({
										id: crypto.randomUUID(),
										type: 'peer-left',
										data: { peerId },
									}),
								)
							}
						}

						if (roomPeers.size === 0) {
							rooms.delete(room)
						}
					}
					webSocketToPeerId.delete(webSocket.raw!)
					webSocketToRoom.delete(webSocket.raw!)
					console.log(`WebSocket connection closed: ${peerId}`)
				},
				onError(event, webSocket) {
					const peerId = webSocketToPeerId.get(webSocket.raw!)
					console.error(`WebSocket error for ${peerId}:`, event)
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
					console.log(
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
