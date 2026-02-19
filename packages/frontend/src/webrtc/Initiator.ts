import { Peer } from './Peer'
import { settings } from '../settings'

type ClientConnection = {
	connection: RTCPeerConnection
	channel: RTCDataChannel
	candidatesQueue: RTCIceCandidateInit[]
}

export class Initiator extends Peer {
	protected role = 'initiator' as const
	protected connections = new Map<string, ClientConnection>()
	protected waitingPeers = new Set<string>()
	protected readonly maxClients: number

	constructor(
		room: string,
		options: {
			onValue?: (value: string) => void
			sendLastValueOnConnectAndReconnect?: boolean
			websocketSignalingServer?: string
			iceServers?: Array<RTCIceServer>
			maxClients?: number
		} = {},
	) {
		super(room, options)
		this.maxClients = options.maxClients ?? 1
	}

	protected onConnected(): void {
		console.log('[Initiator] Connected to signaling server')
	}

	protected async handlePeerJoined(peerId: string) {
		console.log(`[Initiator] Peer ${peerId} joined`)
		if (this.connections.size >= this.maxClients) {
			console.log(`[Initiator] Max clients reached, adding ${peerId} to waiting list`)
			this.waitingPeers.add(peerId)
			return
		}
		await this.createAndSendOffer(peerId)
	}

	protected handlePeerLeft(peerId: string) {
		console.log(`[Initiator] Peer ${peerId} left`)
		this.waitingPeers.delete(peerId)
		const client = this.connections.get(peerId)
		if (client) {
			client.channel.close()
			client.connection.close()
			this.connections.delete(peerId)
			this.processWaitingPeers()
		}
	}

	protected async processWaitingPeers() {
		if (this.connections.size >= this.maxClients || this.waitingPeers.size === 0) {
			return
		}

		const nextPeerId = this.waitingPeers.values().next().value
		if (nextPeerId) {
			console.log(`[Initiator] Slot available, connecting waiting peer: ${nextPeerId}`)
			this.waitingPeers.delete(nextPeerId)
			await this.createAndSendOffer(nextPeerId)
		}
	}

	protected async createAndSendOffer(toPeerId: string) {
		console.log(`[Initiator] Creating offer for ${toPeerId}...`)

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
				this.processWaitingPeers()
			}
		}

		channel.onopen = () => {
			console.log(`[Initiator] Data channel opened for ${toPeerId}`)
			if (this.value && this.sendLastValueOnConnectAndReconnect) {
				channel.send(this.value.value)
			}
		}

		channel.onmessage = (event) => {
			console.log(`[Initiator] Message from ${toPeerId}: ${event.data}`)
			this.onValue?.(event.data)
		}

		const offer = await connection.createOffer()
		await connection.setLocalDescription(offer)
		this.sendMessage('offer', offer, toPeerId)
	}

	protected handleOffer(
		offer: RTCSessionDescriptionInit,
		fromPeerId: string,
	): void {
		// Initiator does not handle offers
	}

	protected async handleAnswer(
		answer: RTCSessionDescriptionInit,
		fromPeerId: string,
	) {
		const client = this.connections.get(fromPeerId)
		if (client) {
			console.log(`[Initiator] Handling answer from ${fromPeerId}`)
			await client.connection.setRemoteDescription(answer)
			// Process queued candidates
			while (client.candidatesQueue.length > 0) {
				const candidate = client.candidatesQueue.shift()!
				await client.connection.addIceCandidate(new RTCIceCandidate(candidate))
			}
		}
	}

	protected async handleIceCandidate(
		candidate: RTCIceCandidateInit,
		fromPeerId: string,
	) {
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
		for (const client of this.connections.values()) {
			if (client.channel.readyState === 'open') {
				client.channel.send(value)
			}
		}
	}

	public destroy() {
		super.destroy()
		for (const client of this.connections.values()) {
			client.channel.close()
			client.connection.close()
		}
		this.connections.clear()
	}
}
