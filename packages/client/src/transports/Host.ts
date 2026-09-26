import { PeerId, generatePeerId } from '../constants'
import { delay } from '../delay'
import { settings } from '../settings'
import {
	defaultBrowserDirect,
	resolveRTCPeerConnection,
	type WebRtcOption,
} from '../utilities/environment'
import { DirectTransport, type BrowserDirectOption } from './DirectTransport'
import { WebSocketSignaling } from './WebSocketSignaling'

type ClientConnection = {
	connection: RTCPeerConnection
	channel: RTCDataChannel
	candidatesQueue: RTCIceCandidateInit[]
	negotiationWatchdog: ReturnType<typeof setTimeout> | null
	value?: { value: string }
}

const defaultNegotiationTimeoutMilliseconds = 15_000

/**
 * The Host acts as the "producer" or "server" in a room.
 * It coordinates with peers via direct browser signaling and/or WebSocket + WebRTC.
 *
 * It automatically initiates connections with joining peers and manages
 * multiple concurrent client connections.
 */
export class Host {
	private isDestroyed = false
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
	private readonly onPeerConnected: ((peerId: PeerId) => void) | undefined
	private readonly webSocketSignalingServer: string | null
	private readonly iceServers: Array<RTCIceServer>
	private readonly browserDirect: BrowserDirectOption
	private readonly maxClients: number
	private readonly negotiationTimeoutMilliseconds: number
	private readonly group: string | undefined
	private meta: unknown
	private readonly webrtc: WebRtcOption | undefined

	constructor(
		private readonly room: string,
		options: {
			onMessage?: (value: string, peerId: PeerId) => void
			onPeersChange?: (peers: PeerId[]) => void
			onPeerConnected?: (peerId: PeerId) => void
			webSocketSignalingServer?: string | null
			iceServers?: Array<RTCIceServer>
			maxClients?: number
			/** Defaults to `true` in browsers and `false` elsewhere. */
			browserDirect?: BrowserDirectOption
			peerId?: PeerId
			/**
			 * Lists the room publicly under this group on the signaling server so
			 * `subscribeToGroup` / `fetchGroupRooms` can discover it, together with
			 * `maxClients` and `meta`. Must not be empty.
			 */
			group?: string
			/**
			 * Arbitrary JSON published with the group listing, e.g. a game name.
			 * The server drops it above its `maxMetaBytes` (1 kB by default).
			 * Change it later with `setMeta`.
			 */
			meta?: unknown
			/** WebRTC implementation for runtimes without a global one (Node). */
			webrtc?: WebRtcOption
			/**
			 * How long an offered connection may sit without an open data channel
			 * before it is discarded. Prevents a stalled negotiation (lost answer,
			 * unreachable peer) from occupying a client slot forever.
			 */
			negotiationTimeoutMilliseconds?: number
		} = {},
	) {
		this.onMessage = options.onMessage
		this.onPeersChange = options.onPeersChange
		this.onPeerConnected = options.onPeerConnected
		this.webSocketSignalingServer =
			options.webSocketSignalingServer === null
				? null
				: (options.webSocketSignalingServer ??
					settings.default.webSocketSignalingServer)
		this.iceServers = options.iceServers ?? settings.default.iceServers
		this.browserDirect = options.browserDirect ?? defaultBrowserDirect()
		this.maxClients = options.maxClients ?? 1
		this.negotiationTimeoutMilliseconds =
			options.negotiationTimeoutMilliseconds ??
			defaultNegotiationTimeoutMilliseconds
		if (options.group === '') {
			throw new Error('[Host] group must not be an empty string')
		}
		this.group = options.group
		this.meta = options.meta
		this.webrtc = options.webrtc
		this.peerId = options.peerId ?? generatePeerId()

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
					'host',
					this.peerId,
					this.browserDirect,
					{
						onPeerJoined: (peerId) => this.handleDirectPeerJoined(peerId),
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

		// Replace, never accumulate: a previous instance keeps reconnecting on
		// its own, and two live sockets would hold two different peer identities.
		this.webSocketSignaling?.destroy()
		this.webSocketSignaling = new WebSocketSignaling(
			this.room,
			this.webSocketSignalingServer,
			this.peerId,
			{
				onIdentity: (peerId) => {
					this.peerId = peerId
				},
				onPeerJoined: (peerId) => this.handleWebRTCPeerJoined(peerId),
				onPeerLeft: (peerId) => this.handlePeerLeft(peerId),
				onOffer: () => {
					// Host does not handle offers
				},
				onAnswer: (answer, from) => this.handleAnswer(answer, from),
				onIceCandidate: (candidate, from) =>
					this.handleIceCandidate(candidate, from),
			},
			this.listing,
		)

		await this.webSocketSignaling.connect()
	}

	private get listing() {
		if (this.group === undefined) {
			return undefined
		}
		return {
			group: this.group,
			maxClients: this.maxClients,
			...(this.meta === undefined ? {} : { meta: this.meta }),
		}
	}

	/**
	 * Updates the `meta` shown in the group listing without reconnecting.
	 * Has no visible effect when the host was created without `group`.
	 */
	public setMeta(meta: unknown) {
		this.meta = meta
		this.webSocketSignaling?.setListing(this.listing)
	}

	private async ensureSignaling() {
		// WebSocketSignaling reconnects on its own after a dropped socket;
		// creating a replacement while it waits out its backoff would leak a
		// second socket with a different peer identity.
		if (
			!this.webSocketSignaling &&
			this.webSocketSignalingServer &&
			!this.isDestroyed
		) {
			try {
				await this.connectWebSocket()
			} catch (error) {
				console.error('[Host] Failed to connect to signaling server:', error)
			}
		}
	}

	/**
	 * Closes a client connection and cancels its negotiation watchdog so the
	 * timer cannot fire for an already discarded connection.
	 */
	private closeClientConnection(clientConnection: ClientConnection) {
		if (clientConnection.negotiationWatchdog !== null) {
			clearTimeout(clientConnection.negotiationWatchdog)
			clientConnection.negotiationWatchdog = null
		}
		clientConnection.channel.close()
		clientConnection.connection.close()
	}

	private handleDirectPeerJoined(peerId: PeerId) {
		console.log(`[Host] Direct peer ${peerId} joined, skipping WebRTC.`)
		const existingClient = this.connections.get(peerId)
		if (existingClient) {
			console.log(
				`[Host] Closing redundant WebRTC connection to direct peer ${peerId}`,
			)
			this.closeClientConnection(existingClient)
			this.connections.delete(peerId)
		}

		this.onPeerConnected?.(peerId)
		this.onPeersChange?.(this.peers)
	}

	private async handleWebRTCPeerJoined(peerId: PeerId) {
		console.log(`[Host] Peer ${peerId} joined`)

		if (this.directTransport?.directPeers.has(peerId)) {
			this.handleDirectPeerJoined(peerId)
			return
		}

		if (this.pendingPeers.has(peerId)) {
			console.log(`[Host] Already connecting to ${peerId} (pending), skipping.`)
			return
		}
		const existingClient = this.connections.get(peerId)
		if (existingClient) {
			const iceConnectionState = existingClient.connection.iceConnectionState
			const isDead =
				iceConnectionState === 'failed' ||
				iceConnectionState === 'disconnected' ||
				iceConnectionState === 'closed'
			if (!isDead) {
				// Either healthy, or still negotiating — the negotiation watchdog
				// discards a stalled one, and the client keeps re-announcing.
				console.log(
					`[Host] Connection to ${peerId} is alive or negotiating, skipping.`,
				)
				return
			}
			// The peer re-announced while our record of it is dead — replace it
			// with a fresh offer instead of leaving it to block the client slot.
			console.log(
				`[Host] Discarding dead connection to ${peerId} before re-offering.`,
			)
			this.closeClientConnection(existingClient)
			this.connections.delete(peerId)
		}
		if (this.connections.size >= this.maxClients) {
			console.log(
				`[Host] Max clients reached, adding ${peerId} to waiting list`,
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
		console.log(`[Host] Peer ${peerId} left`)
		this.waitingPeers.delete(peerId)
		const client = this.connections.get(peerId)
		if (client) {
			this.closeClientConnection(client)
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
				`[Host] Slot available, connecting waiting peer: ${nextPeerId}`,
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
		console.log(`[Host] Creating offer for ${toPeerId}...`)

		const existingClient = this.connections.get(toPeerId)
		if (existingClient) {
			console.log(`[Host] Closing existing connection for ${toPeerId}`)
			this.closeClientConnection(existingClient)
		}

		// Resolved lazily: direct-only setups never need WebRTC at all.
		const RTCPeerConnection = resolveRTCPeerConnection(this.webrtc)
		const connection = new RTCPeerConnection({ iceServers: this.iceServers })
		const channel = connection.createDataChannel(settings.channel.label)
		const clientConnection: ClientConnection = {
			connection,
			channel,
			candidatesQueue: [],
			negotiationWatchdog: null,
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
				`[Host] ICE state for ${toPeerId}: ${connection.iceConnectionState}`,
			)
			if (
				connection.iceConnectionState === 'disconnected' ||
				connection.iceConnectionState === 'failed' ||
				connection.iceConnectionState === 'closed'
			) {
				// Only discard the map entry if it still belongs to this
				// connection — a late event from a replaced connection must not
				// remove its successor.
				if (this.connections.get(toPeerId) === clientConnection) {
					this.closeClientConnection(clientConnection)
					this.connections.delete(toPeerId)
					this.onPeersChange?.(this.peers)
					this.processWaitingPeers()
				}
			}
		}

		channel.onopen = () => {
			console.log(`[Host] Data channel opened for ${toPeerId}`)
			if (clientConnection.negotiationWatchdog !== null) {
				clearTimeout(clientConnection.negotiationWatchdog)
				clientConnection.negotiationWatchdog = null
			}
			this.onPeerConnected?.(toPeerId)
			if (clientConnection.value) {
				channel.send(clientConnection.value.value)
			}
		}

		channel.onmessage = (event) => {
			console.log(`[Host] Message from ${toPeerId}: ${event.data}`)
			this.onMessage?.(event.data, toPeerId)
			this.notifyPeerListeners(toPeerId, event.data)
		}

		const offer = await connection.createOffer()
		await connection.setLocalDescription(offer)
		this.webSocketSignaling?.sendSignaling('offer', offer, toPeerId)

		// A negotiation that never opens the data channel (lost answer,
		// unreachable peer) would otherwise occupy a client slot forever — with
		// the default `maxClients: 1` that blocks the whole room. Discard it
		// after a deadline; the client keeps re-announcing and gets a new offer.
		clientConnection.negotiationWatchdog = setTimeout(() => {
			clientConnection.negotiationWatchdog = null
			if (this.connections.get(toPeerId) !== clientConnection) {
				return
			}
			if (clientConnection.channel.readyState === 'open') {
				return
			}
			console.log(`[Host] Negotiation with ${toPeerId} timed out, discarding.`)
			this.closeClientConnection(clientConnection)
			this.connections.delete(toPeerId)
			this.onPeersChange?.(this.peers)
			this.processWaitingPeers()
		}, this.negotiationTimeoutMilliseconds)
	}

	private async handleAnswer(
		answer: RTCSessionDescriptionInit,
		fromPeerId: PeerId,
	) {
		const client = this.connections.get(fromPeerId)
		if (client) {
			if (client.connection.signalingState === 'stable') {
				console.log(
					`[Host] Connection to ${fromPeerId} is already stable, skipping answer.`,
				)
				return
			}
			console.log(`[Host] Handling answer from ${fromPeerId}`)
			await client.connection.setRemoteDescription(answer)
			while (client.candidatesQueue.length > 0) {
				const candidate = client.candidatesQueue.shift()!
				await client.connection.addIceCandidate(candidate)
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
				await client.connection.addIceCandidate(candidate)
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
			this.closeClientConnection(client)
		}
		this.connections.clear()
		this.peerListeners.clear()
	}
}
