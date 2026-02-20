import { useEffect, useRef } from 'react'
import { Initiator } from '../webrtc/Initiator'
import { PeerId } from '../webrtc/PeerId'

export type PeerOptions = {
	value?: string
	onValueFromConsumer?: (value: string) => void
}

export const useDevicePortalPeer = (
	initiator: Initiator,
	peerId: PeerId,
	options: PeerOptions = {},
) => {
	const onValueFromConsumerRef = useRef(options.onValueFromConsumer)
	onValueFromConsumerRef.current = options.onValueFromConsumer

	useEffect(() => {
		const unsubscribe = initiator.addPeerListener(peerId, (value) => {
			onValueFromConsumerRef.current?.(value)
		})

		return unsubscribe
	}, [initiator, peerId])

	useEffect(() => {
		if (options.value !== undefined) {
			initiator.sendToPeer(peerId, options.value)
		}
	}, [initiator, peerId, options.value])
}
