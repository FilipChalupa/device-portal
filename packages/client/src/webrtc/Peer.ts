import { delay } from '../delay'
import { settings } from '../settings'
import { PeerId } from './PeerId'

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
	protected readonly websocketSignalingServer: string
	protected readonly iceServers: Array<RTCIceServer>
	protected readonly localDeviceOnly: boolean
	protected socket: WebSocket | null = null
	protected broadcastChannel: BroadcastChannel | null = null
	protected candidatesQueue: RTCIceCandidateInit[] = []
	protected peerId: PeerId | null = null
	private seenMessageIds = new Set<string>()

	constructor(
		protected readonly room: string,
		options: {
			websocketSignalingServer?: string
			onMessage?: (value: string, peerId: PeerId) => void
			sendLastValueOnConnectAndReconnect?: boolean
			iceServers?: Array<RTCIceServer>
			localDeviceOnly?: boolean
		} = {},
	) {
		this.onMessage = options.onMessage
		this.sendLastValueOnConnectAndReconnect =
			options.sendLastValueOnConnectAndReconnect ?? true
		this.websocketSignalingServer = `${(
			options.websocketSignalingServer ??
			settings.defaultWebsocketSignalingServer
		).replace(/\/+$/, '')}/v0/`
		this.iceServers = options.iceServers ?? settings.iceServers
		this.localDeviceOnly = options.localDeviceOnly ?? false
		this.run()
	}

	protected async run() {
		try {
			if ('window' in globalThis) {
				this.broadcastChannel = new BroadcastChannel(
					`device-portal-room-${this.room}`,
				)
				this.broadcastChannel.onmessage = (event) => {
					this.handleSignalingMessage(event.data)
				}
			}

			if (this.localDeviceOnly) {
				this.peerId = this.generatePeerId()
				this.initializeConnectionAndChannel()
				this.onConnected()
				this.sendLocalDiscovery()
			} else {
				await this.connect()
				if (this.peerId) {
					this.sendLocalDiscovery()
				}
			}
		} catch (error) {
			queueMicrotask(() => {
				throw error
			})
		}
	}

	protected connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.isDestroyed) {
				return reject(new Error('Peer is destroyed'))
			}

			this.socket = new WebSocket(this.websocketSignalingServer)

			this.socket.onopen = () => {
				console.log(`[Peer] WebSocket opened for room: ${this.room}`)
				this.socket?.send(
					JSON.stringify({ type: 'join-room', room: this.room }),
				)
				this.initializeConnectionAndChannel()
				this.onConnected()
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
			if (this.seenMessageIds.size > 100) {
				const firstValue = this.seenMessageIds.values().next().value
				if (firstValue) {
					this.seenMessageIds.delete(firstValue)
				}
			}
		}

		console.log(`[Peer] Received signaling message: ${message.type}`)
		switch (message.type) {
			case 'identity':
				if (!this.peerId || this.peerId.startsWith('temp-')) {
					this.peerId = message.data.peerId
					console.log(`[Peer] My peer ID is: ${this.peerId}`)
					this.sendLocalDiscovery()
				}
				break
			case 'peer-joined':
			case 'local-discovery':
				if (message.data?.peerId && message.data.peerId !== this.peerId) {
					this.handlePeerJoined(message.data.peerId)
					if (message.type === 'local-discovery' && !message.data.to) {
						// Respond to discovery if it wasn't directed specifically to us
						this.sendLocalDiscovery(message.data.peerId)
					}
				}
				break
			case 'peer-left':
				if (message.data?.peerId) {
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

	protected sendLocalDiscovery(to?: PeerId) {
		if (this.peerId) {
			this.sendMessage('local-discovery', { peerId: this.peerId, to }, to)
		}
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
		if (this.candidatesQueue.length > 0) {
			console.log(
				`[Peer] Processing ${this.candidatesQueue.length} queued ICE candidates`,
			)
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
	}

	public destroy() {
		this.isDestroyed = true
		this.close()
	}

	protected sendMessage(type: string, data: any, to?: PeerId) {
		if (!this.peerId) {
			this.peerId = `temp-${this.generatePeerId()}` as PeerId
		}
		const id = crypto.randomUUID()
		const message = { id, type, room: this.room, data, to, from: this.peerId }
		if (this.socket?.readyState === WebSocket.OPEN) {
			console.log(
				`[Peer] Sending signaling message: ${type}${to ? ` to ${to}` : ''}`,
			)
			this.socket.send(JSON.stringify(message))
		}
		if (this.broadcastChannel) {
			this.broadcastChannel.postMessage(message)
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
