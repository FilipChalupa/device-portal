import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { Host } from './Host'

/**
 * Regression tests for the host side of reconnection.
 *
 * The customer-screen setup runs with `maxClients: 1`, so a single stale
 * connection record is enough to block the whole room: the host would skip
 * re-offering to a re-announcing client and the client would stay in its
 * reconnecting state forever. These tests drive the host through a mocked
 * signaling socket and mocked RTCPeerConnections to cover those paths.
 */

async function waitFor(
	condition: () => boolean,
	timeout = 4000,
	interval = 5,
): Promise<void> {
	const start = Date.now()
	while (!condition()) {
		if (Date.now() - start > timeout) {
			throw new Error('waitFor timed out')
		}
		await new Promise((resolve) => setTimeout(resolve, interval))
	}
}

class MockDataChannel {
	readyState: 'connecting' | 'open' | 'closed' = 'connecting'
	onopen: (() => void) | null = null
	onmessage: ((event: { data: string }) => void) | null = null
	sent: string[] = []
	constructor(public label: string) {}
	send(data: string) {
		this.sent.push(data)
	}
	close() {
		this.readyState = 'closed'
	}

	// Test helper
	open() {
		this.readyState = 'open'
		this.onopen?.()
	}
}

class MockRTCPeerConnection {
	static instances: MockRTCPeerConnection[] = []

	iceConnectionState = 'new'
	connectionState = 'new'
	signalingState = 'stable'
	remoteDescription: unknown = null
	localDescription: unknown = null
	closed = false
	dataChannel: MockDataChannel | null = null

	onicecandidate: ((event: { candidate: unknown }) => void) | null = null
	oniceconnectionstatechange: (() => void) | null = null
	onconnectionstatechange: (() => void) | null = null

	constructor(_config?: unknown) {
		MockRTCPeerConnection.instances.push(this)
	}

	createDataChannel(label: string) {
		this.dataChannel = new MockDataChannel(label)
		return this.dataChannel
	}
	async createOffer() {
		return { type: 'offer', sdp: 'mock-offer' }
	}
	async createAnswer() {
		return { type: 'answer', sdp: 'mock-answer' }
	}
	async setLocalDescription(description: unknown) {
		this.localDescription = description
	}
	async setRemoteDescription(description: unknown) {
		this.remoteDescription = description
	}
	async addIceCandidate() {}
	close() {
		this.closed = true
		this.iceConnectionState = 'closed'
	}
}

class MockWebSocket {
	static OPEN = 1
	static CONNECTING = 0
	static CLOSING = 2
	static CLOSED = 3
	static instances: MockWebSocket[] = []

	readyState = MockWebSocket.CONNECTING
	onopen: (() => void) | null = null
	onmessage: ((event: { data: string }) => void) | null = null
	onclose: (() => void) | null = null
	onerror: ((error: unknown) => void) | null = null
	sent: Array<Record<string, unknown>> = []

	constructor(public url: string) {
		MockWebSocket.instances.push(this)
	}
	send(data: string) {
		this.sent.push(JSON.parse(data))
	}
	close() {
		this.readyState = MockWebSocket.CLOSED
		this.onclose?.()
	}

	// Test helpers
	open() {
		this.readyState = MockWebSocket.OPEN
		this.onopen?.()
	}
	receive(message: Record<string, unknown>) {
		this.onmessage?.({ data: JSON.stringify(message) })
	}
	sentOfType(type: string) {
		return this.sent.filter((message) => message.type === type)
	}
	offersTo(peerId: string) {
		return this.sentOfType('offer').filter((message) => message.to === peerId)
	}
}

const originalGlobals: Record<string, unknown> = {}
function installGlobal(name: string, value: unknown) {
	originalGlobals[name] = (globalThis as Record<string, unknown>)[name]
	;(globalThis as Record<string, unknown>)[name] = value
}

describe('Host reconnection', () => {
	let hosts: Host[] = []

	beforeEach(() => {
		MockRTCPeerConnection.instances = []
		MockWebSocket.instances = []
		installGlobal('RTCPeerConnection', MockRTCPeerConnection)
		installGlobal('WebSocket', MockWebSocket)
		installGlobal(
			'RTCIceCandidate',
			class {
				constructor(init: unknown) {
					Object.assign(this, init)
				}
			},
		)
	})

	afterEach(() => {
		for (const host of hosts) {
			host.destroy()
		}
		hosts = []
		for (const [name, value] of Object.entries(originalGlobals)) {
			;(globalThis as Record<string, unknown>)[name] = value
		}
	})

	async function startedHost(negotiationTimeoutMilliseconds?: number) {
		const host = new Host('host-room', {
			browserDirect: false,
			webSocketSignalingServer: 'ws://mock',
			iceServers: [],
			maxClients: 1,
			negotiationTimeoutMilliseconds,
		})
		hosts.push(host)

		await waitFor(() => MockWebSocket.instances.length === 1)
		const socket = MockWebSocket.instances[0]
		socket.open()
		await waitFor(() => socket.sentOfType('join-room').length >= 1)
		return { host, socket }
	}

	test('re-offers when a re-announcing peer has a dead connection record', async () => {
		const { socket } = await startedHost()

		socket.receive({
			id: 'joined-1',
			type: 'peer-joined',
			data: { peerId: 'client-a' },
		})
		await waitFor(() => socket.offersTo('client-a').length === 1)
		const staleConnection = MockRTCPeerConnection.instances[0]

		// The link died but the ICE state-change event never fired (e.g. it got
		// lost while the tab was suspended) — only the state property tells.
		staleConnection.iceConnectionState = 'disconnected'

		socket.receive({
			id: 'joined-2',
			type: 'peer-joined',
			data: { peerId: 'client-a' },
		})
		await waitFor(() => socket.offersTo('client-a').length === 2)
		expect(staleConnection.closed).toBe(true)
		expect(MockRTCPeerConnection.instances.length).toBe(2)
	})

	test('does not tear down a live negotiation on a duplicate peer-joined', async () => {
		const { socket } = await startedHost()

		socket.receive({
			id: 'joined-1',
			type: 'peer-joined',
			data: { peerId: 'client-a' },
		})
		await waitFor(() => socket.offersTo('client-a').length === 1)

		socket.receive({
			id: 'joined-2',
			type: 'peer-joined',
			data: { peerId: 'client-a' },
		})
		// Give any wrongly triggered re-offer a moment to show up.
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(socket.offersTo('client-a').length).toBe(1)
		expect(MockRTCPeerConnection.instances[0].closed).toBe(false)
	})

	test('discards a negotiation whose channel never opens and serves the waiting peer', async () => {
		const { socket } = await startedHost(100)

		socket.receive({
			id: 'joined-a',
			type: 'peer-joined',
			data: { peerId: 'client-a' },
		})
		await waitFor(() => socket.offersTo('client-a').length === 1)

		// A second client wants the single slot while the first negotiation
		// hangs — it has to wait.
		socket.receive({
			id: 'joined-b',
			type: 'peer-joined',
			data: { peerId: 'client-b' },
		})
		expect(socket.offersTo('client-b').length).toBe(0)

		// The watchdog frees the slot and the waiting peer gets its offer.
		await waitFor(() => socket.offersTo('client-b').length === 1, 2000)
		expect(MockRTCPeerConnection.instances[0].closed).toBe(true)
	})

	test('keeps a connection whose channel opened in time', async () => {
		const { socket } = await startedHost(100)

		socket.receive({
			id: 'joined-a',
			type: 'peer-joined',
			data: { peerId: 'client-a' },
		})
		await waitFor(() => socket.offersTo('client-a').length === 1)
		MockRTCPeerConnection.instances[0].dataChannel!.open()

		await new Promise((resolve) => setTimeout(resolve, 200))
		expect(MockRTCPeerConnection.instances[0].closed).toBe(false)
	})

	test('lists the room in a group and uses the injected WebRTC implementation', async () => {
		class InjectedRTCPeerConnection extends MockRTCPeerConnection {
			static created = 0
			constructor() {
				super()
				InjectedRTCPeerConnection.created++
			}
		}
		installGlobal('RTCPeerConnection', undefined)

		const host = new Host('host-room', {
			browserDirect: false,
			webSocketSignalingServer: 'ws://mock',
			iceServers: [],
			maxClients: 3,
			group: 'games',
			meta: { name: 'Arena' },
			webrtc: {
				RTCPeerConnection:
					InjectedRTCPeerConnection as unknown as typeof RTCPeerConnection,
			},
		})
		hosts.push(host)

		await waitFor(() => MockWebSocket.instances.length === 1)
		const socket = MockWebSocket.instances[0]
		socket.open()
		await waitFor(() => socket.sentOfType('join-room').length >= 1)
		expect(socket.sentOfType('join-room')[0]).toEqual({
			type: 'join-room',
			room: 'host-room',
			group: 'games',
			maxClients: 3,
			clients: 0,
			meta: { name: 'Arena' },
		})

		socket.receive({
			id: 'joined-a',
			type: 'peer-joined',
			data: { peerId: 'client-a' },
		})
		await waitFor(() => socket.offersTo('client-a').length === 1)
		expect(InjectedRTCPeerConnection.created).toBe(1)

		host.setMeta({ name: 'Arena', status: 'running' })
		expect(socket.sentOfType('update-listing')).toEqual([
			{
				type: 'update-listing',
				meta: { name: 'Arena', status: 'running' },
				clients: 0,
			},
		])
	})

	test('reports only clients with an open channel, not waiting peers', async () => {
		const host = new Host('host-room', {
			browserDirect: false,
			webSocketSignalingServer: 'ws://mock',
			iceServers: [],
			maxClients: 1,
			group: 'games',
		})
		hosts.push(host)
		await waitFor(() => MockWebSocket.instances.length === 1)
		const socket = MockWebSocket.instances[0]
		socket.open()
		await waitFor(() => socket.sentOfType('join-room').length >= 1)
		const reported = () =>
			socket.sentOfType('update-listing').map((message) => message.clients)

		for (const peerId of ['client-a', 'client-b']) {
			socket.receive({
				id: `joined-${peerId}`,
				type: 'peer-joined',
				data: { peerId },
			})
		}
		await waitFor(() => socket.offersTo('client-a').length === 1)
		// Negotiating and waiting peers do not count yet.
		expect(reported()).toEqual([])

		MockRTCPeerConnection.instances[0].dataChannel!.open()
		await waitFor(() => reported().length === 1)
		expect(reported()).toEqual([1])

		socket.receive({
			id: 'left-a',
			type: 'peer-left',
			data: { peerId: 'client-a' },
		})
		await waitFor(() => reported().at(-1) === 0)
	})
})
