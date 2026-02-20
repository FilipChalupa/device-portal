import { useEffect, useRef } from 'react'
import { Initiator } from '../webrtc/Initiator'

export const useDevicePortalPeer = (
	initiator: Initiator,
	peerId: string,
	value?: string,
	options: {
		onValueFromConsumer?: (value: string) => void
	} = {},
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
		if (value !== undefined) {
			initiator.sendToPeer(peerId, value)
		}
	}, [initiator, peerId, value])
}
