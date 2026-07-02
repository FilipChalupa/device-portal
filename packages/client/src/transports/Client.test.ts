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
})
