import { PeerId, generatePeerId } from '../constants'
import { delay } from '../delay'
import { settings } from '../settings'
import { getExponentialBackoffDelay } from '../utilities/backoff'
import {
	defaultBrowserDirect,
	resolveRTCPeerConnection,
	type WebRtcOption,
} from '../utilities/environment'
import { DirectTransport, type BrowserDirectOption } from './DirectTransport'
import { WebSocketSignaling } from './WebSocketSignaling'

/**
 * The Client acts as the "client" in a room.
 * It coordinates with the host via direct browser signaling and/or WebSocket + WebRTC.
 * It waits for the Host to establish a connection.
 */
export class Client {
	private isDestroyed = false
	private peerId: PeerId
	private directTransport: DirectTransport | null = null
	private webSocketSignaling: WebSocketSignaling | null = null
	private connection: RTCPeerConnection | null = null
	private channel: RTCDataChannel | null = null
	private candidatesQueue: RTCIceCandidateInit[] = []
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
	private isHandlingOffer = false
	private reconnectTimerAttempts = 0
	/**
	 * Signaling identity of the host whose offer we last handled. Departures of
	 * any other peer (e.g. a stale identity dropped when the host's signaling
	 * socket reconnects) say nothing about our link and must not tear it down.
	 */
	private hostPeerId: PeerId | null = null
	/**
	 * The connection a reconnection-timer tick already saw while it was still
	 * negotiating. If the next tick finds the same connection still without an
	 * open channel, the negotiation is considered stalled.
	 */
	private connectionAwaitedByReconnectTimer: RTCPeerConnection | null = null

	private isConnected = false

	private readonly onMessage:
		| ((value: string, peerId: PeerId) => void)
		| undefined
	private readonly onConnected: (() => void) | undefined
	private readonly onDisconnected: (() => void) | undefined
	private readonly webSocketSignalingServer: string | null
	private readonly iceServers: Array<RTCIceServer>
	private readonly browserDirect: BrowserDirectOption
	private readonly webrtc: WebRtcOption | undefined

	constructor(
		private readonly room: string,
		options: {
			onMessage?: (value: string, peerId: PeerId) => void
			/**
			 * Fired when the link to the host becomes ready (direct peer
			 * joined or WebRTC data channel opened). Also fired on every
			 * subsequent successful reconnect. Deduplicated: while the link
			 * stays up, only the first transition fires.
			 */
			onConnected?: () => void
			/**
			 * Fired when the link to the host is lost (peer left or ICE
			 * connection failed/disconnected/closed). The Client automatically
			 * starts reconnecting in the background; `onConnected` fires again
			 * once the link is restored. Deduplicated: only the transition
			 * from connected → disconnected fires this callback.
			 */
			onDisconnected?: () => void
			webSocketSignalingServer?: string | null
			iceServers?: Array<RTCIceServer>
			/** Defaults to `true` in browsers and `false` elsewhere. */
			browserDirect?: BrowserDirectOption
			peerId?: PeerId
			/** WebRTC implementation for runtimes without a global one (Node). */
			webrtc?: WebRtcOption
		} = {},
	) {
		this.onMessage = options.onMessage
		this.onConnected = options.onConnected
		this.onDisconnected = options.onDisconnected
		this.webSocketSignalingServer =
			options.webSocketSignalingServer === null
				? null
				: (options.webSocketSignalingServer ??
					settings.default.webSocketSignalingServer)
		this.iceServers = options.iceServers ?? settings.default.iceServers
		this.browserDirect = options.browserDirect ?? defaultBrowserDirect()
		this.webrtc = options.webrtc
		this.peerId = options.peerId ?? generatePeerId()

		queueMicrotask(() => {
			if (!this.isDestroyed) {
				this.run()
			}
		})
	}

	private async run() {
		try {
			if (this.browserDirect !== false) {
				this.directTransport = new DirectTransport(
					this.room,
					'client',
					this.peerId,
					this.browserDirect,
					{
						onPeerJoined: (peerId) => this.handleDirectPeerJoined(peerId),
						onPeerLeft: (peerId) => this.handlePeerLeft(peerId),
						onMessage: (data, from) => {
							this.onMessage?.(data, from)
						},
					},
				)
				this.directTransport.start()

				// Wait a bit to see if any direct peers respond
				await delay(200)
			}

			const hasDirectPeers =
				this.directTransport && this.directTransport.directPeers.size > 0

			if (this.webSocketSignalingServer && !hasDirectPeers) {
				await this.connectWebSocket()
			}
		} catch (error) {
			queueMicrotask(() => {
				throw error
			})
		}
	}

	private async connectWebSocket() {
		if (!this.webSocketSignalingServer || this.isDestroyed) return

		// Replace, never accumulate: a previous instance keeps reconnecting on
		// its own, and two live sockets would hold two different peer identities
		// — the host would then address offers to one identity while our answers
		// leave with the other, and the negotiation would never complete.
		this.webSocketSignaling?.destroy()
		this.webSocketSignaling = new WebSocketSignaling(
			this.room,
			this.webSocketSignalingServer,
			this.peerId,
			{
				onIdentity: (peerId) => {
					this.peerId = peerId
				},
				onPeerJoined: () => {
					// Client waits for offers, no action on peer-joined
				},
				onPeerLeft: (peerId) => {
					// The signaling server reports every departure in the room,
					// including stale identities dropped when a peer's socket
					// reconnects. Only the departure of the offering host says
					// anything about our link.
					if (peerId === this.hostPeerId) {
						this.handlePeerLeft(peerId)
					}
				},
				onOffer: (offer, from) => this.handleOffer(offer, from),
				onAnswer: () => {
					// Client does not handle answers
				},
				onIceCandidate: (candidate) => this.handleIceCandidate(candidate),
			},
		)

		await this.webSocketSignaling.connect()
		this.startReconnectionTimer()
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
				console.error('[Client] Failed to connect to signaling server:', error)
			}
		}
	}

	private setConnectionState(connected: boolean) {
		if (connected) {
			// An open data channel (or direct link) is the source of truth for
			// being connected — once it is up, the reconnection loop is done.
			this.stopReconnectionTimer()
		}
		if (this.isConnected === connected) return
		this.isConnected = connected
		if (connected) {
			this.onConnected?.()
		} else {
			this.onDisconnected?.()
		}
	}

	private handleDirectPeerJoined(peerId: PeerId) {
		console.log(
			`[Client] Direct peer ${peerId} joined, ensuring no WebRTC exists.`,
		)
		if (this.connection) {
			console.log(
				`[Client] Closing redundant WebRTC connection to direct peer ${peerId}`,
			)
			this.connection.close()
			this.connection = null
			this.channel?.close()
			this.channel = null
		}

		this.setConnectionState(true)
	}

	private handlePeerLeft(peerId: PeerId) {
		console.log(`[Client] Peer ${peerId} left`)
		this.setConnectionState(false)
		// Drop the now-dead peer connection so the next offer builds a fresh one.
		this.resetConnection()
		this.startReconnectionTimer()
	}

	/**
	 * Tears down the current peer connection and data channel and clears any
	 * queued ICE candidates, detaching their event handlers first so a late
	 * state change from the old connection can no longer drive reconnection.
	 *
	 * Without this, a lost connection would linger in `this.connection`, and
	 * `initializeConnectionAndChannel` would reuse the dead connection when the
	 * next offer arrived — so the link never recovered until the page reloaded.
	 */
	private resetConnection() {
		const connection = this.connection
		const channel = this.channel
		this.connection = null
		this.channel = null
		this.candidatesQueue = []
		this.connectionAwaitedByReconnectTimer = null
		if (channel) {
			channel.onopen = null
			channel.onmessage = null
			channel.close()
		}
		if (connection) {
			connection.onicecandidate = null
			connection.oniceconnectionstatechange = null
			connection.onconnectionstatechange = null
			connection.ondatachannel = null
			connection.close()
		}
	}

	private startReconnectionTimer() {
		if (this.reconnectTimeout || this.isDestroyed) {
			return
		}
		const delayMs = getExponentialBackoffDelay(this.reconnectTimerAttempts++)
		console.log(`[Client] Starting reconnection timer in ${delayMs}ms...`)
		this.reconnectTimeout = setTimeout(async () => {
			this.reconnectTimeout = null
			if (this.isDestroyed || this.isConnected) {
				return
			}
			if (this.hasFreshNegotiationInFlight()) {
				// First tick that sees this negotiation — give it until the next
				// tick to open the data channel before declaring it stalled.
				this.connectionAwaitedByReconnectTimer = this.connection
				this.startReconnectionTimer()
				return
			}
			console.log('[Client] Attempting to re-join room for reconnection...')
			// Discard the dead or stalled connection so the fresh offer from the
			// host builds a brand-new peer connection instead of reusing this one.
			this.resetConnection()
			await this.ensureSignaling()
			this.webSocketSignaling?.announceRoom()
			this.startReconnectionTimer()
		}, delayMs)
	}

	/**
	 * A negotiation is fresh while an offer is being processed or while a not
	 * yet dead connection exists that no earlier timer tick has seen. A stalled
	 * negotiation (lost answer, lost ICE candidates) never reaches a dead ICE
	 * state — it sits in `new`/`checking` forever — so freshness, not ICE
	 * state, decides when the timer gives up on it and re-announces instead.
	 */
	private hasFreshNegotiationInFlight(): boolean {
		if (this.isHandlingOffer) {
			return true
		}
		if (!this.connection) {
			return false
		}
		if (
			this.connection.iceConnectionState === 'failed' ||
			this.connection.iceConnectionState === 'disconnected' ||
			this.connection.iceConnectionState === 'closed'
		) {
			return false
		}
		return this.connectionAwaitedByReconnectTimer !== this.connection
	}

	private stopReconnectionTimer() {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			this.reconnectTimeout = null
		}
		this.reconnectTimerAttempts = 0
		this.connectionAwaitedByReconnectTimer = null
	}

	private async handleOffer(
		offer: RTCSessionDescriptionInit,
		fromPeerId: PeerId,
	) {
		if (this.isHandlingOffer) {
			console.log(
				`[Client] Already handling an offer from ${fromPeerId}, skipping.`,
			)
			return
		}

		if (this.directTransport?.directPeers.has(fromPeerId)) {
			console.log(
				`[Client] Peer ${fromPeerId} is a direct peer, ignoring WebRTC offer.`,
			)
			return
		}

		this.isHandlingOffer = true
		try {
			console.log(`[Client] Handling offer from ${fromPeerId}`)
			this.hostPeerId = fromPeerId
			this.initializeConnectionAndChannel()
			if (!this.connection) {
				throw new Error('Connection is not initialized')
			}

			this.connection.oniceconnectionstatechange = () => {
				console.log(
					`[Client] ICE connection state: ${this.connection?.iceConnectionState}`,
				)
				if (
					this.connection?.iceConnectionState === 'failed' ||
					this.connection?.iceConnectionState === 'disconnected' ||
					this.connection?.iceConnectionState === 'closed'
				) {
					this.setConnectionState(false)
					this.startReconnectionTimer()
				} else if (
					this.connection?.iceConnectionState === 'connected' ||
					this.connection?.iceConnectionState === 'completed'
				) {
					// A transient ICE drop can recover on its own while the data
					// channel stayed open the whole time — report connected again.
					// A fresh negotiation stays "reconnecting" until the channel
					// opens (see `ondatachannel`), which also stops the timer.
					if (this.channel?.readyState === 'open') {
						this.setConnectionState(true)
					}
				}
			}

			await this.connection.setRemoteDescription(offer)
			await this.processCandidatesQueue()
			console.log('[Client] Creating answer')
			const answer = await this.connection.createAnswer()
			console.log(`[Client] Setting local description (${answer.type})`)
			await this.connection.setLocalDescription(answer)
			this.webSocketSignaling?.sendSignaling(answer.type!, answer, fromPeerId)
		} catch (error) {
			console.error('[Client] Failed to handle offer:', error)
			// A failed negotiation must not leave the client idle — drop the
			// broken connection and let the reconnection loop request a fresh
			// offer from the host.
			this.resetConnection()
			this.startReconnectionTimer()
		} finally {
			this.isHandlingOffer = false
		}
	}

	private async handleIceCandidate(candidate: RTCIceCandidateInit) {
		if (!this.connection) {
			return
		}
		if (this.connection.remoteDescription) {
			try {
				console.log('[Client] Adding received ICE candidate')
				await this.connection.addIceCandidate(candidate)
			} catch (error) {
				console.error('[Client] Error adding ice candidate:', error)
			}
		} else {
			console.log('[Client] Queuing ICE candidate (remote description not set)')
			this.candidatesQueue.push(candidate)
		}
	}

	private async processCandidatesQueue() {
		if (!this.connection) {
			return
		}
		while (this.candidatesQueue.length > 0) {
			const candidate = this.candidatesQueue.shift()!
			try {
				await this.connection.addIceCandidate(candidate)
			} catch (error) {
				console.error('[Client] Error adding queued ice candidate:', error)
			}
		}
	}

	private initializeConnectionAndChannel() {
		if (this.connection) {
			return
		}
		this.candidatesQueue = []
		// Resolved lazily: direct-only setups never need WebRTC at all.
		const RTCPeerConnection = resolveRTCPeerConnection(this.webrtc)
		this.connection = new RTCPeerConnection({ iceServers: this.iceServers })
		this.connection.onicecandidate = (event) => {
			if (event.candidate) {
				console.log('[Client] Generated new ICE candidate')
				this.webSocketSignaling?.sendSignaling(
					'ice-candidate',
					event.candidate.toJSON(),
				)
			}
		}
		this.connection.oniceconnectionstatechange = () => {
			console.log(
				`ICE connection state: ${this.connection?.iceConnectionState}`,
			)
		}
		this.connection.onconnectionstatechange = () => {
			console.log(`Connection state: ${this.connection?.connectionState}`)
		}

		this.connection.ondatachannel = (event) => {
			console.log('[Client] Data channel received')
			this.channel = event.channel
			this.channel.onopen = () => {
				console.log('[Client] Data channel opened')
				this.setConnectionState(true)
			}
			this.channel.onmessage = (event) => {
				console.log('[Client] Data channel message received')
				if (this.peerId) {
					this.onMessage?.(event.data, this.peerId)
				}
			}
		}
	}

	public send(value: string) {
		// Send to direct peers
		if (this.directTransport) {
			this.directTransport.sendMessage(value)
		}

		// Send to WebRTC peer
		if (this.channel?.readyState === 'open') {
			this.channel.send(value)
		}
	}

	public destroy() {
		this.isDestroyed = true
		this.stopReconnectionTimer()
		this.directTransport?.destroy()
		this.webSocketSignaling?.destroy()
		this.connection?.close()
		this.connection = null
		this.channel?.close()
		this.channel = null
	}
}
