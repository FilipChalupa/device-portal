import { WebSocketServer, type WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'

export interface TestServer {
	url: string
	close: () => Promise<void>
}

export async function createTestServer(): Promise<TestServer> {
	const wss = new WebSocketServer({ port: 0 })
	const rooms = new Map<string, Set<WebSocket>>()
	const socketToPeerId = new Map<WebSocket, string>()
	const socketToRoom = new Map<WebSocket, string>()

	wss.on('connection', (ws) => {
		const peerId = crypto.randomUUID()
		socketToPeerId.set(ws, peerId)

		ws.send(JSON.stringify({ type: 'identity', data: { peerId } }))

		ws.on('message', (raw) => {
			const data = JSON.parse(raw.toString())

			switch (data.type) {
				case 'join-room': {
					const room = data.room
					socketToRoom.set(ws, room)
					if (!rooms.has(room)) rooms.set(room, new Set())
					const roomPeers = rooms.get(room)!

					for (const client of roomPeers) {
						if (client !== ws && client.readyState === 1) {
							const existingPeerId = socketToPeerId.get(client)
							client.send(
								JSON.stringify({
									id: crypto.randomUUID(),
									type: 'peer-joined',
									data: { peerId },
								}),
							)
							ws.send(
								JSON.stringify({
									id: crypto.randomUUID(),
									type: 'peer-joined',
									data: { peerId: existingPeerId },
								}),
							)
						}
					}
					roomPeers.add(ws)
					break
				}
				case 'offer':
				case 'answer':
				case 'ice-candidate': {
					const room = socketToRoom.get(ws)
					const senderPeerId = socketToPeerId.get(ws)!
					if (room && rooms.has(room)) {
						for (const client of rooms.get(room)!) {
							if (client !== ws && client.readyState === 1) {
								const clientPeerId = socketToPeerId.get(client)
								if (data.to && clientPeerId !== data.to) continue
								client.send(
									JSON.stringify({
										id: data.id,
										type: data.type,
										from: senderPeerId,
										to: data.to,
										data: data.data,
									}),
								)
							}
						}
					}
					break
				}
			}
		})

		ws.on('close', () => {
			const room = socketToRoom.get(ws)
			const peerId = socketToPeerId.get(ws)
			if (room && rooms.has(room)) {
				const roomPeers = rooms.get(room)!
				roomPeers.delete(ws)
				for (const client of roomPeers) {
					if (client.readyState === 1) {
						client.send(
							JSON.stringify({
								id: crypto.randomUUID(),
								type: 'peer-left',
								data: { peerId },
							}),
						)
					}
				}
				if (roomPeers.size === 0) rooms.delete(room)
			}
			socketToPeerId.delete(ws)
			socketToRoom.delete(ws)
		})
	})

	await new Promise<void>((resolve) => wss.on('listening', resolve))
	const { port } = wss.address() as AddressInfo

	return {
		url: `ws://127.0.0.1:${port}`,
		close: () =>
			new Promise<void>((resolve) => {
				for (const client of wss.clients) {
					client.close()
				}
				wss.close(() => resolve())
			}),
	}
}
