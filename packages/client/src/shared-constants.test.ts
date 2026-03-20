import { describe, expect, it } from 'vitest'
import {
	DirectDiscoveryMessageSchema,
	DirectMessageSchema,
	IdentityMessageSchema,
	JoinRoomMessageSchema,
	PeerIdSchema,
	PeerJoinedMessageSchema,
	PeerLeftMessageSchema,
	RtcMessageSchema,
	SignalingMessageSchema,
} from '../../shared/constants'

describe('PeerIdSchema', () => {
	it('accepts a string and brands it as PeerId', () => {
		const result = PeerIdSchema.parse('abc-123')
		expect(result).toBe('abc-123')
	})

	it('rejects non-string values', () => {
		expect(() => PeerIdSchema.parse(123)).toThrow()
		expect(() => PeerIdSchema.parse(null)).toThrow()
	})
})

describe('JoinRoomMessageSchema', () => {
	it('parses a valid join-room message', () => {
		const result = JoinRoomMessageSchema.parse({
			type: 'join-room',
			room: 'test-room',
		})
		expect(result.type).toBe('join-room')
		expect(result.room).toBe('test-room')
	})

	it('accepts optional id field', () => {
		const result = JoinRoomMessageSchema.parse({
			type: 'join-room',
			room: 'r',
			id: 'msg-1',
		})
		expect(result.id).toBe('msg-1')
	})

	it('rejects missing room', () => {
		expect(() =>
			JoinRoomMessageSchema.parse({ type: 'join-room' }),
		).toThrow()
	})
})

describe('RtcMessageSchema', () => {
	it.each(['offer', 'answer', 'ice-candidate'] as const)(
		'parses type "%s"',
		(type) => {
			const result = RtcMessageSchema.parse({
				type,
				from: 'peer-a',
				data: {},
			})
			expect(result.type).toBe(type)
		},
	)

	it('accepts optional "to" field', () => {
		const result = RtcMessageSchema.parse({
			type: 'offer',
			from: 'a',
			to: 'b',
			data: {},
		})
		expect(result.to).toBe('b')
	})

	it('rejects invalid RTC type', () => {
		expect(() =>
			RtcMessageSchema.parse({ type: 'invalid', from: 'a', data: {} }),
		).toThrow()
	})
})

describe('IdentityMessageSchema', () => {
	it('parses a valid identity message', () => {
		const result = IdentityMessageSchema.parse({
			type: 'identity',
			data: { peerId: 'p1' },
		})
		expect(result.data.peerId).toBe('p1')
	})
})

describe('PeerJoinedMessageSchema', () => {
	it('requires id (non-optional)', () => {
		const result = PeerJoinedMessageSchema.parse({
			type: 'peer-joined',
			id: 'x',
			data: { peerId: 'p1' },
		})
		expect(result.id).toBe('x')
	})

	it('rejects when id is missing', () => {
		expect(() =>
			PeerJoinedMessageSchema.parse({
				type: 'peer-joined',
				data: { peerId: 'p1' },
			}),
		).toThrow()
	})
})

describe('PeerLeftMessageSchema', () => {
	it('parses a valid peer-left message', () => {
		const result = PeerLeftMessageSchema.parse({
			type: 'peer-left',
			id: 'x',
			data: { peerId: 'p1' },
		})
		expect(result.data.peerId).toBe('p1')
	})
})

describe('DirectDiscoveryMessageSchema', () => {
	it('parses with optional "to"', () => {
		const result = DirectDiscoveryMessageSchema.parse({
			type: 'direct-discovery',
			id: 'x',
			room: 'r',
			from: 'a',
		})
		expect(result.to).toBeUndefined()
	})

	it('parses with "to" present', () => {
		const result = DirectDiscoveryMessageSchema.parse({
			type: 'direct-discovery',
			id: 'x',
			room: 'r',
			from: 'a',
			to: 'b',
		})
		expect(result.to).toBe('b')
	})
})

describe('DirectMessageSchema', () => {
	it('parses with nullable "to"', () => {
		const result = DirectMessageSchema.parse({
			type: 'direct-message',
			id: 'x',
			room: 'r',
			from: 'a',
			to: null,
			data: 'hi',
		})
		expect(result.to).toBeNull()
	})

	it('parses with "to" set to a peer', () => {
		const result = DirectMessageSchema.parse({
			type: 'direct-message',
			id: 'x',
			room: 'r',
			from: 'a',
			to: 'b',
			data: 'hi',
		})
		expect(result.to).toBe('b')
	})
})

describe('SignalingMessageSchema (discriminated union)', () => {
	it('routes to correct schema based on type field', () => {
		expect(
			SignalingMessageSchema.parse({ type: 'join-room', room: 'r' }).type,
		).toBe('join-room')

		expect(
			SignalingMessageSchema.parse({
				type: 'identity',
				data: { peerId: 'p' },
			}).type,
		).toBe('identity')
	})

	it('rejects unknown type', () => {
		expect(() =>
			SignalingMessageSchema.parse({ type: 'unknown' }),
		).toThrow()
	})

	it('rejects empty object', () => {
		expect(() => SignalingMessageSchema.parse({})).toThrow()
	})
})
