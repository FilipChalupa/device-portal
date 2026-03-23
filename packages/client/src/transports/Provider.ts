import { PeerId } from '../constants'
import { delay } from '../delay'
import { settings } from '../settings'
import { DirectTransport, type BrowserDirectOption } from './DirectTransport'
import { WebSocketSignaling } from './WebSocketSignaling'

type ClientConnection = {
	connection: RTCPeerConnection
	channel: RTCDataChannel
	candidatesQueue: RTCIceCandidateInit[]
	value?: { value: string }
}

/**
 * The Provider acts as the "producer" or "server" in a room.
 * It coordinates with peers via direct browser signaling and/or WebSocket + WebRTC.
 *
 * It automatically initiates connections with joining peers and manages
 * multiple concurrent client connections.
 */
export class Provider {
	private isDestroyed = false
	private value: { value: string } | null = null
	private peerId: PeerId
	private directTransport: DirectTransport | null = null
	private webSocketSignaling: WebSocketSignaling | null = null
	private connections = new Map<PeerId, ClientConnection>()
	private waitingPeers = new Set<PeerId>()
	private pendingPeers = new Set<PeerId>()
	private peerListeners = new Map<PeerId, Set<(value: string) => void>>()

	private readonly onMessage:
		| ((value: string, peerId: PeerId) => void)
		| undefined
	private readonly onPeersChange: ((peers: PeerId[]) => void) | undefined
	private readonly sendLastValueOnConnectAndReconnect: boolean
	private readonly webSocketSignalingServer: string | null
	private readonly iceServers: Array<RTCIceServer>
	private readonly browserDirect: BrowserDirectOption
	private readonly maxClients: number

	constructor(
		private readonly room: string,
		options: {
			onMessage?: (value: string, peerId: PeerId) => void
			onPeersChange?: (peers: PeerId[]) => void
			sendLastValueOnConnectAndReconnect?: boolean
			webSocketSignalingServer?: string | null
			iceServers?: Array<RTCIceServer>
			maxClients?: number
			browserDirect?: BrowserDirectOption
		} = {},
	) {
		this.onMessage = options.onMessage
		this.onPeersChange = options.onPeersChange
		this.sendLastValueOnConnectAndReconnect =
			options.sendLastValueOnConnectAndReconnect ?? true
		this.webSocketSignalingServer =
			options.webSocketSignalingServer === null
				? null
				: (options.webSocketSignalingServer ??
					settings.default.webSocketSignalingServer)
		this.iceServers = options.iceServers ?? settings.default.iceServers
		this.browserDirect = options.browserDirect ?? true
		this.maxClients = options.maxClients ?? 1
		this.peerId = this.generatePeerId()

		queueMicrotask(() => {
			if (!this.isDestroyed) {
				this.run()
			}
		})
	}

	public get peers(): PeerId[] {
		const allPeers = new Set<PeerId>([
			...Array.from(this.connections.keys()),
			...(this.directTransport
				? Array.from(this.directTransport.directPeers)
				: []),
		])
		return Array.from(allPeers)
	}

	public addPeerListener(peerId: PeerId, listener: (value: string) => void) {
		if (!this.peerListeners.has(peerId)) {
			this.peerListeners.set(peerId, new Set())
		}
		this.peerListeners.get(peerId)!.add(listener)
		return () => {
			this.peerListeners.get(peerId)?.delete(listener)
		}
	}

	private async run() {
		try {
			if (this.browserDirect !== false) {
				this.directTransport = new DirectTransport(
					this.room,
					'provider',
					this.peerId,
					this.browserDirect,
					{
						onPeerJoined: (peerId) =>
							this.handleDirectPeerJoined(peerId),
						onPeerLeft: (peerId) => this.handlePeerLeft(peerId),
						onMessage: (data, from) => {
							this.onMessage?.(data, from)
							this.notifyPeerListeners(from, data)
						},
					},
				)
				this.directTransport.start()

				// Wait a bit to see if any direct peers respond
				await delay(200)
			}

			if (this.webSocketSignalingServer && this.shouldConnectToWebSocket()) {
				await this.connectWebSocket()
			}
		} catch (error) {
			queueMicrotask(() => {
				throw error
			})
		}
	}

	private shouldConnectToWebSocket(): boolean {
		return this.peers.length < this.maxClients
	}

	private async connectWebSocket() {
		if (!this.webSocketSignalingServer || this.isDestroyed) return

		this.webSocketSignaling = new WebSocketSignaling(
			this.room,
			this.webSocketSignalingServer,
			this.peerId,
			{
				onIdentity: (peerId) => {
					if (!this.peerId || this.peerId.startsWith('temp-')) {
						this.peerId = peerId
						console.log(`[Provider] My peer ID is: ${peerId}`)
						this.webSocketSignaling?.announceRoom()
					}
				},
				onPeerJoined: (peerId) => this.handleWebRTCPeerJoined(peerId),
				onPeerLeft: (peerId) => this.handlePeerLeft(peerId),
				onOffer: () => {
					// Provider does not handle offers
				},
				onAnswer: (answer, from) => this.handleAnswer(answer, from),
				onIceCandidate: (candidate, from) =>
					this.handleIceCandidate(candidate, from),
			},
		)

		await this.webSocketSignaling.connect()
	}

	private async ensureSignaling() {
		if (
			!this.webSocketSignaling?.isConnected &&
			this.webSocketSignalingServer &&
			!this.isDestroyed
		) {
			try {
				await this.connectWebSocket()
			} catch (error) {
				console.error(
					'[Provider] Failed to connect to signaling server:',
					error,
				)
			}
		}
	}

	private handleDirectPeerJoined(peerId: PeerId) {
		console.log(`[Provider] Direct peer ${peerId} joined, skipping WebRTC.`)
		const existingClient = this.connections.get(peerId)
		if (existingClient) {
			console.log(
				`[Provider] Closing redundant WebRTC connection to direct peer ${peerId}`,
			)
			existingClient.channel.close()
			existingClient.connection.close()
			this.connections.delete(peerId)
		}

		if (this.value && this.sendLastValueOnConnectAndReconnect) {
			this.directTransport?.sendMessage(this.value.value, peerId)
		}

		this.onPeersChange?.(this.peers)
	}

	private async handleWebRTCPeerJoined(peerId: PeerId) {
		console.log(`[Provider] Peer ${peerId} joined`)

		if (this.directTransport?.directPeers.has(peerId)) {
			this.handleDirectPeerJoined(peerId)
			return
		}

		if (this.pendingPeers.has(peerId)) {
			console.log(
				`[Provider] Already connecting to ${peerId} (pending), skipping.`,
			)
			return
		}
		if (this.connections.has(peerId)) {
			const client = this.connections.get(peerId)!
			if (
				client.connection.connectionState === 'connected' ||
				client.connection.connectionState === 'connecting'
			) {
				console.log(
					`[Provider] Connection to ${peerId} already exists or is connecting, skipping.`,
				)
				return
			}
		}
		if (this.connections.size >= this.maxClients) {
			console.log(
				`[Provider] Max clients reached, adding ${peerId} to waiting list`,
			)
			this.waitingPeers.add(peerId)
			return
		}
		this.pendingPeers.add(peerId)
		try {
			await this.createAndSendOffer(peerId)
			this.onPeersChange?.(this.peers)
		} finally {
			this.pendingPeers.delete(peerId)
		}
	}

	private handlePeerLeft(peerId: PeerId) {
		console.log(`[Provider] Peer ${peerId} left`)
		this.waitingPeers.delete(peerId)
		const client = this.connections.get(peerId)
		if (client) {
			client.channel.close()
			client.connection.close()
			this.connections.delete(peerId)
			this.onPeersChange?.(this.peers)
			this.processWaitingPeers()
		} else {
			this.onPeersChange?.(this.peers)
		}

		if (this.shouldConnectToWebSocket()) {
			this.ensureSignaling()
		}
	}

	private async processWaitingPeers() {
		if (
			this.connections.size >= this.maxClients ||
			this.waitingPeers.size === 0
		) {
			return
		}

		const nextPeerId = this.waitingPeers.values().next().value
		if (nextPeerId) {
			if (this.pendingPeers.has(nextPeerId)) {
				return
			}
			console.log(
				`[Provider] Slot available, connecting waiting peer: ${nextPeerId}`,
			)
			this.waitingPeers.delete(nextPeerId)
			this.pendingPeers.add(nextPeerId)
			try {
				await this.createAndSendOffer(nextPeerId)
				this.onPeersChange?.(this.peers)
			} finally {
				this.pendingPeers.delete(nextPeerId)
			}
		}
	}

	private async createAndSendOffer(toPeerId: PeerId) {
		console.log(`[Provider] Creating offer for ${toPeerId}...`)

		const existingClient = this.connections.get(toPeerId)
		if (existingClient) {
			console.log(`[Provider] Closing existing connection for ${toPeerId}`)
			existingClient.connection.close()
			existingClient.channel.close()
		}

		const connection = new RTCPeerConnection({ iceServers: this.iceServers })
		const channel = connection.createDataChannel(settings.channel.label)
		const clientConnection: ClientConnection = {
			connection,
			channel,
			candidatesQueue: [],
		}

		this.connections.set(toPeerId, clientConnection)

		connection.onicecandidate = (event) => {
			if (event.candidate) {
				this.webSocketSignaling?.sendSignaling(
					'ice-candidate',
					event.candidate.toJSON(),
					toPeerId,
				)
			}
		}

		connection.oniceconnectionstatechange = () => {
			console.log(
				`[Provider] ICE state for ${toPeerId}: ${connection.iceConnectionState}`,
			)
			if (
				connection.iceConnectionState === 'disconnected' ||
				connection.iceConnectionState === 'failed' ||
				connection.iceConnectionState === 'closed'
			) {
				this.connections.delete(toPeerId)
				this.onPeersChange?.(this.peers)
				this.processWaitingPeers()
			}
		}

		channel.onopen = () => {
			console.log(`[Provider] Data channel opened for ${toPeerId}`)
			if (this.value && this.sendLastValueOnConnectAndReconnect) {
				channel.send(this.value.value)
			}
			if (clientConnection.value) {
				channel.send(clientConnection.value.value)
			}
		}

		channel.onmessage = (event) => {
			console.log(`[Provider] Message from ${toPeerId}: ${event.data}`)
			this.onMessage?.(event.data, toPeerId)
			this.notifyPeerListeners(toPeerId, event.data)
		}

		const offer = await connection.createOffer()
		await connection.setLocalDescription(offer)
		this.webSocketSignaling?.sendSignaling('offer', offer, toPeerId)
	}

	private async handleAnswer(
		answer: RTCSessionDescriptionInit,
		fromPeerId: PeerId,
	) {
		const client = this.connections.get(fromPeerId)
		if (client) {
			if (client.connection.signalingState === 'stable') {
				console.log(
					`[Provider] Connection to ${fromPeerId} is already stable, skipping answer.`,
				)
				return
			}
			console.log(`[Provider] Handling answer from ${fromPeerId}`)
			await client.connection.setRemoteDescription(answer)
			while (client.candidatesQueue.length > 0) {
				const candidate = client.candidatesQueue.shift()!
				await client.connection.addIceCandidate(
					new RTCIceCandidate(candidate),
				)
			}
		}
	}

	private async handleIceCandidate(
		candidate: RTCIceCandidateInit,
		fromPeerId: PeerId,
	) {
		const client = this.connections.get(fromPeerId)
		if (client) {
			if (client.connection.remoteDescription) {
				await client.connection.addIceCandidate(
					new RTCIceCandidate(candidate),
				)
			} else {
				client.candidatesQueue.push(candidate)
			}
		}
	}

	private notifyPeerListeners(peerId: PeerId, data: string) {
		const listeners = this.peerListeners.get(peerId)
		if (listeners) {
			for (const listener of listeners) {
				listener(data)
			}
		}
	}

	public send(value: string) {
		this.value = { value }

		// Send to direct peers
		if (this.directTransport) {
			this.directTransport.sendMessage(value)
		}

		// Send to WebRTC peers
		for (const client of this.connections.values()) {
			if (client.channel.readyState === 'open') {
				client.channel.send(value)
			}
		}
	}

	public sendToPeer(peerId: PeerId, value: string) {
		// Try direct first
		if (this.directTransport?.directPeers.has(peerId)) {
			this.directTransport.sendMessage(value, peerId)
			return
		}

		const client = this.connections.get(peerId)
		if (!client) return
		client.value = { value }
		if (client.channel.readyState === 'open') {
			client.channel.send(value)
		}
	}

	public destroy() {
		this.isDestroyed = true
		this.directTransport?.destroy()
		this.webSocketSignaling?.destroy()
		for (const client of this.connections.values()) {
			client.channel.close()
			client.connection.close()
		}
		this.connections.clear()
		this.peerListeners.clear()
	}

	private generatePeerId(): PeerId {
		if (typeof crypto !== 'undefined' && crypto.randomUUID) {
			return crypto.randomUUID() as PeerId
		}
		return Math.random().toString(36).substring(2, 15) as PeerId
	}
}
