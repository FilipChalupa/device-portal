import { describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest'
import {
	WebSocketSignaling,
	type WebSocketSignalingCallbacks,
} from './WebSocketSignaling'
import { createTestServer, type TestServer } from './test-ws-server'
import type { PeerId } from '../constants'

async function waitFor(
	condition: () => boolean,
	timeout = 2000,
	interval = 10,
): Promise<void> {
	const start = Date.now()
	while (!condition()) {
		if (Date.now() - start > timeout) {
			throw new Error('waitFor timed out')
		}
		await new Promise((r) => setTimeout(r, interval))
	}
}

function noopCallbacks(): WebSocketSignalingCallbacks {
	return {
		onIdentity: (_peerId) => {},
		onPeerJoined: (_peerId) => {},
		onPeerLeft: (_peerId) => {},
		onOffer: (_offer, _from) => {},
		onAnswer: (_answer, _from) => {},
		onIceCandidate: (_candidate, _from) => {},
	}
}

describe('WebSocketSignaling', () => {
	let server: TestServer
	const instances: WebSocketSignaling[] = []

	function createSignaling(
		room: string,
		peerId: PeerId,
		callbacks: Partial<WebSocketSignalingCallbacks> = {},
	) {
		const s = new WebSocketSignaling(room, server.url, peerId, {
			...noopCallbacks(),
			...callbacks,
		})
		instances.push(s)
		return s
	}

	beforeAll(async () => {
		server = await createTestServer()
	})

	afterAll(async () => {
		await server.close()
	})

	afterEach(() => {
		for (const s of instances) {
			s.destroy()
		}
		instances.length = 0
	})

	describe('connection lifecycle', () => {
		test('connect establishes connection and receives identity', async () => {
			const room = crypto.randomUUID()
			let identityPeerId: PeerId | null = null

			const signaling = createSignaling(room, crypto.randomUUID() as PeerId, {
				onIdentity: (peerId) => {
					identityPeerId = peerId
				},
			})

			await signaling.connect()

			expect(signaling.isConnected).toBe(true)
			await waitFor(() => identityPeerId !== null)
			expect(typeof identityPeerId).toBe('string')
		})

		test('isConnected returns false before connect', () => {
			const signaling = createSignaling(
				crypto.randomUUID(),
				crypto.randomUUID() as PeerId,
			)
			expect(signaling.isConnected).toBe(false)
		})

		test('connect after destroy rejects', async () => {
			const signaling = createSignaling(
				crypto.randomUUID(),
				crypto.randomUUID() as PeerId,
			)
			signaling.destroy()

			await expect(signaling.connect()).rejects.toThrow(
				'WebSocketSignaling is destroyed',
			)
		})
	})

	describe('room and peer discovery', () => {
		test('onPeerJoined fires when another peer joins the room', async () => {
			const room = crypto.randomUUID()
			const joinedPeers: PeerId[] = []

			const signaling1 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
				{
					onPeerJoined: (id) => joinedPeers.push(id),
				},
			)
			await signaling1.connect()

			const signaling2 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
			)
			await signaling2.connect()

			await waitFor(() => joinedPeers.length > 0)
			expect(joinedPeers).toHaveLength(1)
		})

		test('both peers are notified of each other', async () => {
			const room = crypto.randomUUID()
			const joined1: PeerId[] = []
			const joined2: PeerId[] = []

			const signaling1 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
				{
					onPeerJoined: (id) => joined1.push(id),
				},
			)
			await signaling1.connect()

			const signaling2 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
				{
					onPeerJoined: (id) => joined2.push(id),
				},
			)
			await signaling2.connect()

			await waitFor(() => joined1.length > 0 && joined2.length > 0)
			expect(joined1).toHaveLength(1)
			expect(joined2).toHaveLength(1)
		})
	})

	describe('signaling messages', () => {
		test('offer is forwarded to other peer in room', async () => {
			const room = crypto.randomUUID()
			let receivedOffer: { data: unknown; from: PeerId } | null = null

			const signaling1 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
				{
					onOffer: (offer, from) => {
						receivedOffer = { data: offer, from }
					},
				},
			)
			await signaling1.connect()

			const signaling2 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
			)
			await signaling2.connect()

			// Wait for peer discovery to settle
			await new Promise((r) => setTimeout(r, 50))

			signaling2.sendSignaling('offer', { type: 'offer', sdp: 'test-sdp' })

			await waitFor(() => receivedOffer !== null)
			expect(receivedOffer!.data).toEqual({ type: 'offer', sdp: 'test-sdp' })
		})

		test('answer is forwarded to other peer in room', async () => {
			const room = crypto.randomUUID()
			let receivedAnswer: { data: unknown; from: PeerId } | null = null

			const signaling1 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
				{
					onAnswer: (answer, from) => {
						receivedAnswer = { data: answer, from }
					},
				},
			)
			await signaling1.connect()

			const signaling2 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
			)
			await signaling2.connect()

			await new Promise((r) => setTimeout(r, 50))

			signaling2.sendSignaling('answer', {
				type: 'answer',
				sdp: 'test-answer-sdp',
			})

			await waitFor(() => receivedAnswer !== null)
			expect(receivedAnswer!.data).toEqual({
				type: 'answer',
				sdp: 'test-answer-sdp',
			})
		})

		test('ice-candidate is forwarded to other peer in room', async () => {
			const room = crypto.randomUUID()
			let receivedCandidate: { data: unknown; from: PeerId } | null = null

			const signaling1 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
				{
					onIceCandidate: (candidate, from) => {
						receivedCandidate = { data: candidate, from }
					},
				},
			)
			await signaling1.connect()

			const signaling2 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
			)
			await signaling2.connect()

			await new Promise((r) => setTimeout(r, 50))

			signaling2.sendSignaling('ice-candidate', {
				candidate: 'test-candidate',
			})

			await waitFor(() => receivedCandidate !== null)
			expect(receivedCandidate!.data).toEqual({
				candidate: 'test-candidate',
			})
		})
	})

	describe('peer lifecycle', () => {
		test('onPeerLeft fires when peer disconnects', async () => {
			const room = crypto.randomUUID()
			const leftPeers: PeerId[] = []

			const signaling1 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
				{
					onPeerLeft: (id) => leftPeers.push(id),
				},
			)
			await signaling1.connect()

			const signaling2 = createSignaling(
				room,
				crypto.randomUUID() as PeerId,
			)
			await signaling2.connect()

			// Wait for peer-joined to propagate
			await new Promise((r) => setTimeout(r, 50))

			signaling2.destroy()

			await waitFor(() => leftPeers.length > 0)
			expect(leftPeers).toHaveLength(1)
		})
	})

	describe('destroy', () => {
		test('destroy closes the WebSocket', async () => {
			const signaling = createSignaling(
				crypto.randomUUID(),
				crypto.randomUUID() as PeerId,
			)
			await signaling.connect()
			expect(signaling.isConnected).toBe(true)

			signaling.destroy()

			// Socket close is async — wait briefly
			await waitFor(() => !signaling.isConnected)
			expect(signaling.isConnected).toBe(false)
		})
	})
})
