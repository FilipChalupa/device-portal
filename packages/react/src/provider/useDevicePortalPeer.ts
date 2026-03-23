import { Provider, type PeerId } from '@device-portal/client'
import { useEffect, useRef } from 'react'

export type PeerOptions = {
	value?: string
	onMessageFromConsumer?: (value: string) => void
}

export const useDevicePortalPeer = (
	provider: Provider,
	peerId: PeerId,
	options: PeerOptions = {},
) => {
	const onMessageFromConsumerRef = useRef(options.onMessageFromConsumer)
	onMessageFromConsumerRef.current = options.onMessageFromConsumer

	useEffect(() => {
		const unsubscribe = provider.addPeerListener(peerId, (value) => {
			onMessageFromConsumerRef.current?.(value)
		})

		return unsubscribe
	}, [provider, peerId])

	useEffect(() => {
		if (options.value === undefined) {
			return
		}
		provider.sendToPeer(peerId, options.value)
	}, [provider, peerId, options.value])
}
