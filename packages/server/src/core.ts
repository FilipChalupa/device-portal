import {
	generatePeerId,
	PeerId,
	SignalingMessageSchema,
} from '@device-portal/client'

export interface SignalingLogger {
	log: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
}

export const noopLogger: SignalingLogger = {
	log: () => {},
	error: () => {},
}

export interface SignalingPeerSocket {
	send: (data: string) => void
	isOpen: () => boolean
}

export interface SignalingCoreOptions {
	logger?: SignalingLogger
}

export interface SignalingCore {
	handleOpen: (socket: SignalingPeerSocket) => PeerId
	handleMessage: (peerId: PeerId, rawData: string) => void
	handleClose: (peerId: PeerId) => void
	handleError: (peerId: PeerId, error: unknown) => void
}

export function createSignalingCore(
	options: SignalingCoreOptions = {},
): SignalingCore {
	const logger = options.logger ?? console

	const peers = new Map<PeerId, SignalingPeerSocket>()
	const rooms = new Map<string, Set<PeerId>>()
	const peerRooms = new Map<PeerId, string>()

	const sendTo = (peerId: PeerId, payload: unknown) => {
		const socket = peers.get(peerId)
		if (!socket?.isOpen()) {
			return
		}
		socket.send(JSON.stringify(payload))
	}

	const leaveRoom = (peerId: PeerId) => {
		const room = peerRooms.get(peerId)
		if (room === undefined) {
			return
		}
		peerRooms.delete(peerId)
		const roomPeers = rooms.get(room)
		if (!roomPeers) {
			return
		}
		roomPeers.delete(peerId)

		// Notify other peers in the room that a peer has left
		for (const remainingPeerId of roomPeers) {
			sendTo(remainingPeerId, {
				id: crypto.randomUUID(),
				type: 'peer-left',
				data: { peerId },
			})
		}

		if (roomPeers.size === 0) {
			rooms.delete(room)
		}
	}

	return {
		handleOpen(socket) {
			const peerId = generatePeerId()
			peers.set(peerId, socket)
			logger.log(`WebSocket connection opened: ${peerId}`)
			socket.send(JSON.stringify({ type: 'identity', data: { peerId } }))
			return peerId
		},
		handleMessage(peerId, rawData) {
			let data: unknown
			try {
				data = JSON.parse(rawData)
			} catch (error) {
				logger.error(`Malformed JSON received from ${peerId}:`, error)
				return
			}
			const result = SignalingMessageSchema.safeParse(data)

			if (!result.success) {
				logger.error(
					`Invalid message received from ${peerId}:`,
					result.error.format(),
				)
				return
			}

			const message = result.data

			switch (message.type) {
				case 'join-room': {
					const room = message.room
					// Re-joining the same room is intentional: clients re-announce
					// themselves on the open socket to restart stalled negotiations,
					// so peer-joined is sent again. Switching rooms leaves the old one.
					if (peerRooms.get(peerId) !== room) {
						leaveRoom(peerId)
					}
					peerRooms.set(peerId, room)
					let roomPeers = rooms.get(room)
					if (!roomPeers) {
						roomPeers = new Set()
						rooms.set(room, roomPeers)
					}
					roomPeers.add(peerId)
					logger.log(`Peer ${peerId} joined room: ${room}`)

					// Notify other peers in the room that a new peer has joined
					// AND notify the new peer about existing peers in the room
					for (const existingPeerId of roomPeers) {
						if (
							existingPeerId === peerId ||
							!peers.get(existingPeerId)?.isOpen()
						) {
							continue
						}
						sendTo(existingPeerId, {
							id: crypto.randomUUID(),
							type: 'peer-joined',
							data: { peerId },
						})
						sendTo(peerId, {
							id: crypto.randomUUID(),
							type: 'peer-joined',
							data: { peerId: existingPeerId },
						})
					}
					break
				}
				case 'offer':
				case 'answer':
				case 'ice-candidate': {
					const room = peerRooms.get(peerId)
					logger.log(
						`Forwarding ${message.type} from ${peerId} in room: ${room}`,
					)
					const roomPeers = room === undefined ? undefined : rooms.get(room)
					if (roomPeers) {
						for (const targetPeerId of roomPeers) {
							if (targetPeerId === peerId) {
								continue
							}
							// If message has a target 'to', only send to that client
							if (message.to !== undefined && targetPeerId !== message.to) {
								continue
							}
							sendTo(targetPeerId, {
								id: message.id,
								type: message.type,
								from: peerId,
								to: message.to,
								data: message.data,
							})
						}
					}
					break
				}
			}
		},
		handleClose(peerId) {
			leaveRoom(peerId)
			peers.delete(peerId)
			logger.log(`WebSocket connection closed: ${peerId}`)
		},
		handleError(peerId, error) {
			logger.error(`WebSocket error for ${peerId}:`, error)
		},
	}
}
