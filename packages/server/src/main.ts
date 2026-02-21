import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { existsSync } from 'fs'
import { Hono } from 'hono'
import { resolve } from 'path'
import { WebSocket } from 'ws'

type JoinRoomMessage = {
	type: 'join-room'
	room: string
}

type RtcMessage = {
	type: 'offer' | 'answer' | 'ice-candidate'
	to?: string
	data: any
}

type SignalingMessage = JoinRoomMessage | RtcMessage

const app = new Hono()

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

const rooms = new Map<string, Set<WebSocket>>()
const webSocketToPeerId = new Map<WebSocket, string>()
const webSocketToRoom = new Map<WebSocket, string>()

app.get(
	'/v0/',
	upgradeWebSocket((context) => {
		return {
			onOpen(event, webSocket) {
				const peerId = crypto.randomUUID()
				webSocketToPeerId.set(webSocket.raw!, peerId)
				console.log(`WebSocket connection opened: ${peerId}`)
				webSocket.send(JSON.stringify({ type: 'identity', data: { peerId } }))
			},
			onMessage(event, webSocket) {
				const peerId = webSocketToPeerId.get(webSocket.raw!)!
				const message = JSON.parse(event.data as string) as SignalingMessage

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
						for (const client of roomPeers) {
							if (
								client !== webSocket.raw &&
								client.readyState === 1 /* WebSocket.OPEN */
							) {
								client.send(
									JSON.stringify({ type: 'peer-joined', data: { peerId } }),
								)
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
									const clientPeerId = webSocketToPeerId.get(client)
									if (message.to && clientPeerId !== message.to) {
										continue
									}

									client.send(
										JSON.stringify({
											type: message.type,
											from: peerId,
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
								JSON.stringify({ type: 'peer-left', data: { peerId } }),
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

const storybookRelativePath = '../frontend/storybook-static'
const storybookPath = resolve(__dirname, '..', storybookRelativePath)
if (existsSync(storybookPath)) {
	app.use('/*', serveStatic({ root: '../frontend/storybook-static' }))
}

const portString = process.env.PORT
let port = 8080
if (portString) {
	const parsedPort = parseInt(portString, 10)
	if (!isNaN(parsedPort)) {
		port = parsedPort
	}
}

console.log(`Starting signaling server on http://0.0.0.0:${port}`)

const server = serve({
	fetch: app.fetch,
	port,
})

injectWebSocket(server)
