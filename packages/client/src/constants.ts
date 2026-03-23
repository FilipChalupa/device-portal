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

export const defaultPort = 8080

export const BaseMessageSchema = z.object({
	id: z.string().optional(),
})

export const JoinRoomMessageSchema = BaseMessageSchema.extend({
	type: z.literal('join-room'),
	room: z.string(),
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
	RtcMessageSchema,
	IdentityMessageSchema,
	PeerJoinedMessageSchema,
	PeerLeftMessageSchema,
	DirectDiscoveryMessageSchema,
	DirectMessageSchema,
])

export type JoinRoomMessage = z.infer<typeof JoinRoomMessageSchema>
export type RtcMessage = z.infer<typeof RtcMessageSchema>
export type IdentityMessage = z.infer<typeof IdentityMessageSchema>
export type PeerJoinedMessage = z.infer<typeof PeerJoinedMessageSchema>
export type PeerLeftMessage = z.infer<typeof PeerLeftMessageSchema>
export type DirectDiscoveryMessage = z.infer<
	typeof DirectDiscoveryMessageSchema
>
export type DirectMessage = z.infer<typeof DirectMessageSchema>
export type SignalingMessage = z.infer<typeof SignalingMessageSchema>
