import { z } from 'zod'

export const defaultPort = 8080

export const JoinRoomMessageSchema = z.object({
	id: z.string().optional(),
	type: z.literal('join-room'),
	room: z.string(),
})

export const RtcMessageSchema = z.object({
	id: z.string().optional(),
	type: z.enum(['offer', 'answer', 'ice-candidate']),
	from: z.string(),
	to: z.string().optional(),
	data: z.any(),
})

export const IdentityMessageSchema = z.object({
	id: z.string().optional(),
	type: z.literal('identity'),
	data: z.object({
		peerId: z.string(),
	}),
})

export const PeerJoinedMessageSchema = z.object({
	id: z.string(),
	type: z.literal('peer-joined'),
	data: z.object({
		peerId: z.string(),
	}),
})

export const PeerLeftMessageSchema = z.object({
	id: z.string(),
	type: z.literal('peer-left'),
	data: z.object({
		peerId: z.string(),
	}),
})

export const DirectDiscoveryMessageSchema = z.object({
	id: z.string(),
	type: z.literal('direct-discovery'),
	room: z.string(),
	from: z.string(),
	to: z.string().optional(),
})

export const DirectMessageSchema = z.object({
	id: z.string(),
	type: z.literal('direct-message'),
	room: z.string(),
	from: z.string(),
	to: z.string().nullable(),
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
export type DirectDiscoveryMessage = z.infer<typeof DirectDiscoveryMessageSchema>
export type DirectMessage = z.infer<typeof DirectMessageSchema>
export type SignalingMessage = z.infer<typeof SignalingMessageSchema>
