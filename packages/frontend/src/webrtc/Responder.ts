import { Peer } from './Peer'

export class Responder extends Peer {
	protected role = 'responder' as const

	protected connect(): Promise<void> {
		// The connection is initiated from the Peer class
		// The responder waits for an offer
		return Promise.resolve()
	}

	protected async handleOffer(offer: RTCSessionDescriptionInit) {
		if (!this.connection) {
			this.initializeConnectionAndChannel()
		}
		if (!this.connection) {
			throw new Error('Connection is not initialized')
		}
		await this.connection.setRemoteDescription(offer)
		const answer = await this.connection.createAnswer()
		await this.setAndShareLocalDescription(answer)
	}

	protected handleAnswer(answer: RTCSessionDescriptionInit): void {
		// Responder does not handle answers
	}
}
