import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'

const app = new Hono()

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

const rooms = new Map<string, Set<any>>()

app.get(
	'/',
	upgradeWebSocket((c) => {
		let room: string | null = null

		return {
			onMessage(evt, ws) {
				const message = JSON.parse(evt.data as string)

				switch (message.type) {
					case 'join-room': {
						room = message.room
						if (!rooms.has(room!)) {
							rooms.set(room!, new Set())
						}
						rooms.get(room!)!.add(ws)
						console.log(`Peer joined room: ${room}`)
						break
					}
					case 'offer':
					case 'answer':
					case 'ice-candidate': {
						if (room && rooms.has(room)) {
							for (const client of rooms.get(room)!) {
								if (
									client !== ws &&
									client.readyState === 1 /* WebSocket.OPEN */
								) {
									client.send(
										JSON.stringify({ type: message.type, data: message.data }),
									)
								}
							}
						}
						break
					}
				}
			},
			onClose(evt, ws) {
				if (room && rooms.has(room)) {
					rooms.get(room)!.delete(ws)
					if (rooms.get(room)!.size === 0) {
						rooms.delete(room)
					}
				}
				console.log('WebSocket connection closed.')
			},
			onError(evt, ws) {
				console.error('WebSocket error:', evt)
			},
			onOpen(evt, ws) {
				console.log('WebSocket connection opened.')
			},
		}
	}),
)

app.use('/*', serveStatic({ root: '../frontend/storybook-static' }))

const portString = process.env.PORT
let port = 8080
if (portString) {
	const parsedPort = parseInt(portString, 10)
	if (!isNaN(parsedPort)) {
		port = parsedPort
	}
}

console.log(`Starting WebSocket signaling server on port ${port}...`)

const server = serve({
	fetch: app.fetch,
	port,
})

injectWebSocket(server)
