import { delay } from '../delay'
import { settings } from '../settings'

export abstract class Peer {
	protected isDestroyed = false
	protected connection: RTCPeerConnection | null = null
	protected channel: RTCDataChannel | null = null
	protected abstract role: 'initiator' | 'responder'
	protected value: { value: string } | null = null
	protected readonly onValue: ((value: string) => void) | undefined
	protected readonly sendLastValueOnConnectAndReconnect: boolean
	protected readonly websocketSignalingServer: string
	protected readonly iceServers: Array<RTCIceServer>
	protected socket: WebSocket | null = null
	protected candidatesQueue: RTCIceCandidateInit[] = []

	constructor(
		protected readonly room: string,
		options: {
			onValue?: (value: string) => void
			sendLastValueOnConnectAndReconnect?: boolean
			websocketSignalingServer?: string
			iceServers?: Array<RTCIceServer>
		} = {},
	) {
		this.onValue = options.onValue
		this.sendLastValueOnConnectAndReconnect =
			options.sendLastValueOnConnectAndReconnect ?? true
		this.websocketSignalingServer =
			options.websocketSignalingServer ?? 'ws://localhost:8080'
		this.iceServers = options.iceServers ?? settings.iceServers
		this.run()
	}

	protected async run() {
		try {
			await this.connect()
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
				console.log(`[Peer] Received signaling message: ${message.type}`)
				switch (message.type) {
					case 'peer-joined':
						this.handlePeerJoined()
						break
					case 'offer':
						this.handleOffer(message.data)
						break
					case 'answer':
						this.handleAnswer(message.data)
						break
					case 'ice-candidate':
						this.handleIceCandidate(message.data)
						break
				}
			}

			this.socket.onclose = async () => {
				console.log('[Peer] WebSocket closed')
				this.close()
				if (!this.isDestroyed) {
					console.log('[Peer] Attempting reconnect in 1s...')
					await delay(1000)
					await this.run() // Reconnect
				}
			}

			this.socket.onerror = (error) => {
				console.error('WebSocket error:', error)
				this.close()
				reject(error)
			}
		})
	}

	protected abstract handleOffer(offer: RTCSessionDescriptionInit): void
	protected abstract handleAnswer(answer: RTCSessionDescriptionInit): void
	protected abstract handlePeerJoined(): void
	protected abstract onConnected(): void

	protected async handleIceCandidate(candidate: RTCIceCandidateInit) {
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
			console.log(`[Peer] Processing ${this.candidatesQueue.length} queued ICE candidates`)
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
		this.socket?.close()
		this.socket = null
	}

	public destroy() {
		this.isDestroyed = true
		this.close()
	}

	protected sendMessage(type: string, data: any) {
		if (this.socket?.readyState === WebSocket.OPEN) {
			console.log(`[Peer] Sending signaling message: ${type}`)
			this.socket.send(JSON.stringify({ type, room: this.room, data }))
		} else {
			console.warn(`[Peer] Cannot send message ${type}, WebSocket not open`)
		}
	}

	protected async setAndShareLocalDescription(
		description: RTCSessionDescriptionInit,
	) {
		if (!this.connection) {
			throw new Error('Connection is not initialized')
		}
		console.log(`[Peer] Setting local description (${description.type})`)
		await this.connection.setLocalDescription(description)
		this.sendMessage(description.type, description)
	}

	protected shareNewIceCandidate(event: RTCPeerConnectionIceEvent) {
		if (event.candidate) {
			console.log('[Peer] Generated new ICE candidate')
			this.sendMessage('ice-candidate', event.candidate.toJSON())
		}
	}

	public send(value: string) {
		if (this.channel?.readyState === 'open') {
			this.channel.send(value)
		}
		this.value = { value }
	}

	protected initializeConnectionAndChannel() {
		this.connection?.close()
		this.candidatesQueue = []
		this.connection = new RTCPeerConnection({ iceServers: this.iceServers })
		this.connection.onicecandidate = this.shareNewIceCandidate.bind(this)
		this.connection.oniceconnectionstatechange = () => {
			console.log(`ICE connection state: ${this.connection?.iceConnectionState}`)
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
				this.onValue?.(event.data)
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
					this.onValue?.(event.data)
				}
			}
		}
	}
}
