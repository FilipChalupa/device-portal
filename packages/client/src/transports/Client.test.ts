import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Client } from './Client'

/**
 * Reconnection regression tests for the WebRTC client.
 *
 * These drive the client through a mocked signaling socket and a mocked
 * RTCPeerConnection so the WebRTC path (which jsdom/node lack) can be exercised
 * deterministically. The scenario mirrors the real bug: once the peer
 * connection dropped, the client reused the dead connection for the next offer
 * and never recovered until the page was reloaded.
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
	readyState: 'open' | 'closed' = 'open'
	onopen: (() => void) | null = null
	onmessage: ((event: { data: string }) => void) | null = null
	send = vi.fn()
	close = vi.fn(() => {
		this.readyState = 'closed'
	})
	constructor(public label: string) {}
	open() {
		this.onopen?.()
	}
}

class MockRTCPeerConnection {
	static instances: MockRTCPeerConnection[] = []
	static failNextSetRemoteDescription = false

	iceConnectionState = 'new'
	connectionState = 'new'
	signalingState = 'stable'
	remoteDescription: unknown = null
	localDescription: unknown = null
	closed = false

	onicecandidate: ((event: { candidate: unknown }) => void) | null = null
	oniceconnectionstatechange: (() => void) | null = null
	onconnectionstatechange: (() => void) | null = null
	ondatachannel: ((event: { channel: MockDataChannel }) => void) | null = null

	constructor(_config?: unknown) {
		MockRTCPeerConnection.instances.push(this)
	}

	createDataChannel(label: string) {
		return new MockDataChannel(label)
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
		if (MockRTCPeerConnection.failNextSetRemoteDescription) {
			MockRTCPeerConnection.failNextSetRemoteDescription = false
			throw new Error('Simulated setRemoteDescription failure')
		}
		if (this.closed) {
			throw new Error('Cannot set remote description on a closed connection')
		}
		this.remoteDescription = description
	}
	async addIceCandidate() {}
	close() {
		this.closed = true
		this.iceConnectionState = 'closed'
	}

	// Test helpers
	emitIceState(state: string) {
		this.iceConnectionState = state
		this.oniceconnectionstatechange?.()
	}
	emitDataChannel() {
		const channel = new MockDataChannel('data')
		this.ondatachannel?.({ channel })
		return channel
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
}

const originalGlobals: Record<string, unknown> = {}
function installGlobal(name: string, value: unknown) {
	originalGlobals[name] = (globalThis as Record<string, unknown>)[name]
	;(globalThis as Record<string, unknown>)[name] = value
}

describe('Client reconnection', () => {
	let clients: Client[] = []

	beforeEach(() => {
		MockRTCPeerConnection.instances = []
		MockRTCPeerConnection.failNextSetRemoteDescription = false
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
		installGlobal(
			'RTCSessionDescription',
			class {
				constructor(init: unknown) {
					Object.assign(this, init)
				}
			},
		)
	})

	afterEach(() => {
		for (const client of clients) {
			client.destroy()
		}
		clients = []
		for (const [name, value] of Object.entries(originalGlobals)) {
			;(globalThis as Record<string, unknown>)[name] = value
		}
	})

	async function connectedClient() {
		const onConnected = vi.fn()
		const onDisconnected = vi.fn()
		const client = new Client('reconnect-room', {
			browserDirect: false,
			webSocketSignalingServer: 'ws://mock',
			iceServers: [],
			onConnected,
			onDisconnected,
		})
		clients.push(client)

		await waitFor(() => MockWebSocket.instances.length === 1)
		const socket = MockWebSocket.instances[0]
		socket.open()
		await waitFor(() => socket.sentOfType('join-room').length >= 1)

		// Host answers the announce with an offer.
		socket.receive({
			id: 'offer-1',
			type: 'offer',
			from: 'host-peer',
			data: { type: 'offer', sdp: 'host-offer-1' },
		})
		await waitFor(() => MockRTCPeerConnection.instances.length === 1)
		await waitFor(() => socket.sentOfType('answer').length >= 1)

		const connection = MockRTCPeerConnection.instances[0]
		connection.emitDataChannel().open()
		await waitFor(() => onConnected.mock.calls.length === 1)

		return { client, socket, connection, onConnected, onDisconnected }
	}

	test('rebuilds the peer connection after an ICE failure instead of reusing the dead one', async () => {
		const { socket, connection, onDisconnected } = await connectedClient()

		const joinsBeforeDrop = socket.sentOfType('join-room').length

		// The link drops.
		connection.emitIceState('failed')
		expect(onDisconnected).toHaveBeenCalledTimes(1)

		// The reconnection timer re-announces to the room.
		await waitFor(() => socket.sentOfType('join-room').length > joinsBeforeDrop)

		// The dead connection must have been torn down…
		expect(connection.closed).toBe(true)

		// …so the host's fresh offer builds a brand-new peer connection.
		socket.receive({
			id: 'offer-2',
			type: 'offer',
			from: 'host-peer',
			data: { type: 'offer', sdp: 'host-offer-2' },
		})
		await waitFor(() => MockRTCPeerConnection.instances.length === 2)

		const secondConnection = MockRTCPeerConnection.instances[1]
		expect(secondConnection).not.toBe(connection)
		expect(secondConnection.remoteDescription).toEqual({
			type: 'offer',
			sdp: 'host-offer-2',
		})
	})

	test('rebuilds the peer connection after the host leaves', async () => {
		const { socket, connection } = await connectedClient()
		const joinsBeforeLeft = socket.sentOfType('join-room').length

		socket.receive({
			id: 'left-1',
			type: 'peer-left',
			data: { peerId: 'host-peer' },
		})

		expect(connection.closed).toBe(true)
		await waitFor(() => socket.sentOfType('join-room').length > joinsBeforeLeft)

		socket.receive({
			id: 'offer-3',
			type: 'offer',
			from: 'host-peer',
			data: { type: 'offer', sdp: 'host-offer-3' },
		})
		await waitFor(() => MockRTCPeerConnection.instances.length === 2)
	})

	test('keeps re-announcing when a negotiation stalls before the channel opens', async () => {
		const onConnected = vi.fn()
		const client = new Client('stall-room', {
			browserDirect: false,
			webSocketSignalingServer: 'ws://mock',
			iceServers: [],
			onConnected,
		})
		clients.push(client)

		await waitFor(() => MockWebSocket.instances.length === 1)
		const socket = MockWebSocket.instances[0]
		socket.open()
		await waitFor(() => socket.sentOfType('join-room').length >= 1)

		// The host offers, the client answers — but ICE never progresses (e.g.
		// the answer or the candidates got lost on the way).
		socket.receive({
			id: 'stalled-offer',
			type: 'offer',
			from: 'host-peer',
			data: { type: 'offer', sdp: 'stalled-offer' },
		})
		await waitFor(() => socket.sentOfType('answer').length >= 1)
		const joinsAfterOffer = socket.sentOfType('join-room').length

		// The reconnection loop must give up on the stalled negotiation and
		// re-announce instead of idling forever.
		await waitFor(
			() => socket.sentOfType('join-room').length > joinsAfterOffer,
			8000,
		)
		expect(MockRTCPeerConnection.instances[0].closed).toBe(true)

		// The fresh offer then connects normally.
		socket.receive({
			id: 'retry-offer',
			type: 'offer',
			from: 'host-peer',
			data: { type: 'offer', sdp: 'retry-offer' },
		})
		await waitFor(() => MockRTCPeerConnection.instances.length === 2)
		MockRTCPeerConnection.instances[1].emitDataChannel().open()
		await waitFor(() => onConnected.mock.calls.length === 1)
	})

	test('recovers when handling an offer throws', async () => {
		const onConnected = vi.fn()
		const client = new Client('offer-error-room', {
			browserDirect: false,
			webSocketSignalingServer: 'ws://mock',
			iceServers: [],
			onConnected,
		})
		clients.push(client)

		await waitFor(() => MockWebSocket.instances.length === 1)
		const socket = MockWebSocket.instances[0]
		socket.open()
		await waitFor(() => socket.sentOfType('join-room').length >= 1)
		const joinsBeforeOffer = socket.sentOfType('join-room').length

		MockRTCPeerConnection.failNextSetRemoteDescription = true
		socket.receive({
			id: 'broken-offer',
			type: 'offer',
			from: 'host-peer',
			data: { type: 'offer', sdp: 'broken-offer' },
		})

		// The failed negotiation must fall back to the reconnection loop.
		await waitFor(
			() => socket.sentOfType('join-room').length > joinsBeforeOffer,
			8000,
		)

		socket.receive({
			id: 'working-offer',
			type: 'offer',
			from: 'host-peer',
			data: { type: 'offer', sdp: 'working-offer' },
		})
		await waitFor(() => socket.sentOfType('answer').length >= 1)
		await waitFor(() => MockRTCPeerConnection.instances.length === 2)
		MockRTCPeerConnection.instances[1].emitDataChannel().open()
		await waitFor(() => onConnected.mock.calls.length === 1)
	})

	test('reports connected again after a transient ICE drop recovers on its own', async () => {
		const { connection, onConnected, onDisconnected } = await connectedClient()

		connection.emitIceState('disconnected')
		expect(onDisconnected).toHaveBeenCalledTimes(1)

		// The ICE layer recovers while the data channel stayed open all along.
		connection.emitIceState('connected')
		expect(onConnected).toHaveBeenCalledTimes(2)
		expect(connection.closed).toBe(false)
	})

	test('ignores a departure of a peer other than the offering host', async () => {
		const { socket, connection, onDisconnected } = await connectedClient()

		// E.g. a stale identity dropped when the host's signaling socket
		// reconnected — the live link must stay untouched.
		socket.receive({
			id: 'left-stale',
			type: 'peer-left',
			data: { peerId: 'stale-host-identity' },
		})

		expect(connection.closed).toBe(false)
		expect(onDisconnected).not.toHaveBeenCalled()
	})

	test('keeps a single signaling socket while reconnecting', async () => {
		const { socket, connection, onConnected } = await connectedClient()

		// The link and the signaling socket drop at the same time.
		connection.emitIceState('failed')
		socket.close()

		// WebSocketSignaling reconnects on its own (one new socket); the
		// reconnection loop must not spawn additional instances on top.
		await waitFor(() => MockWebSocket.instances.length === 2, 3000)
		await new Promise((resolve) => setTimeout(resolve, 2500))
		expect(MockWebSocket.instances.length).toBe(2)

		// The replacement socket picks the flow back up.
		const replacementSocket = MockWebSocket.instances[1]
		replacementSocket.open()
		await waitFor(() => replacementSocket.sentOfType('join-room').length >= 1)
		replacementSocket.receive({
			id: 'offer-after-socket-drop',
			type: 'offer',
			from: 'host-peer',
			data: { type: 'offer', sdp: 'offer-after-socket-drop' },
		})
		await waitFor(() => MockRTCPeerConnection.instances.length === 2)
		MockRTCPeerConnection.instances[1].emitDataChannel().open()
		await waitFor(() => onConnected.mock.calls.length === 2)
	})
})
