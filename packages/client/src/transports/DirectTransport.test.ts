import { afterEach, describe, expect, test } from 'vitest'
import type { PeerId } from '../constants'
import { DirectTransport } from './DirectTransport'

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

function createCallbacks() {
	const joined: PeerId[] = []
	const left: PeerId[] = []
	const messages: Array<{ data: string; from: PeerId }> = []
	return {
		joined,
		left,
		messages,
		callbacks: {
			onPeerJoined: (id: PeerId) => joined.push(id),
			onPeerLeft: (id: PeerId) => left.push(id),
			onMessage: (data: string, from: PeerId) => messages.push({ data, from }),
		},
	}
}

describe('DirectTransport', () => {
	const transports: DirectTransport[] = []

	function create(
		room: string,
		role: 'provider' | 'consumer',
		peerId: PeerId,
		browserDirect: boolean | 'same-window-only',
		callbacks: ReturnType<typeof createCallbacks>['callbacks'],
	) {
		const t = new DirectTransport(room, role, peerId, browserDirect, callbacks)
		transports.push(t)
		return t
	}

	afterEach(() => {
		for (const t of transports) {
			t.destroy()
		}
		transports.length = 0
	})

	describe('same-window-only mode', () => {
		test('provider and consumer discover each other', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumerId = crypto.randomUUID() as PeerId

			const p = createCallbacks()
			const c = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				'same-window-only',
				p.callbacks,
			)
			const consumer = create(
				room,
				'consumer',
				consumerId,
				'same-window-only',
				c.callbacks,
			)

			provider.start()
			consumer.start()

			await waitFor(() => p.joined.length > 0 && c.joined.length > 0)

			expect(p.joined).toEqual([consumerId])
			expect(c.joined).toEqual([providerId])
			expect(provider.directPeers.has(consumerId)).toBe(true)
			expect(consumer.directPeers.has(providerId)).toBe(true)
		})

		test('provider sends message to consumer', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumerId = crypto.randomUUID() as PeerId

			const p = createCallbacks()
			const c = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				'same-window-only',
				p.callbacks,
			)
			const consumer = create(
				room,
				'consumer',
				consumerId,
				'same-window-only',
				c.callbacks,
			)

			provider.start()
			consumer.start()

			await waitFor(() => p.joined.length > 0)

			provider.sendMessage('hello-from-provider')

			await waitFor(() => c.messages.length > 0)
			expect(c.messages[0]).toEqual({
				data: 'hello-from-provider',
				from: providerId,
			})
		})

		test('consumer sends message to provider', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumerId = crypto.randomUUID() as PeerId

			const p = createCallbacks()
			const c = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				'same-window-only',
				p.callbacks,
			)
			const consumer = create(
				room,
				'consumer',
				consumerId,
				'same-window-only',
				c.callbacks,
			)

			provider.start()
			consumer.start()

			await waitFor(() => c.joined.length > 0)

			consumer.sendMessage('hello-from-consumer')

			await waitFor(() => p.messages.length > 0)
			expect(p.messages[0]).toEqual({
				data: 'hello-from-consumer',
				from: consumerId,
			})
		})

		test('targeted message reaches only intended peer', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumer1Id = crypto.randomUUID() as PeerId
			const consumer2Id = crypto.randomUUID() as PeerId

			const p = createCallbacks()
			const c1 = createCallbacks()
			const c2 = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				'same-window-only',
				p.callbacks,
			)
			const consumer1 = create(
				room,
				'consumer',
				consumer1Id,
				'same-window-only',
				c1.callbacks,
			)
			const consumer2 = create(
				room,
				'consumer',
				consumer2Id,
				'same-window-only',
				c2.callbacks,
			)

			provider.start()
			consumer1.start()
			consumer2.start()

			await waitFor(() => p.joined.length >= 2)

			provider.sendMessage('for-consumer1-only', consumer1Id)

			await waitFor(() => c1.messages.length > 0)
			// Give consumer2 a chance to receive (it shouldn't)
			await new Promise((r) => setTimeout(r, 50))

			expect(c1.messages).toHaveLength(1)
			expect(c1.messages[0].data).toBe('for-consumer1-only')
			expect(c2.messages).toHaveLength(0)
		})

		test('broadcast message reaches all peers', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumer1Id = crypto.randomUUID() as PeerId
			const consumer2Id = crypto.randomUUID() as PeerId

			const c1 = createCallbacks()
			const c2 = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				'same-window-only',
				createCallbacks().callbacks,
			)
			const consumer1 = create(
				room,
				'consumer',
				consumer1Id,
				'same-window-only',
				c1.callbacks,
			)
			const consumer2 = create(
				room,
				'consumer',
				consumer2Id,
				'same-window-only',
				c2.callbacks,
			)

			provider.start()
			consumer1.start()
			consumer2.start()

			await waitFor(
				() =>
					consumer1.directPeers.has(providerId) &&
					consumer2.directPeers.has(providerId),
			)

			provider.sendMessage('broadcast')

			await waitFor(() => c1.messages.length > 0 && c2.messages.length > 0)
			expect(c1.messages[0].data).toBe('broadcast')
			expect(c2.messages[0].data).toBe('broadcast')
		})

		test('destroy sends peer-left and removes peer', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumerId = crypto.randomUUID() as PeerId

			const c = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				'same-window-only',
				createCallbacks().callbacks,
			)
			const consumer = create(
				room,
				'consumer',
				consumerId,
				'same-window-only',
				c.callbacks,
			)

			provider.start()
			consumer.start()

			await waitFor(() => consumer.directPeers.has(providerId))

			provider.destroy()

			await waitFor(() => c.left.length > 0)
			expect(c.left).toEqual([providerId])
			expect(consumer.directPeers.has(providerId)).toBe(false)
		})

		test('ignores messages from self', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId

			const p = createCallbacks()
			const provider = create(
				room,
				'provider',
				providerId,
				'same-window-only',
				p.callbacks,
			)
			provider.start()

			// Manually send a discovery message with the provider's own peerId as `from`
			provider.sendSignaling({
				type: 'direct-discovery',
				from: providerId,
			})

			await new Promise((r) => setTimeout(r, 50))
			expect(p.joined).toHaveLength(0)
		})

		test('deduplicates messages with same id', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumerId = crypto.randomUUID() as PeerId

			const c = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				'same-window-only',
				createCallbacks().callbacks,
			)
			const consumer = create(
				room,
				'consumer',
				consumerId,
				'same-window-only',
				c.callbacks,
			)

			provider.start()
			consumer.start()

			await waitFor(() => consumer.directPeers.has(providerId))

			const fixedId = crypto.randomUUID()
			provider.sendSignaling({
				id: fixedId,
				type: 'direct-message',
				from: providerId,
				to: null,
				data: 'dup-test',
			})

			await waitFor(() => c.messages.length > 0)

			// Second send with same id — should be deduped by the sender
			provider.sendSignaling({
				id: fixedId,
				type: 'direct-message',
				from: providerId,
				to: null,
				data: 'dup-test-2',
			})

			await new Promise((r) => setTimeout(r, 50))
			expect(c.messages).toHaveLength(1)
		})
	})

	describe('BroadcastChannel mode', () => {
		test('provider and consumer discover each other', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumerId = crypto.randomUUID() as PeerId

			const p = createCallbacks()
			const c = createCallbacks()

			const provider = create(room, 'provider', providerId, true, p.callbacks)
			const consumer = create(room, 'consumer', consumerId, true, c.callbacks)

			provider.start()
			consumer.start()

			await waitFor(() => p.joined.length > 0 && c.joined.length > 0)

			expect(p.joined).toEqual([consumerId])
			expect(c.joined).toEqual([providerId])
		})

		test('messages flow bidirectionally', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumerId = crypto.randomUUID() as PeerId

			const p = createCallbacks()
			const c = createCallbacks()

			const provider = create(room, 'provider', providerId, true, p.callbacks)
			const consumer = create(room, 'consumer', consumerId, true, c.callbacks)

			provider.start()
			consumer.start()

			await waitFor(() => p.joined.length > 0 && c.joined.length > 0)

			provider.sendMessage('p2c')
			consumer.sendMessage('c2p')

			await waitFor(() => c.messages.length > 0 && p.messages.length > 0)
			expect(c.messages[0].data).toBe('p2c')
			expect(p.messages[0].data).toBe('c2p')
		})

		test('message via both channels is processed only once', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumerId = crypto.randomUUID() as PeerId

			const c = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				true,
				createCallbacks().callbacks,
			)
			const consumer = create(room, 'consumer', consumerId, true, c.callbacks)

			provider.start()
			consumer.start()

			await waitFor(() => consumer.directPeers.has(providerId))

			provider.sendMessage('once')

			await waitFor(() => c.messages.length > 0)
			// BroadcastChannel is async — wait a bit to see if a duplicate arrives
			await new Promise((r) => setTimeout(r, 100))
			expect(c.messages).toHaveLength(1)
		})

		test('destroy closes BroadcastChannels and notifies peers', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumerId = crypto.randomUUID() as PeerId

			const c = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				true,
				createCallbacks().callbacks,
			)
			const consumer = create(room, 'consumer', consumerId, true, c.callbacks)

			provider.start()
			consumer.start()

			await waitFor(() => consumer.directPeers.has(providerId))

			provider.destroy()

			await waitFor(() => c.left.length > 0)
			expect(c.left).toEqual([providerId])
		})
	})

	describe('edge cases', () => {
		test('invalid messages are silently ignored', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const consumerId = crypto.randomUUID() as PeerId

			const c = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				'same-window-only',
				createCallbacks().callbacks,
			)
			const consumer = create(
				room,
				'consumer',
				consumerId,
				'same-window-only',
				c.callbacks,
			)

			provider.start()
			consumer.start()

			await waitFor(() => consumer.directPeers.has(providerId))

			// Send a malformed message that won't pass Zod validation
			provider.sendSignaling({ type: 'garbage', invalid: true } as any)

			await new Promise((r) => setTimeout(r, 50))
			expect(c.messages).toHaveLength(0)
		})

		test('multiple consumers each discover the provider', async () => {
			const room = crypto.randomUUID()
			const providerId = crypto.randomUUID() as PeerId
			const c1Id = crypto.randomUUID() as PeerId
			const c2Id = crypto.randomUUID() as PeerId
			const c3Id = crypto.randomUUID() as PeerId

			const p = createCallbacks()

			const provider = create(
				room,
				'provider',
				providerId,
				'same-window-only',
				p.callbacks,
			)
			const c1 = create(
				room,
				'consumer',
				c1Id,
				'same-window-only',
				createCallbacks().callbacks,
			)
			const c2 = create(
				room,
				'consumer',
				c2Id,
				'same-window-only',
				createCallbacks().callbacks,
			)
			const c3 = create(
				room,
				'consumer',
				c3Id,
				'same-window-only',
				createCallbacks().callbacks,
			)

			provider.start()
			c1.start()
			c2.start()
			c3.start()

			await waitFor(() => p.joined.length >= 3)

			expect(provider.directPeers.size).toBe(3)
			expect(provider.directPeers.has(c1Id)).toBe(true)
			expect(provider.directPeers.has(c2Id)).toBe(true)
			expect(provider.directPeers.has(c3Id)).toBe(true)
		})
	})
})
