import { Peer } from './Peer'
import { settings } from '../settings'
import { PeerId } from './PeerId'

type ClientConnection = {
	connection: RTCPeerConnection
	channel: RTCDataChannel
	candidatesQueue: RTCIceCandidateInit[]
}

export class Initiator extends Peer {
	protected role = 'initiator' as const
	protected connections = new Map<PeerId, ClientConnection>()
	protected waitingPeers = new Set<PeerId>()
	protected readonly maxClients: number
	protected peerListeners = new Map<PeerId, Set<(value: string) => void>>()
	protected onPeersChange: ((peers: PeerId[]) => void) | undefined
	protected override readonly onValue:
		| ((value: string, peerId: PeerId) => void)
		| undefined

	constructor(
		room: string,
		options: {
			onValue?: (value: string, peerId: PeerId) => void
			onPeersChange?: (peers: PeerId[]) => void
			sendLastValueOnConnectAndReconnect?: boolean
			websocketSignalingServer?: string
			iceServers?: Array<RTCIceServer>
			maxClients?: number
		} = {},
	) {
		super(room, options)
		this.onValue = options.onValue
		this.onPeersChange = options.onPeersChange
		this.maxClients = options.maxClients ?? 1
	}

	public get peers(): PeerId[] {
		return Array.from(this.connections.keys())
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

	protected onConnected(): void {
		console.log('[Initiator] Connected to signaling server')
	}

	protected async handlePeerJoined(peerId: PeerId) {
		console.log(`[Initiator] Peer ${peerId} joined`)
		if (this.connections.size >= this.maxClients) {
			console.log(
				`[Initiator] Max clients reached, adding ${peerId} to waiting list`,
			)
			this.waitingPeers.add(peerId)
			return
		}
		await this.createAndSendOffer(peerId)
		this.onPeersChange?.(this.peers)
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
			console.log(
				`[Initiator] Slot available, connecting waiting peer: ${nextPeerId}`,
			)
			this.waitingPeers.delete(nextPeerId)
			await this.createAndSendOffer(nextPeerId)
			this.onPeersChange?.(this.peers)
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
		}

		channel.onmessage = (event) => {
			console.log(`[Initiator] Message from ${toPeerId}: ${event.data}`)
			this.onValue?.(event.data, toPeerId)
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
		for (const client of this.connections.values()) {
			if (client.channel.readyState === 'open') {
				client.channel.send(value)
			}
		}
	}

	public sendToPeer(peerId: PeerId, value: string) {
		const client = this.connections.get(peerId)
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
