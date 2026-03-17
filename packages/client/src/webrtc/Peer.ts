import { delay } from '../delay'
import { settings } from '../settings'
import { PeerId } from './PeerId'

export type BrowserDirectOption = false | 'same-window-only' | true

const sameTabBus = new EventTarget()

export abstract class Peer {
	protected isDestroyed = false
	protected connection: RTCPeerConnection | null = null
	protected channel: RTCDataChannel | null = null
	protected abstract role: 'initiator' | 'responder'
	protected value: { value: string } | null = null
	protected readonly onMessage:
		| ((value: string, peerId: PeerId) => void)
		| undefined
	protected readonly sendLastValueOnConnectAndReconnect: boolean
	protected readonly webSocketSignalingServer: string | null
	protected readonly iceServers: Array<RTCIceServer>
	protected readonly browserDirect: BrowserDirectOption
	protected socket: WebSocket | null = null
	protected broadcastChannel: BroadcastChannel | null = null
	protected candidatesQueue: RTCIceCandidateInit[] = []
	protected peerId: PeerId | null = null
	private seenMessageIds = new Set<string>()
	protected directPeers = new Set<PeerId>()

	constructor(
		protected readonly room: string,
		options: {
			webSocketSignalingServer?: string | null
			onMessage?: (value: string, peerId: PeerId) => void
			sendLastValueOnConnectAndReconnect?: boolean
			iceServers?: Array<RTCIceServer>
			browserDirect?: BrowserDirectOption
		} = {},
	) {
		this.onMessage = options.onMessage
		this.sendLastValueOnConnectAndReconnect =
			options.sendLastValueOnConnectAndReconnect ?? true
		this.webSocketSignalingServer =
			options.webSocketSignalingServer === null
				? null
				: (options.webSocketSignalingServer ??
					settings.defaultWebsocketSignalingServer)
		this.iceServers = options.iceServers ?? settings.iceServers
		this.browserDirect = options.browserDirect ?? true
		this.run()
	}

	protected async run() {
		try {
			this.peerId = this.generatePeerId()

			if (this.browserDirect !== false) {
				if (this.browserDirect === true && 'window' in globalThis) {
					this.broadcastChannel = new BroadcastChannel(
						`device-portal-room-${this.room}`,
					)
					this.broadcastChannel.onmessage = (event) => {
						this.handleSignalingMessage(event.data)
					}
				}

				sameTabBus.addEventListener(
					`message:${this.room}`,
					this.handleSameTabMessage as any,
				)
			}

			if (this.webSocketSignalingServer) {
				await this.connect()
			}

			this.announce()
		} catch (error) {
			queueMicrotask(() => {
				throw error
			})
		}
	}

	protected announce() {
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify({ type: 'join-room', room: this.room }))
		}
		if (this.browserDirect !== false) {
			this.sendDirectSignaling({
				type: 'direct-discovery',
				from: this.peerId,
			})
		}
	}

	private handleSameTabMessage = (event: CustomEvent<any>) => {
		this.handleSignalingMessage(event.detail)
	}

	protected connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.isDestroyed || !this.webSocketSignalingServer) {
				return reject(new Error('Peer is destroyed or no server provided'))
			}

			const url = `${this.webSocketSignalingServer.replace(/\/+$/, '')}/v0/`
			this.socket = new WebSocket(url)

			this.socket.onopen = () => {
				console.log(`[Peer] WebSocket opened for room: ${this.room}`)
				this.socket?.send(
					JSON.stringify({ type: 'join-room', room: this.room }),
				)
				resolve()
			}

			this.socket.onmessage = (event) => {
				const message = JSON.parse(event.data)
				this.handleSignalingMessage(message)
			}

			this.socket.onclose = async () => {
				console.log('[Peer] WebSocket closed')
				this.socket = null
				if (!this.isDestroyed) {
					console.log('[Peer] Attempting reconnect in 1s...')
					await delay(1000)
					await this.run() // Reconnect
				}
			}

			this.socket.onerror = (error) => {
				console.error('WebSocket error:', error)
				reject(error)
			}
		})
	}

	protected handleSignalingMessage(message: any) {
		if (message.id && this.seenMessageIds.has(message.id)) {
			return
		}
		if (message.id) {
			this.seenMessageIds.add(message.id)
			if (this.seenMessageIds.size > 1000) {
				const firstValue = this.seenMessageIds.values().next().value
				if (firstValue) {
					this.seenMessageIds.delete(firstValue)
				}
			}
		}

		if (message.from === this.peerId) {
			return
		}

		console.log(`[Peer] Received signaling message: ${message.type}`)
		switch (message.type) {
			case 'identity':
				if (!this.peerId || this.peerId.startsWith('temp-')) {
					this.peerId = message.data.peerId
					console.log(`[Peer] My peer ID is: ${this.peerId}`)
					this.announce()
				}
				break
			case 'peer-joined':
				if (message.data?.peerId) {
					this.handlePeerJoined(message.data.peerId)
				}
				break
			case 'direct-discovery':
				if (message.from) {
					this.directPeers.add(message.from)
					this.handlePeerJoined(message.from)
					// Respond if it was a broadcast
					if (!message.to) {
						this.sendDirectSignaling({
							type: 'direct-discovery',
							from: this.peerId!,
							to: message.from,
						})
					}
				}
				break
			case 'direct-message':
				if (message.to === this.peerId) {
					this.onMessage?.(message.data, message.from)
				}
				break
			case 'peer-left':
				if (message.data?.peerId) {
					this.directPeers.delete(message.data.peerId)
					this.handlePeerLeft(message.data.peerId)
				}
				break
			case 'offer':
				if (!message.to || message.to === this.peerId) {
					this.handleOffer(message.data, message.from)
				}
				break
			case 'answer':
				if (!message.to || message.to === this.peerId) {
					this.handleAnswer(message.data, message.from)
				}
				break
			case 'ice-candidate':
				if (!message.to || message.to === this.peerId) {
					this.handleIceCandidate(message.data, message.from)
				}
				break
		}
	}

	protected generatePeerId(): PeerId {
		if (typeof crypto !== 'undefined' && crypto.randomUUID) {
			return crypto.randomUUID() as PeerId
		}
		return Math.random().toString(36).substring(2, 15) as PeerId
	}

	protected abstract handleOffer(
		offer: RTCSessionDescriptionInit,
		fromPeerId: PeerId,
	): void
	protected abstract handleAnswer(
		answer: RTCSessionDescriptionInit,
		fromPeerId: PeerId,
	): void
	protected abstract handlePeerJoined(peerId: PeerId): void
	protected abstract handlePeerLeft(peerId: PeerId): void
	protected abstract onConnected(): void

	protected async handleIceCandidate(
		candidate: RTCIceCandidateInit,
		fromPeerId?: PeerId,
	) {
		if (!this.connection) {
			return
		}
		if (this.connection.remoteDescription) {
			try {
				console.log('[Peer] Adding received ICE candidate')
				await this.connection.addIceCandidate(new RTCIceCandidate(candidate))
			} catch (error) {
				console.error('[Peer] Error adding ice candidate:', error)
			}
		} else {
			console.log('[Peer] Queuing ICE candidate (remote description not set)')
			this.candidatesQueue.push(candidate)
		}
	}

	protected async processCandidatesQueue() {
		if (!this.connection) {
			return
		}
		while (this.candidatesQueue.length > 0) {
			const candidate = this.candidatesQueue.shift()!
			try {
				await this.connection.addIceCandidate(new RTCIceCandidate(candidate))
			} catch (error) {
				console.error('[Peer] Error adding queued ice candidate:', error)
			}
		}
	}

	protected close() {
		this.connection?.close()
		this.connection = null
		this.channel?.close()
		this.channel = null
		if (this.socket) {
			const socket = this.socket
			if (socket.readyState === WebSocket.CONNECTING) {
				socket.onopen = () => socket.close()
			} else {
				socket.close()
			}
			this.socket = null
		}
		if (this.broadcastChannel) {
			this.broadcastChannel.close()
			this.broadcastChannel = null
		}
		sameTabBus.removeEventListener(
			`message:${this.room}`,
			this.handleSameTabMessage as any,
		)
	}

	public destroy() {
		this.isDestroyed = true
		this.close()
	}

	protected sendDirectSignaling(message: any) {
		if (!message.id) {
			message.id = crypto.randomUUID()
		}
		message.room = this.room
		if (this.seenMessageIds.has(message.id)) return
		this.seenMessageIds.add(message.id)

		if (this.broadcastChannel) {
			this.broadcastChannel.postMessage(message)
		}
		sameTabBus.dispatchEvent(
			new CustomEvent(`message:${this.room}`, {
				detail: message,
			}),
		)
	}

	protected sendMessage(type: string, data: any, to?: PeerId) {
		if (!this.peerId) {
			this.peerId = `temp-${this.generatePeerId()}` as PeerId
		}

		// If it's a direct peer, we don't send signaling for negotiation
		// because we bypass WebRTC. But wait, sendMessage is used for signaling.
		// If we are already connected via direct, we shouldn't even be here for WebRTC.

		const id = crypto.randomUUID()
		const message = { id, type, room: this.room, data, to, from: this.peerId }
		if (this.socket?.readyState === WebSocket.OPEN) {
			console.log(
				`[Peer] Sending signaling message: ${type}${to ? ` to ${to}` : ''}`,
			)
			this.socket.send(JSON.stringify(message))
		}
	}

	protected async setAndShareLocalDescription(
		description: RTCSessionDescriptionInit,
		toPeerId?: PeerId,
	) {
		if (!this.connection) {
			throw new Error('Connection is not initialized')
		}
		console.log(`[Peer] Setting local description (${description.type})`)
		await this.connection.setLocalDescription(description)
		this.sendMessage(description.type, description, toPeerId)
	}

	protected shareNewIceCandidate(
		event: RTCPeerConnectionIceEvent,
		toPeerId?: PeerId,
	) {
		if (event.candidate) {
			console.log('[Peer] Generated new ICE candidate')
			this.sendMessage('ice-candidate', event.candidate.toJSON(), toPeerId)
		}
	}

	public send(value: string) {
		// Send to direct peers
		if (this.browserDirect !== false) {
			this.sendDirectSignaling({
				type: 'direct-message',
				from: this.peerId,
				data: value,
				// Currently broadcasting to ALL direct peers in the room
				// In a more advanced impl, we might want to target specific peers
				to: null, // Broadcast on direct channel
			})
		}

		// Send to WebRTC peers
		if (this.channel?.readyState === 'open') {
			this.channel.send(value)
		}
		this.value = { value }
	}

	protected initializeConnectionAndChannel() {
		if (this.connection) {
			return
		}
		this.candidatesQueue = []
		this.connection = new RTCPeerConnection({ iceServers: this.iceServers })
		this.connection.onicecandidate = this.shareNewIceCandidate.bind(this)
		this.connection.oniceconnectionstatechange = () => {
			console.log(
				`ICE connection state: ${this.connection?.iceConnectionState}`,
			)
		}
		this.connection.onconnectionstatechange = () => {
			console.log(`Connection state: ${this.connection?.connectionState}`)
		}

		if (this.role === 'initiator') {
			console.log('[Peer] Creating data channel')
			this.channel = this.connection.createDataChannel(settings.channel.label)
			this.channel.onopen = () => {
				console.log('[Peer] Data channel opened')
				if (this.value && this.sendLastValueOnConnectAndReconnect) {
					this.channel?.send(this.value.value)
				}
			}
			this.channel.onmessage = (event) => {
				console.log('[Peer] Data channel message received')
				if (this.peerId) {
					this.onMessage?.(event.data, this.peerId)
				}
			}
		} else {
			this.connection.ondatachannel = (event) => {
				console.log('[Peer] Data channel received (responder)')
				this.channel = event.channel
				this.channel.onopen = () => {
					console.log('[Peer] Data channel opened')
					if (this.value && this.sendLastValueOnConnectAndReconnect) {
						this.channel?.send(this.value.value)
					}
				}
				this.channel.onmessage = (event) => {
					console.log('[Peer] Data channel message received')
					if (this.peerId) {
						this.onMessage?.(event.data, this.peerId)
					}
				}
			}
		}
	}
}
