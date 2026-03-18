import { PeerId } from '../../../shared/constants'
import { settings } from '../settings'
import { BrowserDirectOption, Peer } from './Peer'

type ClientConnection = {
	connection: RTCPeerConnection
	channel: RTCDataChannel
	candidatesQueue: RTCIceCandidateInit[]
	value?: { value: string }
}

/**
 * The Initiator acts as the "producer" or "server" in a WebRTC room.
 * It coordinates with the signaling server to discover and connect to Responders.
 *
 * It automatically initiates WebRTC connections with joining peers and manages
 * multiple concurrent client connections.
 */
export class Initiator extends Peer {
	protected role = 'initiator' as const
	protected connections = new Map<PeerId, ClientConnection>()
	protected waitingPeers = new Set<PeerId>()
	protected pendingPeers = new Set<PeerId>()
	protected readonly maxClients: number
	protected peerListeners = new Map<PeerId, Set<(value: string) => void>>()
	protected onPeersChange: ((peers: PeerId[]) => void) | undefined
	protected override readonly onMessage:
		| ((value: string, peerId: PeerId) => void)
		| undefined

	/**
	 * Creates a new Initiator.
	 *
	 * @param room - The unique room ID to join.
	 * @param options - Configuration options.
	 * @param options.onMessage - Callback when any client sends a message.
	 * @param options.onPeersChange - Callback when the list of connected peers changes.
	 * @param options.sendLastValueOnConnectAndReconnect - Whether to automatically send the last 'send()' value to new clients.
	 * @param options.webSocketSignalingServer - URL of the signaling server, or null to disable.
	 * @param options.iceServers - Custom RTCIceServer configuration.
	 * @param options.maxClients - Maximum number of concurrent WebRTC connections (default: 1).
	 * @param options.browserDirect - Browser direct signaling options.
	 */
	constructor(
		room: string,
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
		super(room, options)
		this.onMessage = options.onMessage
		this.onPeersChange = options.onPeersChange
		this.maxClients = options.maxClients ?? 1
	}

	public get peers(): PeerId[] {
		const allPeers = new Set<PeerId>([
			...Array.from(this.connections.keys()),
			...Array.from(this.directPeers),
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

	protected async handlePeerJoined(peerId: PeerId) {
		console.log(`[Initiator] Peer ${peerId} joined`)

		if (this.directPeers.has(peerId)) {
			console.log(
				`[Initiator] Peer ${peerId} is a direct peer, skipping WebRTC.`,
			)
			const existingClient = this.connections.get(peerId)
			if (existingClient) {
				console.log(
					`[Initiator] Closing redundant WebRTC connection to direct peer ${peerId}`,
				)
				existingClient.channel.close()
				existingClient.connection.close()
				this.connections.delete(peerId)
			}

			// Send last value to the newly joined direct peer
			if (this.value && this.sendLastValueOnConnectAndReconnect) {
				this.sendDirectSignaling({
					type: 'direct-message',
					from: this.peerId,
					data: this.value.value,
					to: peerId,
				})
			}

			this.onPeersChange?.(this.peers)
			return
		}

		if (this.pendingPeers.has(peerId)) {
			console.log(
				`[Initiator] Already connecting to ${peerId} (pending), skipping.`,
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
					`[Initiator] Connection to ${peerId} already exists or is connecting, skipping.`,
				)
				return
			}
		}
		if (this.connections.size >= this.maxClients) {
			console.log(
				`[Initiator] Max clients reached, adding ${peerId} to waiting list`,
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

	protected override shouldConnectToWebSocket(): boolean {
		return this.peers.length < this.maxClients
	}

	protected handlePeerLeft(peerId: PeerId) {
		console.log(`[Initiator] Peer ${peerId} left`)
		this.waitingPeers.delete(peerId)
		const client = this.connections.get(peerId)
		if (client) {
			client.channel.close()
			client.connection.close()
			this.connections.delete(peerId)
			this.onPeersChange?.(this.peers)
			this.processWaitingPeers()
		} else {
			// Might be a direct peer
			this.onPeersChange?.(this.peers)
		}

		if (this.shouldConnectToWebSocket()) {
			this.ensureSignaling()
		}
	}

	protected async processWaitingPeers() {
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
				`[Initiator] Slot available, connecting waiting peer: ${nextPeerId}`,
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

	protected async createAndSendOffer(toPeerId: PeerId) {
		console.log(`[Initiator] Creating offer for ${toPeerId}...`)

		// Close existing connection if any
		const existingClient = this.connections.get(toPeerId)
		if (existingClient) {
			console.log(`[Initiator] Closing existing connection for ${toPeerId}`)
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
				this.sendMessage('ice-candidate', event.candidate.toJSON(), toPeerId)
			}
		}

		connection.oniceconnectionstatechange = () => {
			console.log(
				`[Initiator] ICE state for ${toPeerId}: ${connection.iceConnectionState}`,
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
			console.log(`[Initiator] Data channel opened for ${toPeerId}`)
			if (this.value && this.sendLastValueOnConnectAndReconnect) {
				channel.send(this.value.value)
			}
			if (clientConnection.value) {
				channel.send(clientConnection.value.value)
			}
		}

		channel.onmessage = (event) => {
			console.log(`[Initiator] Message from ${toPeerId}: ${event.data}`)
			this.onMessage?.(event.data, toPeerId)
			const listeners = this.peerListeners.get(toPeerId)
			if (listeners) {
				for (const listener of listeners) {
					listener(event.data)
				}
			}
		}

		const offer = await connection.createOffer()
		await connection.setLocalDescription(offer)
		this.sendMessage('offer', offer, toPeerId)
	}

	protected handleOffer(
		offer: RTCSessionDescriptionInit,
		fromPeerId: PeerId,
	): void {
		// Initiator does not handle offers
	}

	protected async handleAnswer(
		answer: RTCSessionDescriptionInit,
		fromPeerId: PeerId,
	) {
		const client = this.connections.get(fromPeerId)
		if (client) {
			if (client.connection.signalingState === 'stable') {
				console.log(
					`[Initiator] Connection to ${fromPeerId} is already stable, skipping answer.`,
				)
				return
			}
			console.log(`[Initiator] Handling answer from ${fromPeerId}`)
			await client.connection.setRemoteDescription(answer)
			// Process queued candidates
			while (client.candidatesQueue.length > 0) {
				const candidate = client.candidatesQueue.shift()!
				await client.connection.addIceCandidate(new RTCIceCandidate(candidate))
			}
		}
	}

	protected override onDirectMessageReceived(from: PeerId, data: any) {
		const listeners = this.peerListeners.get(from)
		if (listeners) {
			for (const listener of listeners) {
				listener(data)
			}
		}
	}

	protected async handleIceCandidate(
		candidate: RTCIceCandidateInit,
		fromPeerId?: PeerId,
	) {
		if (!fromPeerId) {
			return
		}
		const client = this.connections.get(fromPeerId)
		if (client) {
			if (client.connection.remoteDescription) {
				await client.connection.addIceCandidate(new RTCIceCandidate(candidate))
			} else {
				client.candidatesQueue.push(candidate)
			}
		}
	}

	public send(value: string) {
		this.value = { value }

		// Send to direct peers
		if (this.browserDirect !== false) {
			this.sendDirectSignaling({
				type: 'direct-message',
				from: this.peerId,
				data: value,
				to: null,
			})
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
		if (this.browserDirect !== false && this.directPeers.has(peerId)) {
			this.sendDirectSignaling({
				type: 'direct-message',
				from: this.peerId,
				data: value,
				to: peerId,
			})
			return
		}

		const client = this.connections.get(peerId)
		if (!client) return
		client.value = { value }
		if (client && client.channel.readyState === 'open') {
			client.channel.send(value)
		}
	}

	public destroy() {
		super.destroy()
		for (const client of this.connections.values()) {
			client.channel.close()
			client.connection.close()
		}
		this.connections.clear()
		this.peerListeners.clear()
	}
}
