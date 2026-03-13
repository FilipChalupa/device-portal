import { useEffect, useRef, useState } from 'react'
import { Initiator, type PeerId } from '@device-portal/client'

// @TODO: warn if one room is used by multiple useDevicePortalProvider hooks more than once at the same time

export type DevicePortalProviderOptions = {
	value?: string
	websocketSignalingServer?: string
	onMessageFromConsumer?: (value: string, peerId: PeerId) => void
	maxClients?: number
	localDeviceOnly?: boolean
}

export const useDevicePortalProvider = (
	room: string,
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
			localDeviceOnly: options.localDeviceOnly,
		})
		setInitiator(initiator)
		setPeers(initiator.peers)

		return () => {
			initiator.destroy()
			setInitiator(null)
			setPeers([])
		}
	}, [
		room,
		options.websocketSignalingServer,
		options.maxClients,
		options.localDeviceOnly,
	])

	useEffect(() => {
		if (options.value === undefined) {
			return
		}
		initiator?.send(options.value)
	}, [options.value, initiator])

	return { peers, initiator }
}
