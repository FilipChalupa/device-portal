import { useEffect, useRef, useState } from 'react'
import { Initiator } from '../webrtc/Initiator'
import { PeerId } from '../webrtc/PeerId'

// @TODO: warn if one room is used by multiple useDevicePortalProvider hooks more than once at the same time

export type DevicePortalProviderOptions = {
	websocketSignalingServer?: string
	onMessageFromConsumer?: (value: string, peerId: PeerId) => void
	maxClients?: number
}

export const useDevicePortalProvider = (
	room: string,
	value: string,
	options: DevicePortalProviderOptions = {},
) => {
	const [initiator, setInitiator] = useState<Initiator | null>(null)
	const [peers, setPeers] = useState<PeerId[]>([])
	const onMessageFromConsumerRef = useRef(options.onMessageFromConsumer)
	onMessageFromConsumerRef.current = options.onMessageFromConsumer

	useEffect(() => {
		const initiator = new Initiator(room, {
			onMessage: (value, peerId) => {
				onMessageFromConsumerRef.current?.(value, peerId)
			},
			onPeersChange: (peers) => {
				setPeers(peers)
			},
			websocketSignalingServer: options.websocketSignalingServer,
			maxClients: options.maxClients,
		})
		setInitiator(initiator)
		setPeers(initiator.peers)

		return () => {
			initiator.destroy()
			setInitiator(null)
			setPeers([])
		}
	}, [room, options.websocketSignalingServer, options.maxClients])

	useEffect(() => {
		initiator?.send(value)
	}, [value, initiator])

	return { peers, initiator }
}
