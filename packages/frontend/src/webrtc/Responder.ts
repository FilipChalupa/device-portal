import { Peer } from './Peer'

export class Responder extends Peer {
	protected role = 'responder' as const

	protected onConnected(): void {
		// Responder waits for an offer
	}

	protected handlePeerJoined(peerId: string) {
		// Responder does not need to do anything when a peer joins, it waits for an offer
	}

	protected handlePeerLeft(peerId: string) {
		// Responder logic for when a peer leaves (usually its own server connection closing handles this)
	}

	protected async handleOffer(
		offer: RTCSessionDescriptionInit,
		fromPeerId: string,
	) {
		console.log(`[Responder] Handling offer from ${fromPeerId}`)
		this.initializeConnectionAndChannel()
		if (!this.connection) {
			throw new Error('Connection is not initialized')
		}
		await this.connection.setRemoteDescription(offer)
		await this.processCandidatesQueue()
		console.log('[Responder] Creating answer')
		const answer = await this.connection.createAnswer()
		await this.setAndShareLocalDescription(answer, fromPeerId)
	}

	protected handleAnswer(
		answer: RTCSessionDescriptionInit,
		fromPeerId: string,
	): void {
		// Responder does not handle answers
	}
}
