#!/usr/bin/env node
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { existsSync } from 'fs'
import { resolve } from 'path'

const app = new Hono()

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

const rooms = new Map<string, Set<any>>()

app.get(
	'/v0/',
	upgradeWebSocket((context) => {
		let room: string | null = null
		const peerId = crypto.randomUUID()

		return {
			onOpen(event, webSocket) {
				;(webSocket as any).peerId = peerId
				console.log(`WebSocket connection opened: ${peerId}`)
				webSocket.send(JSON.stringify({ type: 'identity', data: { peerId } }))
			},
			onMessage(event, webSocket) {
				const message = JSON.parse(event.data as string)

				switch (message.type) {
					case 'join-room': {
						room = message.room
						if (!rooms.has(room!)) {
							rooms.set(room!, new Set())
						}
						const roomPeers = rooms.get(room!)!
						roomPeers.add(webSocket)
						console.log(`Peer ${peerId} joined room: ${room}`)

						// Notify other peers in the room that a new peer has joined
						for (const client of roomPeers) {
							if (
								client !== webSocket &&
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
						console.log(
							`Forwarding ${message.type} from ${peerId} in room: ${room}`,
						)
						if (room && rooms.has(room)) {
							for (const client of rooms.get(room)!) {
								if (
									client !== webSocket &&
									client.readyState === 1 /* WebSocket.OPEN */
								) {
									// If message has a target 'to', only send to that client
									if (message.to && (client as any).peerId !== message.to) {
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
				if (room && rooms.has(room)) {
					const roomPeers = rooms.get(room)!
					roomPeers.delete(webSocket)

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
				console.log(`WebSocket connection closed: ${peerId}`)
			},
			onError(event, webSocket) {
				console.error(`WebSocket error for ${peerId}:`, event)
			},
		}
	}),
)

const storybookPath = resolve(__dirname, '../frontend/storybook-static')
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

console.log(`Starting signaling server on 0.0.0.0:${port}…`)

const server = serve({
	fetch: app.fetch,
	port,
})

injectWebSocket(server)
