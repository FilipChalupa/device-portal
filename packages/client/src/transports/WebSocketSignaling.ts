import { PeerId, SignalingMessage, SignalingMessageSchema } from '../constants'
import { delay } from '../delay'
import { getExponentialBackoffDelay } from '../utilities/backoff'

export type WebSocketSignalingCallbacks = {
	onIdentity: (peerId: PeerId) => void
	onPeerJoined: (peerId: PeerId) => void
	onPeerLeft: (peerId: PeerId) => void
	onOffer: (offer: RTCSessionDescriptionInit, from: PeerId) => void
	onAnswer: (answer: RTCSessionDescriptionInit, from: PeerId) => void
	onIceCandidate: (candidate: RTCIceCandidateInit, from: PeerId) => void
}

export class WebSocketSignaling {
	private socket: WebSocket | null = null
	private seenMessageIds = new Set<string>()
	private reconnectAttempts = 0
	private isDestroyed = false

	constructor(
		private readonly room: string,
		private readonly serverUrl: string,
		private peerId: PeerId,
		private readonly callbacks: WebSocketSignalingCallbacks,
	) {}

	get isConnected() {
		return this.socket?.readyState === WebSocket.OPEN
	}

	updatePeerId(peerId: PeerId) {
		this.peerId = peerId
	}

	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.isDestroyed) {
				return reject(new Error('WebSocketSignaling is destroyed'))
			}

			const url = `${this.serverUrl.replace(/\/+$/, '')}/v0/`
			this.socket = new WebSocket(url)

			this.socket.onopen = () => {
				console.log(`[WebSocketSignaling] Connected for room: ${this.room}`)
				this.reconnectAttempts = 0
				this.announceRoom()
				resolve()
			}

			this.socket.onmessage = (event) => {
				const message = JSON.parse(event.data)
				this.handleMessage(message)
			}

			this.socket.onclose = async () => {
				console.log('[WebSocketSignaling] Disconnected')
				this.socket = null
				if (!this.isDestroyed) {
					const reconnectDelay = getExponentialBackoffDelay(
						this.reconnectAttempts++,
					)
					console.log(
						`[WebSocketSignaling] Reconnecting in ${reconnectDelay}ms...`,
					)
					await delay(reconnectDelay)
					if (!this.isDestroyed) {
						try {
							await this.connect()
						} catch {
							// Reconnection will be retried on next close
						}
					}
				}
			}

			this.socket.onerror = (error) => {
				console.error('[WebSocketSignaling] Error:', error)
				reject(error)
			}
		})
	}

	announceRoom() {
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify({ type: 'join-room', room: this.room }))
		}
	}

	sendSignaling(type: string, data: unknown, to?: PeerId) {
		const id = crypto.randomUUID()
		const message = {
			id,
			type,
			room: this.room,
			data,
			to,
			from: this.peerId,
		}
		if (this.socket?.readyState === WebSocket.OPEN) {
			console.log(
				`[WebSocketSignaling] Sending: ${type}${to ? ` to ${to}` : ''}`,
			)
			this.socket.send(JSON.stringify(message))
		}
	}

	private handleMessage(data: unknown) {
		const result = SignalingMessageSchema.safeParse(data)
		if (!result.success) {
			console.error(
				'[WebSocketSignaling] Invalid message:',
				result.error,
			)
			return
		}

		const message: SignalingMessage = result.data

		if (message.id && this.seenMessageIds.has(message.id)) {
			return
		}
		if (message.id) {
			this.seenMessageIds.add(message.id)
			if (this.seenMessageIds.size > 1000) {
				const idsToKeep = [...this.seenMessageIds].slice(-500)
				this.seenMessageIds = new Set(idsToKeep)
			}
		}

		if ('from' in message && message.from === this.peerId) {
			return
		}

		switch (message.type) {
			case 'identity':
				this.callbacks.onIdentity(message.data.peerId)
				break
			case 'peer-joined':
				this.callbacks.onPeerJoined(message.data.peerId)
				break
			case 'peer-left':
				this.callbacks.onPeerLeft(message.data.peerId)
				break
			case 'offer':
				if (!message.to || message.to === this.peerId) {
					this.callbacks.onOffer(message.data, message.from)
				}
				break
			case 'answer':
				if (!message.to || message.to === this.peerId) {
					this.callbacks.onAnswer(message.data, message.from)
				}
				break
			case 'ice-candidate':
				if (!message.to || message.to === this.peerId) {
					this.callbacks.onIceCandidate(message.data, message.from)
				}
				break
		}
	}

	destroy() {
		this.isDestroyed = true
		if (this.socket) {
			const socket = this.socket
			if (socket.readyState === WebSocket.CONNECTING) {
				socket.onopen = () => socket.close()
			} else {
				socket.close()
			}
			this.socket = null
		}
	}
}
