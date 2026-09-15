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

	send(data: string) {
		this.messages.push(JSON.parse(data))
	}
	isOpen() {
		return this.open
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
	const connect = () => {
		const socket = new FakeSocket()
		const peerId = core.handleOpen(socket)
		return {
			socket,
			peerId,
			join: (room: string, listing?: Record<string, unknown>) =>
				core.handleMessage(
					peerId,
					JSON.stringify({ type: 'join-room', room, ...listing }),
				),
			close: () => core.handleClose(peerId),
		}
	}
	const subscribe = (group: string) => {
		const socket = new FakeSocket()
		const unsubscribe = core.subscribeToGroup(group, socket)
		return { socket, unsubscribe }
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

		test('the listing survives the host leaving while clients stay', () => {
			const { core, connect } = setup()
			const host = connect()
			const client = connect()
			host.join('room', { group: 'g', maxClients: 1 })
			client.join('room')
			host.close()
			expect(core.getGroupRooms('g')).toEqual([
				{ room: 'room', clients: 1, maxClients: 1 },
			])
			client.close()
			expect(core.getGroupRooms('g')).toEqual([])
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
})
