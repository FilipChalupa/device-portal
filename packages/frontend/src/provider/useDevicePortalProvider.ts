import { useEffect, useRef, useState } from 'react'
import { Initiator } from '../webrtc/Initiator'

// @TODO: warn if one room is used by multiple useDevicePortalProvider hooks more than once at the same time

export const useDevicePortalProvider = (
	room: string,
	value: string,
	options: {
		websocketSignalingServer?: string
		onValueFromConsumer?: (value: string) => void
		maxClients?: number
	} = {},
) => {
	const [initiator, setInitiator] = useState<Initiator | null>(null)
	const onValueFromConsumerRef = useRef(options.onValueFromConsumer)
	onValueFromConsumerRef.current = options.onValueFromConsumer

	useEffect(() => {
		const initiator = new Initiator(room, {
			onValue: (value) => {
				onValueFromConsumerRef.current?.(value)
			},
			websocketSignalingServer: options.websocketSignalingServer,
			maxClients: options.maxClients,
		})
		setInitiator(initiator)

		return () => {
			initiator.destroy()
			setInitiator(null)
		}
	}, [room, options.websocketSignalingServer, options.maxClients])

	useEffect(() => {
		initiator?.send(value)
	}, [value, initiator])
}
