import { subscribeToGroup, type GroupRoom } from '@device-portal/client'
import { useEffect, useState } from 'react'

export type UseGroupRoomsOptions = {
	/** URL of the signaling server. Defaults to the public example server. */
	webSocketSignalingServer?: string
}

/**
 * Subscribes to the live list of rooms a signaling server lists under
 * `group`. Rooms appear when their provider was created with the same `group`
 * and disappear as soon as that provider disconnects.
 *
 * `Meta` types the `meta` the providers publish. It is not validated — the
 * server relays whatever a provider sent, so treat it as untrusted input.
 *
 * @returns `rooms` — `null` until the first list arrives, then the current
 *   list; `isConnected` — whether the subscription socket is up.
 */
export const useGroupRooms = <Meta = unknown>(
	group: string,
	options: UseGroupRoomsOptions = {},
) => {
	const [rooms, setRooms] = useState<GroupRoom<Meta>[] | null>(null)
	const [isConnected, setIsConnected] = useState(false)

	useEffect(() => {
		setRooms(null)
		setIsConnected(false)
		const unsubscribe = subscribeToGroup<Meta>(group, {
			webSocketSignalingServer: options.webSocketSignalingServer,
			onRooms: (rooms) => {
				setRooms(rooms)
				setIsConnected(true)
			},
			onDisconnected: () => {
				setIsConnected(false)
			},
		})
		return unsubscribe
	}, [group, options.webSocketSignalingServer])

	return { rooms, isConnected }
}
