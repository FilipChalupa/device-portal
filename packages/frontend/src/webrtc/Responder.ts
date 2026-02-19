import { Peer } from './Peer'

export class Responder extends Peer {
	protected role = 'responder' as const

	protected onConnected(): void {
		// Responder waits for an offer
	}

	protected handlePeerJoined() {
		// Responder does not need to do anything when a peer joins, it waits for an offer
	}

	protected async handleOffer(offer: RTCSessionDescriptionInit) {
		if (!this.connection) {
			this.initializeConnectionAndChannel()
		}
		if (!this.connection) {
			throw new Error('Connection is not initialized')
		}
		console.log('[Responder] Handling offer')
		await this.connection.setRemoteDescription(offer)
		await this.processCandidatesQueue()
		console.log('[Responder] Creating answer')
		const answer = await this.connection.createAnswer()
		await this.setAndShareLocalDescription(answer)
	}

	protected handleAnswer(answer: RTCSessionDescriptionInit): void {
		// Responder does not handle answers
	}
}
