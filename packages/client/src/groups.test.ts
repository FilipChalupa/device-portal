import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import type { GroupRoom, PeerId } from './constants'
import { fetchGroupRooms, subscribeToGroup } from './groups'
import { WebSocketSignaling } from './transports/WebSocketSignaling'
import { createTestServer, type TestServer } from './transports/test-ws-server'

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

const noopCallbacks = {
	onIdentity: () => {},
	onPeerJoined: () => {},
	onPeerLeft: () => {},
	onOffer: () => {},
	onAnswer: () => {},
	onIceCandidate: () => {},
}

describe('groups', () => {
	let server: TestServer
	const cleanups: Array<() => void> = []

	function join(
		room: string,
		listing?: { group: string; maxClients?: number; meta?: unknown },
	) {
		const signaling = new WebSocketSignaling(
			room,
			server.url,
			crypto.randomUUID() as PeerId,
			noopCallbacks,
			listing,
		)
		cleanups.push(() => signaling.destroy())
		return signaling.connect()
	}

	function subscribe(group: string) {
		const snapshots: GroupRoom[][] = []
		const unsubscribe = subscribeToGroup(group, {
			webSocketSignalingServer: server.url,
			onRooms: (rooms) => snapshots.push(rooms),
		})
		cleanups.push(unsubscribe)
		return {
			snapshots,
			get latest() {
				return snapshots.at(-1)
			},
		}
	}

	beforeAll(async () => {
		server = await createTestServer()
	})

	afterAll(async () => {
		await server.close()
	})

	afterEach(() => {
		for (const cleanup of cleanups) {
			cleanup()
		}
		cleanups.length = 0
	})

	test('a subscription receives an empty list for an unknown group', async () => {
		const subscription = subscribe(crypto.randomUUID())
		await waitFor(() => subscription.snapshots.length > 0)
		expect(subscription.latest).toEqual([])
	})

	test('a host joining with a group lists the room with its limit and meta', async () => {
		const group = crypto.randomUUID()
		const room = crypto.randomUUID()
		const subscription = subscribe(group)
		await waitFor(() => subscription.snapshots.length > 0)

		await join(room, { group, maxClients: 4, meta: { name: 'Arena' } })

		await waitFor(() => subscription.latest?.length === 1)
		expect(subscription.latest).toEqual([
			{ room, clients: 0, maxClients: 4, meta: { name: 'Arena' } },
		])
	})

	test('clients joining and leaving update the count and the room disappears when empty', async () => {
		const group = crypto.randomUUID()
		const room = crypto.randomUUID()
		const subscription = subscribe(group)
		await join(room, { group })
		await waitFor(() => subscription.latest?.length === 1)

		await join(room)
		await waitFor(() => subscription.latest?.[0]?.clients === 1)

		for (const cleanup of cleanups.splice(1)) {
			cleanup()
		}
		await waitFor(() => subscription.latest?.length === 0)
	})

	test('the host can update meta live without re-joining', async () => {
		const group = crypto.randomUUID()
		const room = crypto.randomUUID()
		const subscription = subscribe(group)
		const signaling = new WebSocketSignaling(
			room,
			server.url,
			crypto.randomUUID() as PeerId,
			noopCallbacks,
			{ group, meta: { status: 'open' } },
		)
		cleanups.push(() => signaling.destroy())
		await signaling.connect()
		await waitFor(() => subscription.latest?.length === 1)

		signaling.setListing({ group, meta: { status: 'running' } })

		await waitFor(
			() =>
				JSON.stringify(subscription.latest?.[0]?.meta) ===
				JSON.stringify({ status: 'running' }),
		)
	})

	test('rooms joined without a group are not listed', async () => {
		const group = crypto.randomUUID()
		const subscription = subscribe(group)
		await waitFor(() => subscription.snapshots.length > 0)

		await join(crypto.randomUUID())
		await new Promise((r) => setTimeout(r, 50))

		expect(subscription.latest).toEqual([])
	})

	test('fetchGroupRooms returns the current list over HTTP', async () => {
		const group = crypto.randomUUID()
		const room = crypto.randomUUID()
		await join(room, { group, maxClients: 2 })
		await join(room)
		await new Promise((r) => setTimeout(r, 50))

		const rooms = await fetchGroupRooms(group, {
			webSocketSignalingServer: server.url,
		})
		expect(rooms).toEqual([{ room, clients: 1, maxClients: 2 }])
	})

	test('oversized meta is dropped while the room stays listed', async () => {
		const group = crypto.randomUUID()
		const room = crypto.randomUUID()
		await join(room, { group, meta: 'x'.repeat(2000) })
		await new Promise((r) => setTimeout(r, 50))

		const rooms = await fetchGroupRooms(group, {
			webSocketSignalingServer: server.url,
		})
		expect(rooms).toEqual([{ room, clients: 0 }])
	})
})
