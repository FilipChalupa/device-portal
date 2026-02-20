import { useEffect, useRef } from 'react'
import { Initiator } from '../webrtc/Initiator'
import { PeerId } from '../webrtc/PeerId'

export type PeerOptions = {
	value?: string
	onMessageFromConsumer?: (value: string) => void
}

export const useDevicePortalPeer = (
	initiator: Initiator,
	peerId: PeerId,
	options: PeerOptions = {},
) => {
	const onMessageFromConsumerRef = useRef(options.onMessageFromConsumer)
	onMessageFromConsumerRef.current = options.onMessageFromConsumer

	useEffect(() => {
		const unsubscribe = initiator.addPeerListener(peerId, (value) => {
			onMessageFromConsumerRef.current?.(value)
		})

		return unsubscribe
	}, [initiator, peerId])

	useEffect(() => {
		if (options.value !== undefined) {
			initiator.sendToPeer(peerId, options.value)
		}
	}, [initiator, peerId, options.value])
}
