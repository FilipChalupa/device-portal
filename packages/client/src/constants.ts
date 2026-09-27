import { z } from 'zod'

const brandKey = '__brand' as const

export type Brand<Value, BrandName extends string> = Value & {
	[brandKey]: BrandName
}

export type PeerId = Brand<string, 'PeerId'>

export const PeerIdSchema = z.string().transform((val) => val as PeerId)

export function generatePeerId(): PeerId {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID() as PeerId
	}
	return Math.random().toString(36).substring(2, 15) as PeerId
}

export const BaseMessageSchema = z.object({
	id: z.string().optional(),
})

/**
 * Optional public listing of a room. A peer (typically the host) that joins
 * with a `group` makes the room visible to group subscribers — see
 * `GroupRoomsMessageSchema`. Rooms joined without a group are never listed.
 */
export const RoomListingSchema = z.object({
	group: z.string().min(1),
	/** Upper bound of clients the host accepts, if it has one. */
	maxClients: z.number().int().positive().optional(),
	/** Arbitrary JSON shown to group subscribers as-is, e.g. a game name. */
	meta: z.unknown().optional(),
	/**
	 * Clients connected to the host, reported by the host itself. Peers
	 * waiting for a free slot are not counted. When absent (hosts older than
	 * 0.3) the server counts the open signaling connections instead.
	 */
	clients: z.number().int().nonnegative().optional(),
})

/**
 * Sent by a peer to enter a room. The listing fields are only honoured
 * together with `group`; `maxClients` and `meta` without it are ignored.
 */
export const JoinRoomMessageSchema = BaseMessageSchema.extend({
	type: z.literal('join-room'),
	room: z.string(),
}).extend(RoomListingSchema.partial().shape)

/**
 * Sent by the peer that listed the room to update its listing without
 * re-joining. `meta` replaces the previous value (absent clears it);
 * absent `clients` keeps the previous count. Ignored for other peers.
 */
export const UpdateListingMessageSchema = BaseMessageSchema.extend({
	type: z.literal('update-listing'),
	meta: z.unknown().optional(),
	clients: z.number().int().nonnegative().optional(),
})

export const GroupRoomSchema = z.object({
	room: z.string(),
	/** Clients connected to the host, not counting peers waiting for a slot. */
	clients: z.number().int().nonnegative(),
	maxClients: z.number().int().positive().optional(),
	meta: z.unknown().optional(),
})

export const GroupRoomsMessageSchema = BaseMessageSchema.extend({
	type: z.literal('group-rooms'),
	group: z.string(),
	rooms: z.array(GroupRoomSchema),
})

export const RtcMessageSchema = BaseMessageSchema.extend({
	type: z.enum(['offer', 'answer', 'ice-candidate']),
	from: PeerIdSchema,
	to: PeerIdSchema.optional(),
	data: z.any(),
})

export const IdentityMessageSchema = BaseMessageSchema.extend({
	type: z.literal('identity'),
	data: z.object({
		peerId: PeerIdSchema,
	}),
})

export const PeerJoinedMessageSchema = BaseMessageSchema.extend({
	id: z.string(), // Overriding for required id as per previous impl
	type: z.literal('peer-joined'),
	data: z.object({
		peerId: PeerIdSchema,
	}),
})

export const PeerLeftMessageSchema = BaseMessageSchema.extend({
	id: z.string(),
	type: z.literal('peer-left'),
	data: z.object({
		peerId: PeerIdSchema,
	}),
})

export const DirectDiscoveryMessageSchema = BaseMessageSchema.extend({
	id: z.string(),
	type: z.literal('direct-discovery'),
	room: z.string(),
	from: PeerIdSchema,
	to: PeerIdSchema.optional(),
})

export const DirectMessageSchema = BaseMessageSchema.extend({
	id: z.string(),
	type: z.literal('direct-message'),
	room: z.string(),
	from: PeerIdSchema,
	to: PeerIdSchema.nullable(),
	data: z.any(),
})

export const SignalingMessageSchema = z.discriminatedUnion('type', [
	JoinRoomMessageSchema,
	UpdateListingMessageSchema,
	RtcMessageSchema,
	IdentityMessageSchema,
	PeerJoinedMessageSchema,
	PeerLeftMessageSchema,
	DirectDiscoveryMessageSchema,
	DirectMessageSchema,
])

export type RoomListing = z.infer<typeof RoomListingSchema>
/**
 * A room listed in a group. `Meta` types the host-provided `meta`; it is not
 * validated — the server relays whatever the host sent, so treat it as
 * untrusted input when rendering.
 */
export type GroupRoom<Meta = unknown> = Omit<
	z.infer<typeof GroupRoomSchema>,
	'meta'
> & { meta?: Meta }
export type GroupRoomsMessage = z.infer<typeof GroupRoomsMessageSchema>
export type JoinRoomMessage = z.infer<typeof JoinRoomMessageSchema>
export type UpdateListingMessage = z.infer<typeof UpdateListingMessageSchema>
export type RtcMessage = z.infer<typeof RtcMessageSchema>
export type IdentityMessage = z.infer<typeof IdentityMessageSchema>
export type PeerJoinedMessage = z.infer<typeof PeerJoinedMessageSchema>
export type PeerLeftMessage = z.infer<typeof PeerLeftMessageSchema>
export type DirectDiscoveryMessage = z.infer<
	typeof DirectDiscoveryMessageSchema
>
export type DirectMessage = z.infer<typeof DirectMessageSchema>
export type SignalingMessage = z.infer<typeof SignalingMessageSchema>
