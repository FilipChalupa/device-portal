import { Peer } from './Peer'
import { PeerId } from './PeerId'

export class Responder extends Peer {
	protected role = 'responder' as const
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null

	protected onConnected(): void {
		// Responder waits for an offer
		this.startReconnectionTimer()
	}

	protected handlePeerJoined(peerId: PeerId) {
		// Responder does not need to do anything when a peer joins, it waits for an offer
	}

	protected handlePeerLeft(peerId: PeerId) {
		// Responder logic for when a peer leaves
		console.log(`[Responder] Peer ${peerId} left`)
		this.startReconnectionTimer()
	}

	private startReconnectionTimer() {
		if (this.reconnectTimeout || this.isDestroyed) {
			return
		}
		console.log('[Responder] Starting reconnection timer...')
		this.reconnectTimeout = setTimeout(() => {
			this.reconnectTimeout = null
			if (this.isDestroyed) {
				return
			}
			if (
				!this.connection ||
				this.connection.iceConnectionState === 'failed' ||
				this.connection.iceConnectionState === 'disconnected' ||
				this.connection.iceConnectionState === 'closed'
			) {
				console.log('[Responder] Attempting to re-join room for reconnection...')
				this.socket?.send(
					JSON.stringify({ type: 'join-room', room: this.room }),
				)
				this.startReconnectionTimer() // Schedule next attempt if it still fails
			}
		}, 3000)
	}

	private stopReconnectionTimer() {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			this.reconnectTimeout = null
		}
	}

	protected async handleOffer(
		offer: RTCSessionDescriptionInit,
		fromPeerId: PeerId,
	) {
		console.log(`[Responder] Handling offer from ${fromPeerId}`)
		this.stopReconnectionTimer()
		this.initializeConnectionAndChannel()
		if (!this.connection) {
			throw new Error('Connection is not initialized')
		}

		this.connection.oniceconnectionstatechange = () => {
			console.log(
				`[Responder] ICE connection state: ${this.connection?.iceConnectionState}`,
			)
			if (
				this.connection?.iceConnectionState === 'failed' ||
				this.connection?.iceConnectionState === 'disconnected' ||
				this.connection?.iceConnectionState === 'closed'
			) {
				this.startReconnectionTimer()
			} else if (
				this.connection?.iceConnectionState === 'connected' ||
				this.connection?.iceConnectionState === 'completed'
			) {
				this.stopReconnectionTimer()
			}
		}

		await this.connection.setRemoteDescription(offer)
		await this.processCandidatesQueue()
		console.log('[Responder] Creating answer')
		const answer = await this.connection.createAnswer()
		await this.setAndShareLocalDescription(answer, fromPeerId)
	}

	public destroy() {
		this.stopReconnectionTimer()
		super.destroy()
	}

	protected handleAnswer(
		answer: RTCSessionDescriptionInit,
		fromPeerId: PeerId,
	): void {
		// Responder does not handle answers
	}
}
