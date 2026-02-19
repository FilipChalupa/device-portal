import { Peer } from './Peer'

export class Initiator extends Peer {
	protected role = 'initiator' as const

	protected onConnected(): void {
		console.log('[Initiator] Connected to signaling server, creating offer')
		this.createAndSendOffer()
	}

	protected async handlePeerJoined() {
		console.log('[Initiator] Peer joined, recreating offer')
		await this.createAndSendOffer()
	}

	protected async createAndSendOffer() {
		if (!this.connection) {
			this.initializeConnectionAndChannel()
		}
		if (!this.connection) {
			throw new Error('Connection is not initialized')
		}
		console.log('[Initiator] Creating offer...')
		const offer = await this.connection.createOffer()
		await this.setAndShareLocalDescription(offer)
	}

	protected handleOffer(offer: RTCSessionDescriptionInit): void {
		// Initiator does not handle offers
	}

	protected async handleAnswer(answer: RTCSessionDescriptionInit) {
		if (this.connection) {
			console.log('[Initiator] Handling answer')
			await this.connection.setRemoteDescription(answer)
			await this.processCandidatesQueue()
		}
	}
}
