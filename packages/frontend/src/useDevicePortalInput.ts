import { useEffect, useRef, useState } from 'react'
import { Initiator } from './webrtc/Initiator'

// @TODO: warn if one room is used by multiple useDevicePortalInput hooks more than once at the same time

export const useDevicePortalInput = (
	room: string,
	value: string,
	options: {
		websocketSignalingServer: string
		onValueFromOutput?: (value: string) => void
		maxClients?: number
	},
) => {
	const [initiator, setInitiator] = useState<Initiator | null>(null)
	const onValueFromOutputRef = useRef(options.onValueFromOutput)
	onValueFromOutputRef.current = options.onValueFromOutput

	useEffect(() => {
		const initiator = new Initiator(room, {
			onValue: (value) => {
				onValueFromOutputRef.current?.(value)
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
