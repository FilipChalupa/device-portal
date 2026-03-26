import { PeerId, generatePeerId } from '../constants'
import { delay } from '../delay'
import { settings } from '../settings'
import { getExponentialBackoffDelay } from '../utilities/backoff'
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

	private readonly onMessage:
		| ((value: string, peerId: PeerId) => void)
		| undefined
	private readonly onConnected: (() => void) | undefined
	private readonly webSocketSignalingServer: string | null
	private readonly iceServers: Array<RTCIceServer>
	private readonly browserDirect: BrowserDirectOption

	constructor(
		private readonly room: string,
		options: {
			onMessage?: (value: string, peerId: PeerId) => void
			onConnected?: () => void
			webSocketSignalingServer?: string | null
			iceServers?: Array<RTCIceServer>
			browserDirect?: BrowserDirectOption
			peerId?: PeerId
		} = {},
	) {
		this.onMessage = options.onMessage
		this.onConnected = options.onConnected
		this.webSocketSignalingServer =
			options.webSocketSignalingServer === null
				? null
				: (options.webSocketSignalingServer ??
					settings.default.webSocketSignalingServer)
		this.iceServers = options.iceServers ?? settings.default.iceServers
		this.browserDirect = options.browserDirect ?? true
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
				onPeerLeft: (peerId) => this.handlePeerLeft(peerId),
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
		if (
			!this.webSocketSignaling?.isConnected &&
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

		this.onConnected?.()
	}

	private handlePeerLeft(peerId: PeerId) {
		console.log(`[Client] Peer ${peerId} left`)
		this.startReconnectionTimer()
	}

	private startReconnectionTimer() {
		if (this.reconnectTimeout || this.isDestroyed) {
			return
		}
		const delayMs = getExponentialBackoffDelay(this.reconnectTimerAttempts++)
		console.log(`[Client] Starting reconnection timer in ${delayMs}ms...`)
		this.reconnectTimeout = setTimeout(async () => {
			this.reconnectTimeout = null
			if (this.isDestroyed) {
				return
			}
			if (
				!this.connection ||
				this.connection.iceConnectionState === 'failed' ||
				this.connection.iceConnectionState === 'disconnected' ||
				this.connection.iceConnectionState === 'closed'
			) {
				console.log('[Client] Attempting to re-join room for reconnection...')
				await this.ensureSignaling()
				this.webSocketSignaling?.announceRoom()
				this.startReconnectionTimer()
			}
		}, delayMs)
	}

	private stopReconnectionTimer() {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			this.reconnectTimeout = null
		}
		this.reconnectTimerAttempts = 0
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
			this.stopReconnectionTimer()
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
					this.startReconnectionTimer()
				} else if (
					this.connection?.iceConnectionState === 'connected' ||
					this.connection?.iceConnectionState === 'completed'
				) {
					this.stopReconnectionTimer()
				}
			}

			await this.connection.setRemoteDescription(offer)
			await this.processCandidatesQueue()
			console.log('[Client] Creating answer')
			const answer = await this.connection.createAnswer()
			console.log(`[Client] Setting local description (${answer.type})`)
			await this.connection.setLocalDescription(answer)
			this.webSocketSignaling?.sendSignaling(answer.type!, answer, fromPeerId)
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
				await this.connection.addIceCandidate(new RTCIceCandidate(candidate))
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
				await this.connection.addIceCandidate(new RTCIceCandidate(candidate))
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
				this.onConnected?.()
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
