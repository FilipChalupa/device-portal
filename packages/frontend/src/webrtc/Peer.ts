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
				this.socket?.send(
					JSON.stringify({ type: 'join-room', room: this.room }),
				)
				this.initializeConnectionAndChannel()
				resolve()
			}

			this.socket.onmessage = (event) => {
				const message = JSON.parse(event.data)
				switch (message.type) {
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
				this.close()
				if (!this.isDestroyed) {
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

	protected async handleIceCandidate(candidate: RTCIceCandidateInit) {
		if (this.connection) {
			await this.connection.addIceCandidate(new RTCIceCandidate(candidate))
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
			this.socket.send(JSON.stringify({ type, room: this.room, data }))
		}
	}

	protected async setAndShareLocalDescription(
		description: RTCSessionDescriptionInit,
	) {
		if (!this.connection) {
			throw new Error('Connection is not initialized')
		}
		await this.connection.setLocalDescription(description)
		this.sendMessage(description.type, description)
	}

	protected shareNewIceCandidate(event: RTCPeerConnectionIceEvent) {
		if (event.candidate) {
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
		this.connection = new RTCPeerConnection({ iceServers: this.iceServers })
		this.connection.onicecandidate = this.shareNewIceCandidate.bind(this)

		if (this.role === 'initiator') {
			this.channel = this.connection.createDataChannel(settings.channel.label, {
				negotiated: true,
				id: settings.channel.id,
			})
			this.channel.onopen = () => {
				if (this.value && this.sendLastValueOnConnectAndReconnect) {
					this.channel?.send(this.value.value)
				}
			}
			this.channel.onmessage = (event) => {
				this.onValue?.(event.data)
			}
		} else {
			this.connection.ondatachannel = (event) => {
				this.channel = event.channel
				this.channel.onopen = () => {
					if (this.value && this.sendLastValueOnConnectAndReconnect) {
						this.channel?.send(this.value.value)
					}
				}
				this.channel.onmessage = (event) => {
					this.onValue?.(event.data)
				}
			}
		}
	}
}
