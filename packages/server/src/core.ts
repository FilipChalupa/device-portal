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

/** Logger that discards everything — handy for tests and embedded use. */
export const noopLogger: SignalingLogger = {
	log: () => {},
	error: () => {},
}

/** The subset of a WebSocket the core needs; adapt any runtime's socket to it. */
export interface SignalingPeerSocket {
	send: (data: string) => void
	isOpen: () => boolean
	/** Used to turn away connections over a limit. Without it they are ignored. */
	close?: (code: number, reason: string) => void
}

export interface SignalingCoreOptions {
	/** Defaults to `console`. */
	logger?: SignalingLogger
	/**
	 * Upper bound of the UTF-8 serialized `meta` a room may publish to its
	 * group. Larger values are dropped with an error log. Defaults to 1024.
	 */
	maxMetaBytes?: number
	/**
	 * Minimum time between two room-list broadcasts of one group. The first
	 * change goes out immediately, further changes within the window are
	 * coalesced into a single broadcast at its end. `0` broadcasts every
	 * change. Defaults to 250.
	 */
	groupPublishThrottleMilliseconds?: number
	/**
	 * Longest accepted room or group name in characters. Longer `join-room`
	 * messages are ignored and group subscriptions are refused. Defaults to 128.
	 */
	maxNameLength?: number
	/**
	 * Most sockets (signaling connections and group subscriptions together)
	 * one client may hold open, keyed by the `clientKey` passed to
	 * `handleOpen` / `subscribeToGroup` — typically the IP address. Sockets
	 * opened without a key are not limited. `Infinity` disables the limit.
	 * Defaults to 32.
	 */
	maxSocketsPerClient?: number
}

/**
 * Transport-agnostic signaling state machine. Wire the `handle*` methods into
 * the WebSocket events of any runtime; `createSignalingServer` does so for
 * Hono.
 */
export interface SignalingCore {
	/**
	 * Registers a new socket, sends it its identity and returns the peer id.
	 * Returns `null` (and closes the socket with 1008) when `clientKey`
	 * already holds `maxSocketsPerClient` sockets.
	 */
	handleOpen: (socket: SignalingPeerSocket, clientKey?: string) => PeerId | null
	/** Processes one raw text frame from the peer. Invalid input is logged. */
	handleMessage: (peerId: PeerId, rawData: string) => void
	/** Removes the peer from its room and notifies the remaining peers. */
	handleClose: (peerId: PeerId) => void
	/** Logs a socket error; the socket's own close event does the cleanup. */
	handleError: (peerId: PeerId, error: unknown) => void
	/** Rooms currently listed in the group. */
	getGroupRooms: (group: string) => GroupRoom[]
	/**
	 * Sends the current room list of the group to the socket immediately and
	 * again after every change. Returns the unsubscribe function, or
	 * `null` (closing the socket with 1008) when the group name is too
	 * long or `clientKey` is over `maxSocketsPerClient`.
	 */
	subscribeToGroup: (
		group: string,
		socket: SignalingPeerSocket,
		clientKey?: string,
	) => (() => void) | null
}

type Room = {
	peers: Set<PeerId>
	/** Set by the peer that joined with a group; dropped when that peer leaves. */
	listing?: RoomListing & { hostPeerId: PeerId }
}

const defaultMaxMetaBytes = 1024
const defaultGroupPublishThrottleMilliseconds = 250
const defaultMaxNameLength = 128
const defaultMaxSocketsPerClient = 32
/** WebSocket close code for a policy violation. */
const policyViolation = 1008

/**
 * Creates the in-memory signaling core: rooms, peer-to-peer message
 * forwarding and public room listings per group.
 */
export function createSignalingCore(
	options: SignalingCoreOptions = {},
): SignalingCore {
	const logger = options.logger ?? console
	const maxMetaBytes = options.maxMetaBytes ?? defaultMaxMetaBytes
	const groupPublishThrottleMilliseconds =
		options.groupPublishThrottleMilliseconds ??
		defaultGroupPublishThrottleMilliseconds
	const maxNameLength = options.maxNameLength ?? defaultMaxNameLength
	const maxSocketsPerClient =
		options.maxSocketsPerClient ?? defaultMaxSocketsPerClient

	const peers = new Map<PeerId, SignalingPeerSocket>()
	const rooms = new Map<string, Room>()
	const peerRooms = new Map<PeerId, string>()
	const groupRooms = new Map<string, Set<string>>()
	const groupSubscribers = new Map<string, Set<SignalingPeerSocket>>()
	const socketsPerClient = new Map<string, number>()
	const peerClientKeys = new Map<PeerId, string>()
	/** Groups inside a throttle window; `dirty` means a broadcast is owed. */
	const groupThrottles = new Map<
		string,
		{ timer: ReturnType<typeof setTimeout>; dirty: boolean }
	>()

	const sendTo = (peerId: PeerId, payload: unknown) => {
		const socket = peers.get(peerId)
		if (!socket?.isOpen()) {
			return
		}
		socket.send(JSON.stringify(payload))
	}

	/** Counts a new socket of the client; `false` when it is over the limit. */
	const acquireClientSocket = (clientKey: string | undefined) => {
		if (clientKey === undefined) {
			return true
		}
		const count = socketsPerClient.get(clientKey) ?? 0
		if (count >= maxSocketsPerClient) {
			return false
		}
		socketsPerClient.set(clientKey, count + 1)
		return true
	}

	const releaseClientSocket = (clientKey: string | undefined) => {
		if (clientKey === undefined) {
			return
		}
		const count = (socketsPerClient.get(clientKey) ?? 1) - 1
		if (count <= 0) {
			socketsPerClient.delete(clientKey)
		} else {
			socketsPerClient.set(clientKey, count)
		}
	}

	const refuse = (socket: SignalingPeerSocket, reason: string) => {
		logger.error(`Refusing connection: ${reason}`)
		socket.close?.(policyViolation, reason)
	}

	const getGroupRooms = (group: string): GroupRoom[] => {
		const listed: GroupRoom[] = []
		for (const roomName of groupRooms.get(group) ?? []) {
			const room = rooms.get(roomName)
			if (!room?.listing) {
				continue
			}
			const { hostPeerId, maxClients, meta, clients } = room.listing
			listed.push({
				room: roomName,
				// Hosts before 0.3 do not report their count; fall back to the
				// open signaling connections, which include waiting peers.
				clients:
					clients ?? room.peers.size - (room.peers.has(hostPeerId) ? 1 : 0),
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

	const broadcastGroup = (group: string) => {
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

	/**
	 * Broadcasts the group's room list, leading-edge throttled: a burst of
	 * changes (a party joining, a host leaving with its clients) costs the
	 * subscribers one broadcast now and one at the end of the window instead
	 * of one per change.
	 */
	const publishGroup = (group: string | undefined) => {
		if (group === undefined) {
			return
		}
		if (groupPublishThrottleMilliseconds <= 0) {
			broadcastGroup(group)
			return
		}
		const throttle = groupThrottles.get(group)
		if (throttle) {
			throttle.dirty = true
			return
		}
		broadcastGroup(group)
		const startWindow = () => {
			groupThrottles.set(group, {
				dirty: false,
				timer: setTimeout(() => {
					const ended = groupThrottles.get(group)
					groupThrottles.delete(group)
					if (ended?.dirty) {
						broadcastGroup(group)
						startWindow()
					}
				}, groupPublishThrottleMilliseconds),
			})
		}
		startWindow()
	}

	/** Returns `meta` unchanged, or `undefined` (with a log) when it is too big. */
	const acceptMeta = (peerId: PeerId, meta: unknown) => {
		if (meta === undefined) {
			return undefined
		}
		const bytes = new TextEncoder().encode(JSON.stringify(meta)).byteLength
		if (bytes > maxMetaBytes) {
			logger.error(
				`Room meta from ${peerId} has ${bytes} bytes, limit is ${maxMetaBytes} — dropping it`,
			)
			return undefined
		}
		return meta
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
		} else if (room.listing?.hostPeerId === peerId) {
			// A room without the peer that listed it is not joinable — the
			// remaining clients only wait for a host that is gone. A host that
			// reconnects lists the room again with its new identity.
			setListing(roomName, room, undefined)
		} else {
			publishGroup(room.listing?.group)
		}
	}

	return {
		handleOpen(socket, clientKey) {
			if (!acquireClientSocket(clientKey)) {
				refuse(socket, `too many connections from ${clientKey}`)
				return null
			}
			const peerId = generatePeerId()
			peers.set(peerId, socket)
			if (clientKey !== undefined) {
				peerClientKeys.set(peerId, clientKey)
			}
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
					if (
						roomName.length > maxNameLength ||
						(message.group?.length ?? 0) > maxNameLength
					) {
						logger.error(
							`Peer ${peerId} sent a room or group name over ${maxNameLength} characters`,
						)
						return
					}
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
					const isNewInRoom = !room.peers.has(peerId)
					room.peers.add(peerId)
					logger.log(`Peer ${peerId} joined room: ${roomName}`)

					const listedBySomeoneElse =
						room.listing !== undefined && room.listing.hostPeerId !== peerId
					if (message.group !== undefined && listedBySomeoneElse) {
						// The listing belongs to the connected host until it leaves;
						// the peer still joins the room, just without taking it over.
						logger.error(
							`Peer ${peerId} tried to list room ${roomName}, which another peer already lists`,
						)
					}
					if (message.group !== undefined && !listedBySomeoneElse) {
						setListing(roomName, room, {
							group: message.group,
							hostPeerId: peerId,
							maxClients: message.maxClients,
							meta: acceptMeta(peerId, message.meta),
							clients: message.clients,
						})
					} else if (isNewInRoom) {
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
				case 'update-listing': {
					const roomName = peerRooms.get(peerId)
					const room = roomName === undefined ? undefined : rooms.get(roomName)
					if (
						roomName === undefined ||
						!room?.listing ||
						room.listing.hostPeerId !== peerId
					) {
						logger.error(
							`Peer ${peerId} tried to update a listing it does not own`,
						)
						return
					}
					setListing(roomName, room, {
						...room.listing,
						meta: acceptMeta(peerId, message.meta),
						clients: message.clients ?? room.listing.clients,
					})
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
			releaseClientSocket(peerClientKeys.get(peerId))
			peerClientKeys.delete(peerId)
			logger.log(`WebSocket connection closed: ${peerId}`)
		},
		handleError(peerId, error) {
			logger.error(`WebSocket error for ${peerId}:`, error)
		},
		getGroupRooms,
		subscribeToGroup(group, socket, clientKey) {
			if (group.length > maxNameLength) {
				refuse(socket, `group name over ${maxNameLength} characters`)
				return null
			}
			if (!acquireClientSocket(clientKey)) {
				refuse(socket, `too many connections from ${clientKey}`)
				return null
			}
			let subscribers = groupSubscribers.get(group)
			if (!subscribers) {
				subscribers = new Set()
				groupSubscribers.set(group, subscribers)
			}
			subscribers.add(socket)
			logger.log(`Group subscription opened: ${group}`)
			socket.send(groupRoomsPayload(group))
			let isSubscribed = true
			return () => {
				if (!isSubscribed) {
					return
				}
				isSubscribed = false
				releaseClientSocket(clientKey)
				subscribers.delete(socket)
				if (subscribers.size === 0) {
					groupSubscribers.delete(group)
				}
				logger.log(`Group subscription closed: ${group}`)
			}
		},
	}
}
