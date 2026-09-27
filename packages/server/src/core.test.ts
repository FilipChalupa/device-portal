import type { GroupRoom } from '@device-portal/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
	createSignalingCore,
	noopLogger,
	SignalingCoreOptions,
	SignalingPeerSocket,
} from './core'

class FakeSocket implements SignalingPeerSocket {
	readonly messages: Array<Record<string, unknown>> = []
	open = true
	closedWith: number | undefined

	send(data: string) {
		this.messages.push(JSON.parse(data))
	}
	isOpen() {
		return this.open
	}
	close(code: number) {
		this.open = false
		this.closedWith = code
	}
	ofType(type: string) {
		return this.messages.filter((message) => message.type === type)
	}
	get lastRooms() {
		return this.ofType('group-rooms').at(-1)?.rooms as GroupRoom[] | undefined
	}
}

function setup(options: SignalingCoreOptions = {}) {
	// Broadcast every change unless a test is about the throttle itself.
	const core = createSignalingCore({
		logger: noopLogger,
		groupPublishThrottleMilliseconds: 0,
		...options,
	})
	const connect = (clientKey?: string) => {
		const socket = new FakeSocket()
		const peerId = core.handleOpen(socket, clientKey)!
		return {
			socket,
			peerId,
			join: (room: string, listing?: Record<string, unknown>) =>
				core.handleMessage(
					peerId,
					JSON.stringify({ type: 'join-room', room, ...listing }),
				),
			updateListing: (update: Record<string, unknown>) =>
				core.handleMessage(
					peerId,
					JSON.stringify({ type: 'update-listing', ...update }),
				),
			close: () => core.handleClose(peerId),
		}
	}
	const subscribe = (group: string, clientKey?: string) => {
		const socket = new FakeSocket()
		const unsubscribe = core.subscribeToGroup(group, socket, clientKey)
		return {
			socket,
			unsubscribe: () => unsubscribe?.(),
			accepted: !!unsubscribe,
		}
	}
	return { core, connect, subscribe }
}

afterEach(() => {
	vi.useRealTimers()
})

describe('signaling core', () => {
	test('malformed JSON is ignored and the peer keeps working', () => {
		const { core, connect } = setup()
		const host = connect()
		const client = connect()
		host.join('r')
		expect(() => core.handleMessage(host.peerId, 'not json')).not.toThrow()
		client.join('r')
		expect(host.socket.ofType('peer-joined')).toEqual([
			expect.objectContaining({ data: { peerId: client.peerId } }),
		])
	})

	test('switching rooms notifies the old room and stops forwarding there', () => {
		const { core, connect } = setup()
		const a = connect()
		const b = connect()
		a.join('r1')
		b.join('r1')
		b.join('r2')
		expect(a.socket.ofType('peer-left')).toEqual([
			expect.objectContaining({ data: { peerId: b.peerId } }),
		])
		core.handleMessage(
			b.peerId,
			JSON.stringify({ type: 'offer', from: b.peerId, data: {} }),
		)
		expect(a.socket.ofType('offer')).toHaveLength(0)
	})

	describe('groups', () => {
		test('subscribers get a snapshot immediately and after every change', () => {
			const { connect, subscribe } = setup()
			const subscriber = subscribe('g')
			expect(subscriber.socket.lastRooms).toEqual([])

			const host = connect()
			host.join('room', { group: 'g', maxClients: 2, meta: { name: 'A' } })
			expect(subscriber.socket.lastRooms).toEqual([
				{ room: 'room', clients: 0, maxClients: 2, meta: { name: 'A' } },
			])

			const client = connect()
			client.join('room')
			expect(subscriber.socket.lastRooms).toEqual([
				{ room: 'room', clients: 1, maxClients: 2, meta: { name: 'A' } },
			])

			client.close()
			expect(subscriber.socket.lastRooms?.[0].clients).toBe(0)

			host.close()
			expect(subscriber.socket.lastRooms).toEqual([])
		})

		test('the listing disappears with its host even while clients stay', () => {
			const { core, connect, subscribe } = setup()
			const subscriber = subscribe('g')
			const host = connect()
			const client = connect()
			host.join('room', { group: 'g', maxClients: 1 })
			client.join('room')
			host.close()
			expect(core.getGroupRooms('g')).toEqual([])
			expect(subscriber.socket.lastRooms).toEqual([])

			// A reconnecting host lists the room again under its new identity.
			const returningHost = connect()
			returningHost.join('room', { group: 'g', maxClients: 1 })
			expect(core.getGroupRooms('g')).toEqual([
				{ room: 'room', clients: 1, maxClients: 1 },
			])
		})

		test('a client leaving keeps the listing', () => {
			const { core, connect } = setup()
			const host = connect()
			const client = connect()
			host.join('room', { group: 'g' })
			client.join('room')
			client.close()
			expect(core.getGroupRooms('g')).toEqual([{ room: 'room', clients: 0 }])
		})

		test('re-listing under another group moves the room', () => {
			const { core, connect, subscribe } = setup()
			const g1 = subscribe('g1')
			const g2 = subscribe('g2')
			const host = connect()
			host.join('room', { group: 'g1' })
			host.join('room', { group: 'g2' })
			expect(g1.socket.lastRooms).toEqual([])
			expect(g2.socket.lastRooms).toEqual([{ room: 'room', clients: 0 }])
			expect(core.getGroupRooms('g1')).toEqual([])
		})

		test('unsubscribed and closed sockets receive nothing', () => {
			const { connect, subscribe } = setup()
			const subscriber = subscribe('g')
			subscriber.unsubscribe()
			const closed = subscribe('g')
			closed.socket.open = false
			const host = connect()
			host.join('room', { group: 'g' })
			expect(subscriber.socket.ofType('group-rooms')).toHaveLength(1)
			expect(closed.socket.ofType('group-rooms')).toHaveLength(1)
		})

		test('only the listing owner can update meta, without re-joining', () => {
			const { core, connect, subscribe } = setup()
			const subscriber = subscribe('g')
			const host = connect()
			const client = connect()
			host.join('room', { group: 'g', meta: { status: 'open' } })
			client.join('room')
			const joinedBefore = client.socket.ofType('peer-joined').length

			core.handleMessage(
				client.peerId,
				JSON.stringify({ type: 'update-listing', meta: { status: 'hacked' } }),
			)
			expect(subscriber.socket.lastRooms?.[0].meta).toEqual({ status: 'open' })

			core.handleMessage(
				host.peerId,
				JSON.stringify({ type: 'update-listing', meta: { status: 'full' } }),
			)
			expect(subscriber.socket.lastRooms).toEqual([
				{ room: 'room', clients: 1, meta: { status: 'full' } },
			])
			expect(client.socket.ofType('peer-joined')).toHaveLength(joinedBefore)
		})

		test('a burst of changes is coalesced into a leading and a trailing broadcast', () => {
			vi.useFakeTimers()
			const { connect, subscribe } = setup({
				groupPublishThrottleMilliseconds: 250,
			})
			const subscriber = subscribe('g')
			const host = connect()
			host.join('room', { group: 'g' })
			// Leading edge: the first change goes out immediately.
			expect(subscriber.socket.ofType('group-rooms')).toHaveLength(2)

			const players = [connect(), connect(), connect()]
			for (const player of players) {
				player.join('room')
			}
			expect(subscriber.socket.ofType('group-rooms')).toHaveLength(2)

			vi.advanceTimersByTime(250)
			// Trailing edge: one broadcast with the final state.
			expect(subscriber.socket.ofType('group-rooms')).toHaveLength(3)
			expect(subscriber.socket.lastRooms).toEqual([
				{ room: 'room', clients: 3 },
			])

			// A quiet window ends without a broadcast.
			vi.advanceTimersByTime(250)
			expect(subscriber.socket.ofType('group-rooms')).toHaveLength(3)

			// The next change after the window is immediate again.
			players[0].close()
			expect(subscriber.socket.ofType('group-rooms')).toHaveLength(4)
			expect(subscriber.socket.lastRooms).toEqual([
				{ room: 'room', clients: 2 },
			])
		})

		test('meta above the limit is dropped', () => {
			const { core, connect } = setup()
			const host = connect()
			host.join('room', { group: 'g', meta: 'x'.repeat(2000) })
			expect(core.getGroupRooms('g')).toEqual([{ room: 'room', clients: 0 }])
		})
	})
	describe('listing ownership', () => {
		test('another peer cannot take over a listed room', () => {
			const { core, connect, subscribe } = setup()
			const subscriber = subscribe('g')
			const host = connect()
			const intruder = connect()
			host.join('room', { group: 'g', maxClients: 2, meta: { name: 'A' } })
			intruder.join('room', {
				group: 'g',
				maxClients: 99,
				meta: { name: 'hijacked' },
			})
			intruder.updateListing({ meta: { name: 'hijacked' } })

			expect(core.getGroupRooms('g')).toEqual([
				{ room: 'room', clients: 1, maxClients: 2, meta: { name: 'A' } },
			])
			// The intruder is still an ordinary member of the room.
			expect(host.socket.ofType('peer-joined')).toHaveLength(1)
			expect(subscriber.socket.lastRooms?.[0].meta).toEqual({ name: 'A' })
		})

		test('the room can be listed by a new host once the owner left', () => {
			const { core, connect } = setup()
			const host = connect()
			const next = connect()
			host.join('room', { group: 'g' })
			next.join('room')
			host.close()
			next.join('room', { group: 'g', meta: { name: 'B' } })
			expect(core.getGroupRooms('g')).toEqual([
				{ room: 'room', clients: 0, meta: { name: 'B' } },
			])
		})
	})

	describe('reported client count', () => {
		test('the host-reported count wins over open sockets', () => {
			const { core, connect } = setup()
			const host = connect()
			host.join('room', { group: 'g', maxClients: 1, clients: 0 })
			// Two peers connect but only one gets the single slot.
			connect().join('room')
			connect().join('room')
			expect(core.getGroupRooms('g')[0].clients).toBe(0)

			host.updateListing({ clients: 1 })
			expect(core.getGroupRooms('g')[0]).toEqual({
				room: 'room',
				clients: 1,
				maxClients: 1,
			})
		})

		test('a meta-only update keeps the reported count', () => {
			const { core, connect } = setup()
			const host = connect()
			host.join('room', { group: 'g', clients: 3 })
			host.updateListing({ meta: { name: 'A' } })
			expect(core.getGroupRooms('g')[0]).toEqual({
				room: 'room',
				clients: 3,
				meta: { name: 'A' },
			})
		})

		test('hosts that do not report fall back to counting sockets', () => {
			const { core, connect } = setup()
			connect().join('room', { group: 'g' })
			connect().join('room')
			expect(core.getGroupRooms('g')[0].clients).toBe(1)
		})
	})

	describe('limits', () => {
		test('overlong room and group names are ignored or refused', () => {
			const { core, connect, subscribe } = setup({ maxNameLength: 8 })
			const peer = connect()
			const other = connect()
			other.join('123456789')
			peer.join('123456789')
			expect(peer.socket.ofType('peer-joined')).toHaveLength(0)

			peer.join('room', { group: '123456789' })
			expect(core.getGroupRooms('123456789')).toEqual([])

			const refused = subscribe('123456789')
			expect(refused.accepted).toBe(false)
			expect(refused.socket.closedWith).toBe(1008)
		})

		test('sockets per client are capped across peers and subscriptions', () => {
			const { core, connect, subscribe } = setup({ maxSocketsPerClient: 2 })
			const first = connect('1.2.3.4')
			const subscription = subscribe('g', '1.2.3.4')
			expect(subscription.accepted).toBe(true)

			const socket = new FakeSocket()
			expect(core.handleOpen(socket, '1.2.3.4')).toBeNull()
			expect(socket.closedWith).toBe(1008)
			expect(subscribe('g', '1.2.3.4').accepted).toBe(false)
			// Other clients and sockets without a key are unaffected.
			expect(core.handleOpen(new FakeSocket(), '5.6.7.8')).not.toBeNull()
			expect(core.handleOpen(new FakeSocket())).not.toBeNull()

			// Unsubscribing twice frees a single slot only.
			subscription.unsubscribe()
			subscription.unsubscribe()
			first.close()
			expect(connect('1.2.3.4').peerId).not.toBeNull()
			expect(subscribe('g', '1.2.3.4').accepted).toBe(true)
			expect(core.handleOpen(new FakeSocket(), '1.2.3.4')).toBeNull()
		})
	})
})
