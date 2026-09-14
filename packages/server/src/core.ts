import {
	generatePeerId,
	GroupRoom,
	PeerId,
	RoomListing,
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
	/**
	 * Upper bound of the serialized `meta` a room may publish to its group.
	 * Larger values are dropped with an error log. Defaults to 1024 bytes.
	 */
	maxMetaBytes?: number
}

export interface SignalingCore {
	handleOpen: (socket: SignalingPeerSocket) => PeerId
	handleMessage: (peerId: PeerId, rawData: string) => void
	handleClose: (peerId: PeerId) => void
	handleError: (peerId: PeerId, error: unknown) => void
	/** Rooms currently listed in the group. */
	getGroupRooms: (group: string) => GroupRoom[]
	/**
	 * Sends the current room list of the group to the socket immediately and
	 * again after every change. Returns the unsubscribe function.
	 */
	subscribeToGroup: (group: string, socket: SignalingPeerSocket) => () => void
}

type Room = {
	peers: Set<PeerId>
	/** Set by the peer that joined with a group; kept until the room empties. */
	listing?: RoomListing & { hostPeerId: PeerId }
}

const defaultMaxMetaBytes = 1024

export function createSignalingCore(
	options: SignalingCoreOptions = {},
): SignalingCore {
	const logger = options.logger ?? console
	const maxMetaBytes = options.maxMetaBytes ?? defaultMaxMetaBytes

	const peers = new Map<PeerId, SignalingPeerSocket>()
	const rooms = new Map<string, Room>()
	const peerRooms = new Map<PeerId, string>()
	const groupRooms = new Map<string, Set<string>>()
	const groupSubscribers = new Map<string, Set<SignalingPeerSocket>>()

	const sendTo = (peerId: PeerId, payload: unknown) => {
		const socket = peers.get(peerId)
		if (!socket?.isOpen()) {
			return
		}
		socket.send(JSON.stringify(payload))
	}

	const getGroupRooms = (group: string): GroupRoom[] => {
		const listed: GroupRoom[] = []
		for (const roomName of groupRooms.get(group) ?? []) {
			const room = rooms.get(roomName)
			if (!room?.listing) {
				continue
			}
			const { hostPeerId, maxClients, meta } = room.listing
			listed.push({
				room: roomName,
				clients: room.peers.size - (room.peers.has(hostPeerId) ? 1 : 0),
				...(maxClients === undefined ? {} : { maxClients }),
				...(meta === undefined ? {} : { meta }),
			})
		}
		return listed
	}

	const groupRoomsPayload = (group: string) =>
		JSON.stringify({
			type: 'group-rooms',
			group,
			rooms: getGroupRooms(group),
		})

	const publishGroup = (group: string | undefined) => {
		if (group === undefined) {
			return
		}
		const subscribers = groupSubscribers.get(group)
		if (!subscribers || subscribers.size === 0) {
			return
		}
		const payload = groupRoomsPayload(group)
		for (const subscriber of subscribers) {
			if (subscriber.isOpen()) {
				subscriber.send(payload)
			}
		}
	}

	const setListing = (
		roomName: string,
		room: Room,
		listing: Room['listing'],
	) => {
		const previousGroup = room.listing?.group
		if (previousGroup !== undefined && previousGroup !== listing?.group) {
			const listedRooms = groupRooms.get(previousGroup)
			listedRooms?.delete(roomName)
			if (listedRooms?.size === 0) {
				groupRooms.delete(previousGroup)
			}
		}
		room.listing = listing
		if (listing) {
			let listedRooms = groupRooms.get(listing.group)
			if (!listedRooms) {
				listedRooms = new Set()
				groupRooms.set(listing.group, listedRooms)
			}
			listedRooms.add(roomName)
		}
		if (previousGroup !== listing?.group) {
			publishGroup(previousGroup)
		}
		publishGroup(listing?.group)
	}

	const leaveRoom = (peerId: PeerId) => {
		const roomName = peerRooms.get(peerId)
		if (roomName === undefined) {
			return
		}
		peerRooms.delete(peerId)
		const room = rooms.get(roomName)
		if (!room) {
			return
		}
		room.peers.delete(peerId)

		// Notify other peers in the room that a peer has left
		for (const remainingPeerId of room.peers) {
			sendTo(remainingPeerId, {
				id: crypto.randomUUID(),
				type: 'peer-left',
				data: { peerId },
			})
		}

		if (room.peers.size === 0) {
			rooms.delete(roomName)
			setListing(roomName, room, undefined)
		} else {
			publishGroup(room.listing?.group)
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
					const roomName = message.room
					// Re-joining the same room is intentional: clients re-announce
					// themselves on the open socket to restart stalled negotiations,
					// so peer-joined is sent again. Switching rooms leaves the old one.
					if (peerRooms.get(peerId) !== roomName) {
						leaveRoom(peerId)
					}
					peerRooms.set(peerId, roomName)
					let room = rooms.get(roomName)
					if (!room) {
						room = { peers: new Set() }
						rooms.set(roomName, room)
					}
					room.peers.add(peerId)
					logger.log(`Peer ${peerId} joined room: ${roomName}`)

					if (message.group !== undefined) {
						let meta = message.meta
						if (
							meta !== undefined &&
							JSON.stringify(meta).length > maxMetaBytes
						) {
							logger.error(
								`Room meta from ${peerId} exceeds ${maxMetaBytes} bytes, dropping it`,
							)
							meta = undefined
						}
						setListing(roomName, room, {
							group: message.group,
							hostPeerId: peerId,
							maxClients: message.maxClients,
							meta,
						})
					} else {
						publishGroup(room.listing?.group)
					}

					// Notify other peers in the room that a new peer has joined
					// AND notify the new peer about existing peers in the room
					for (const existingPeerId of room.peers) {
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
					const roomName = peerRooms.get(peerId)
					logger.log(
						`Forwarding ${message.type} from ${peerId} in room: ${roomName}`,
					)
					const room = roomName === undefined ? undefined : rooms.get(roomName)
					if (room) {
						for (const targetPeerId of room.peers) {
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
		getGroupRooms,
		subscribeToGroup(group, socket) {
			let subscribers = groupSubscribers.get(group)
			if (!subscribers) {
				subscribers = new Set()
				groupSubscribers.set(group, subscribers)
			}
			subscribers.add(socket)
			logger.log(`Group subscription opened: ${group}`)
			socket.send(groupRoomsPayload(group))
			return () => {
				subscribers.delete(socket)
				if (subscribers.size === 0) {
					groupSubscribers.delete(group)
				}
				logger.log(`Group subscription closed: ${group}`)
			}
		},
	}
}
