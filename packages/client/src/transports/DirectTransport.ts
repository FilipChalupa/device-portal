import { PeerId, SignalingMessage, SignalingMessageSchema } from '../constants'

/**
 * Options for direct browser signaling, bypassing the signaling server for peers in the same browser.
 *
 * - `true`: (Default) Enables direct signaling via `BroadcastChannel` (for different tabs/windows)
 *   and an internal event bus (for the same tab).
 * - `'same-window-only'`: Only enables signaling via the internal event bus for the same tab.
 * - `false`: Disables all direct signaling, forcing all communication through the signaling server.
 */
export type BrowserDirectOption = boolean | 'same-window-only'

const sameTabBus = new EventTarget()

export type DirectTransportCallbacks = {
	onPeerJoined: (peerId: PeerId) => void
	onPeerLeft: (peerId: PeerId) => void
	onMessage: (data: string, from: PeerId) => void
}

export class DirectTransport {
	private sendBroadcastChannel: BroadcastChannel | null = null
	private listenBroadcastChannel: BroadcastChannel | null = null
	private seenMessageIds = new Set<string>()
	private isDestroyed = false
	readonly directPeers = new Set<PeerId>()

	constructor(
		private readonly room: string,
		private readonly role: 'provider' | 'consumer',
		private readonly peerId: PeerId,
		private readonly browserDirect: BrowserDirectOption,
		private readonly callbacks: DirectTransportCallbacks,
	) {}

	private get sendChannelName() {
		return `device-portal-room-${this.room}-${this.role === 'provider' ? 'i2r' : 'r2i'}`
	}

	private get listenChannelName() {
		return `device-portal-room-${this.room}-${this.role === 'provider' ? 'r2i' : 'i2r'}`
	}

	start() {
		if (this.browserDirect === true && 'window' in globalThis) {
			this.sendBroadcastChannel = new BroadcastChannel(this.sendChannelName)
			this.listenBroadcastChannel = new BroadcastChannel(
				this.listenChannelName,
			)
			this.listenBroadcastChannel.onmessage = (event) => {
				this.handleMessage(event.data)
			}
		}

		sameTabBus.addEventListener(
			`message:${this.listenChannelName}`,
			this.handleSameTabMessage,
		)

		this.announce()
	}

	private announce() {
		this.sendSignaling({
			type: 'direct-discovery',
			from: this.peerId,
		})
	}

	private handleSameTabMessage = (event: Event) => {
		this.handleMessage((event as CustomEvent).detail)
	}

	private handleMessage(data: unknown) {
		const result = SignalingMessageSchema.safeParse(data)
		if (!result.success) {
			return
		}

		const message: SignalingMessage = result.data

		if (message.id && this.seenMessageIds.has(message.id)) {
			return
		}
		if (message.id) {
			this.seenMessageIds.add(message.id)
			if (this.seenMessageIds.size > 1000) {
				const idsToKeep = [...this.seenMessageIds].slice(-500)
				this.seenMessageIds = new Set(idsToKeep)
			}
		}

		if ('from' in message && message.from === this.peerId) {
			return
		}

		switch (message.type) {
			case 'direct-discovery': {
				const fromPeerId = message.from
				const isNew = !this.directPeers.has(fromPeerId)
				this.directPeers.add(fromPeerId)

				if (isNew) {
					console.log(
						`[DirectTransport] Discovered direct peer: ${fromPeerId}`,
					)
					this.callbacks.onPeerJoined(fromPeerId)
				}

				// Respond to broadcasts (no 'to' field)
				if (!message.to) {
					this.sendSignaling({
						type: 'direct-discovery',
						from: this.peerId,
						to: fromPeerId,
					})
				}
				break
			}
			case 'direct-message':
				if (!message.to || message.to === this.peerId) {
					this.callbacks.onMessage(message.data, message.from)
				}
				break
			case 'peer-left': {
				const leftPeerId = message.data.peerId
				if (this.directPeers.delete(leftPeerId)) {
					this.callbacks.onPeerLeft(leftPeerId)
				}
				break
			}
		}
	}

	sendSignaling(message: Record<string, unknown>) {
		const msg = { ...message } as Record<string, unknown> & { id?: string }
		if (!msg.id) {
			msg.id = crypto.randomUUID()
		}
		msg.room = this.room
		if (this.seenMessageIds.has(msg.id)) return
		this.seenMessageIds.add(msg.id)

		if (this.sendBroadcastChannel) {
			this.sendBroadcastChannel.postMessage(msg)
		}
		sameTabBus.dispatchEvent(
			new CustomEvent(`message:${this.sendChannelName}`, {
				detail: msg,
			}),
		)
	}

	sendMessage(data: string, to?: PeerId | null) {
		this.sendSignaling({
			type: 'direct-message',
			from: this.peerId,
			data,
			to: to ?? null,
		})
	}

	destroy() {
		this.isDestroyed = true
		if (this.sendBroadcastChannel) {
			this.sendBroadcastChannel.close()
			this.sendBroadcastChannel = null
		}
		if (this.listenBroadcastChannel) {
			this.listenBroadcastChannel.close()
			this.listenBroadcastChannel = null
		}
		sameTabBus.removeEventListener(
			`message:${this.listenChannelName}`,
			this.handleSameTabMessage,
		)
	}
}
