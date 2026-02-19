import { Peer } from './Peer'

export class Initiator extends Peer {
	protected role = 'initiator' as const

	protected async connect(): Promise<void> {
		if (!this.connection) {
			this.initializeConnectionAndChannel()
		}
		if (!this.connection) {
			throw new Error('Connection is not initialized')
		}
		const offer = await this.connection.createOffer()
		await this.setAndShareLocalDescription(offer)
	}

	protected handleOffer(offer: RTCSessionDescriptionInit): void {
		// Initiator does not handle offers
	}

	protected async handleAnswer(answer: RTCSessionDescriptionInit) {
		if (this.connection) {
			await this.connection.setRemoteDescription(answer)
		}
	}
}
